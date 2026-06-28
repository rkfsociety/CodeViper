import type {
  ModelProvider,
  ChatOptions,
  ChatChunk,
  LoadedModel,
  ModelPlacement
} from '../../../shared/modelProvider'
import { throwProviderHttpError } from '../../../shared/providerErrors'
import { StreamingChatProvider, type ChunkParser, type FetchInit } from './streamingChatProvider'

/** OpenAI-совместимый endpoint (LM Studio, vLLM, локальный прокси). */
export function createOpenAiCompatibleProvider(
  baseUrl: string,
  apiKey: string,
  modelName: string
): OpenAIProvider {
  return new OpenAIProvider(baseUrl.replace(/\/$/, ''), apiKey, modelName)
}

export class OpenAIProvider extends StreamingChatProvider implements ModelProvider {
  /** Exponential backoff при HTTP 429: 1 с → 2 с → 4 с → 8 с. */
  protected override readonly BACKOFF_MS = [1000, 2000, 4000, 8000]

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private modelName: string,
    private extraHeaders: Record<string, string> = {},
    /** Полный URL для GET-запроса списка моделей (переопределяет дефолтный /models) */
    private listModelsUrl?: string
  ) {
    super()
  }

  protected override buildRequest(options: ChatOptions): { url: string; init: FetchInit } {
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`

    // ChatOptions использует Anthropic-формат { name, description, input_schema }.
    // OpenAI-совместимые API (DeepSeek и др.) ожидают { type, function: { name, description, parameters } }.
    const openAiTools = options.tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema
      }
    }))

    // DeepSeek и OpenAI v2 поддерживают 'required'; другие провайдеры понимают 'auto'.
    const toolChoice = options.tool_choice ?? 'auto'

    // Маппинг сообщений с поддержкой нативных tool calls (assistant) и tool results (tool_call_id).
    const mappedMessages = options.messages.map((msg) => {
      const hasImages = msg.role === 'user' && msg.images?.length

      const m: Record<string, unknown> = {
        role: msg.role,
        // Если есть изображения — контент становится массивом content parts
        content: hasImages
          ? [
              ...(msg.content ? [{ type: 'text', text: msg.content }] : []),
              ...(msg.images ?? []).map((img) => ({
                type: 'image_url',
                image_url: { url: img.dataUrl }
              }))
            ]
          : msg.tool_calls?.length && !msg.content
            ? null
            : (msg.content ?? null)
      }
      if (msg.tool_calls?.length) {
        m.tool_calls = msg.tool_calls
      }
      if (msg.tool_call_id) {
        m.tool_call_id = msg.tool_call_id
      }
      return m
    })

    const body: Record<string, unknown> = {
      model: options.model || this.modelName,
      stream: true,
      stream_options: { include_usage: true },
      messages: mappedMessages,
      temperature: options.temperature,
      top_p: options.top_p,
      max_tokens: options.max_tokens,
      tools: openAiTools,
      tool_choice: toolChoice
    }

    // Некоторые OpenAI-совместимые API (DeepSeek, др.) поддерживают thinking
    // для моделей с расширенными возможностями (о1, о3, r1)
    const modelName = options.model || this.modelName
    if (modelName && /^(o1|o3|deepseek-r1|qwq)/.test(modelName)) {
      body.reasoning_effort = 'medium'
    }

    return {
      url,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...this.extraHeaders
        },
        body: JSON.stringify(body)
      }
    }
  }

  protected override createChunkParser(options: ChatOptions): ChunkParser {
    // Аккумулятор нативных tool calls из стриминга (OpenAI формат — delta по index).
    type AccToolCall = { id: string; name: string; arguments: string }
    const accToolCalls: AccToolCall[] = []
    let toolCallsYielded = false
    let inputTokens = 0
    let outputTokens = 0
    let totalTokens: number | undefined
    const modelName = options.model || this.modelName

    return {
      parse(line: string): ChatChunk | null {
        if (!line.startsWith('data: ')) return null
        const data = line.slice(6).trim()
        if (data === '[DONE]') return null

        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string
                reasoning?: string
                thinking?: string
                tool_calls?: Array<{
                  index: number
                  id?: string
                  type?: string
                  function?: { name?: string; arguments?: string }
                }>
              }
              finish_reason?: string | null
            }>
            usage?: {
              total_tokens?: number
              prompt_tokens?: number
              completion_tokens?: number
            }
          }
          const choice = chunk.choices?.[0]
          const delta = choice?.delta

          if (chunk.usage && !delta) {
            if (chunk.usage.prompt_tokens != null) inputTokens = chunk.usage.prompt_tokens
            if (chunk.usage.completion_tokens != null) outputTokens = chunk.usage.completion_tokens
            if (chunk.usage.total_tokens != null) totalTokens = chunk.usage.total_tokens
            return {
              content: '',
              model: modelName,
              total_tokens:
                totalTokens ??
                (inputTokens + outputTokens > 0 ? inputTokens + outputTokens : undefined),
              input_tokens: inputTokens || undefined,
              output_tokens: outputTokens || undefined
            }
          }

          if (!delta) return null

          // Накапливаем delta.tool_calls по индексу
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (!accToolCalls[tc.index]) {
                accToolCalls[tc.index] = { id: tc.id ?? '', name: '', arguments: '' }
              }
              const acc = accToolCalls[tc.index]
              if (tc.id) acc.id = tc.id
              if (tc.function?.name) acc.name += tc.function.name
              if (tc.function?.arguments) acc.arguments += tc.function.arguments
            }
          }

          // Конвертируем в единый формат ChatChunk
          const chatChunk: ChatChunk = {
            content: delta.content ?? '',
            stop_reason: choice?.finish_reason ?? undefined,
            model: modelName
          }

          // Некоторые провайдеры могут передавать thinking в delta
          if (delta.reasoning) {
            chatChunk.thinking = delta.reasoning
          } else if (delta.thinking) {
            chatChunk.thinking = delta.thinking
          }

          // При завершении с tool_calls — выдаём финальный чанк с накопленными вызовами
          if (choice?.finish_reason === 'tool_calls' && accToolCalls.length > 0) {
            const assembled = accToolCalls
              .filter((tc) => tc.id && tc.name)
              .map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: { name: tc.name, arguments: tc.arguments }
              }))
            if (assembled.length > 0) {
              chatChunk.tool_calls = assembled
              toolCallsYielded = true
            }
          }

          // Usage приходит в финальном chunk при stream_options.include_usage
          if (chunk.usage) {
            if (chunk.usage.prompt_tokens != null) inputTokens = chunk.usage.prompt_tokens
            if (chunk.usage.completion_tokens != null) outputTokens = chunk.usage.completion_tokens
            if (chunk.usage.total_tokens != null) totalTokens = chunk.usage.total_tokens
            if (inputTokens > 0 || outputTokens > 0) {
              chatChunk.input_tokens = inputTokens
              chatChunk.output_tokens = outputTokens
              chatChunk.total_tokens =
                totalTokens ??
                (inputTokens + outputTokens > 0 ? inputTokens + outputTokens : undefined)
            }
          }

          return chatChunk
        } catch {
          return null
        }
      },

      finalize(): ChatChunk[] {
        const trailing: ChatChunk[] = []
        if (inputTokens > 0 || outputTokens > 0 || totalTokens != null) {
          trailing.push({
            content: '',
            model: modelName,
            total_tokens:
              totalTokens ??
              (inputTokens + outputTokens > 0 ? inputTokens + outputTokens : undefined),
            input_tokens: inputTokens || undefined,
            output_tokens: outputTokens || undefined
          })
        }
        // Fallback: стрим закончился без finish_reason='tool_calls', но tool_calls накоплены
        if (!toolCallsYielded && accToolCalls.length > 0) {
          const assembled = accToolCalls
            .filter((tc) => tc.id && tc.name)
            .map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.arguments }
            }))
          if (assembled.length > 0) {
            trailing.push({ content: '', tool_calls: assembled })
          }
        }
        return trailing
      }
    }
  }

  protected override handleHttpError(status: number, body: string): never {
    let detail = body
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } }
      if (parsed?.error?.message) detail = parsed.error.message
    } catch {
      /* keep raw body */
    }
    throwProviderHttpError(status, detail)
  }

  async ping(signal?: AbortSignal): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}`, ...this.extraHeaders },
        signal: signal || AbortSignal.timeout(5_000)
      })
      return res.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<LoadedModel[]> {
    try {
      const url = this.listModelsUrl ?? `${this.baseUrl}/models`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiKey}`, ...this.extraHeaders }
      })
      if (!res.ok) return []

      const data = (await res.json()) as {
        data?: Array<{
          id?: string
          slug?: string
          name?: string
          context_length?: number
          context_length_tokens?: number
        }>
      }
      return (data.data ?? [])
        .map((item) => {
          const name = item.id || item.slug || item.name || ''
          const contextLength = item.context_length ?? item.context_length_tokens
          return name ? { name, contextLength } : null
        })
        .filter(Boolean) as LoadedModel[]
    } catch {
      return []
    }
  }

  // OpenAI API не предоставляет информацию о размещении модели
  async getModelPlacement(): Promise<ModelPlacement> {
    return 'unknown'
  }
}
