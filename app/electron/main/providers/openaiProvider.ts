import type {
  ModelProvider,
  ChatOptions,
  ChatChunk,
  LoadedModel,
  ModelPlacement
} from '../../../shared/modelProvider'

export class OpenAIProvider implements ModelProvider {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private modelName: string,
    private extraHeaders: Record<string, string> = {},
    /** Полный URL для GET-запроса списка моделей (переопределяет дефолтный /models) */
    private listModelsUrl?: string
  ) {}

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

  async *chat(options: ChatOptions): AsyncGenerator<ChatChunk> {
    const url = this.baseUrl.replace(/\/$/, '')
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
      const m: Record<string, unknown> = {
        role: msg.role,
        // OpenAI spec: content должен быть null (не "") для assistant-сообщений с tool_calls
        content: msg.tool_calls?.length && !msg.content ? null : (msg.content ?? null)
      }
      if (msg.tool_calls?.length) {
        m.tool_calls = msg.tool_calls
      }
      if (msg.tool_call_id) {
        m.tool_call_id = msg.tool_call_id
      }
      return m
    })

    const body = {
      model: options.model || this.modelName,
      stream: true,
      messages: mappedMessages,
      temperature: options.temperature,
      top_p: options.top_p,
      max_tokens: options.max_tokens,
      tools: openAiTools,
      tool_choice: toolChoice
    } as Record<string, unknown>

    // Некоторые OpenAI-совместимые API (DeepSeek, др.) поддерживают thinking
    // для моделей с расширенными возможностями (о1, о3, r1)
    const modelName = options.model || this.modelName
    if (modelName && /^(o1|o3|deepseek-r1|qwq)/.test(modelName)) {
      body.reasoning_effort = 'medium'
    }

    const res = await fetch(`${url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...this.extraHeaders
      },
      body: JSON.stringify(body),
      signal: options.signal
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      let detail = body
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } }
        if (parsed?.error?.message) detail = parsed.error.message
      } catch {
        /* keep raw body */
      }
      throw new Error(`OpenAI API error ${res.status}: ${detail}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    // Аккумулятор нативных tool calls из стриминга (OpenAI формат — delta по index).
    type AccToolCall = { id: string; name: string; arguments: string }
    const accToolCalls: AccToolCall[] = []
    let toolCallsYielded = false

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue

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
              usage?: { total_tokens?: number }
            }
            const choice = chunk.choices?.[0]
            const delta = choice?.delta
            if (!delta) continue

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
              model: options.model || this.modelName
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

            // Некоторые стриминговые ответы включают usage прямо в chunk
            if (chunk.usage?.total_tokens) {
              chatChunk.total_tokens = chunk.usage.total_tokens
            }

            yield chatChunk
          } catch {
            // skip malformed JSON
          }
        }
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
          yield { content: '', tool_calls: assembled }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  // OpenAI API не предоставляет информацию о размещении модели
  async getModelPlacement(): Promise<ModelPlacement> {
    return 'unknown'
  }
}
