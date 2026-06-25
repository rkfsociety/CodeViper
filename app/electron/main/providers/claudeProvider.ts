import type {
  ModelProvider,
  ChatOptions,
  ChatChunk,
  LoadedModel,
  ModelPlacement
} from '../../../shared/modelProvider'
import { StreamingChatProvider, type ChunkParser, type FetchInit } from './streamingChatProvider'

const ANTHROPIC_API_URL = 'https://api.anthropic.com'
const CACHE_EPHEMERAL = { type: 'ephemeral' as const }

// ── Raw Anthropic request types (без SDK) ─────────────────────────────────────

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking'
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: string
  cache_control?: { type: 'ephemeral' }
}

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: AnthropicContentBlock[]
}

interface AnthropicRequest {
  model: string
  max_tokens: number
  messages: AnthropicMessage[]
  system?: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>
  tools?: Array<{
    name: string
    description: string
    input_schema: unknown
    cache_control?: { type: 'ephemeral' }
  }>
  stream: true
  temperature?: number
  top_p?: number
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class ClaudeProvider extends StreamingChatProvider implements ModelProvider {
  /** Exponential backoff при HTTP 429: 1 с → 2 с → 4 с → 8 с. */
  protected override readonly BACKOFF_MS = [1000, 2000, 4000, 8000]

  constructor(
    private readonly apiKey: string,
    private readonly modelName: string,
    private readonly apiUrl: string = ANTHROPIC_API_URL
  ) {
    super()
  }

  protected override buildRequest(options: ChatOptions): { url: string; init: FetchInit } {
    const messages = this.convertMessages(options.messages)

    const systemText = options.messages
      .filter((m) => m.role === 'system' && m.content)
      .map((m) => m.content!)
      .join('\n')
      .trim()

    // cache_control на последнем tool кэширует весь каталог ~70 tools (−90% стоимости чтения)
    const tools = options.tools?.map((tool, index, list) => ({
      name: tool.name,
      description: tool.description ?? '',
      input_schema: (tool.input_schema ?? { type: 'object', properties: {} }) as Record<
        string,
        unknown
      >,
      ...(index === list.length - 1 && { cache_control: CACHE_EPHEMERAL })
    }))

    const body: AnthropicRequest = {
      model: options.model || this.modelName,
      max_tokens: options.max_tokens ?? 4096,
      stream: true,
      messages,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.top_p !== undefined && { top_p: options.top_p }),
      ...(systemText && {
        system: [{ type: 'text', text: systemText, cache_control: CACHE_EPHEMERAL }]
      }),
      ...(tools?.length && { tools })
    }

    return {
      url: `${this.apiUrl}/v1/messages`,
      init: {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body)
      }
    }
  }

  protected override createChunkParser(options: ChatOptions): ChunkParser {
    type ToolMeta = { id: string; name: string }
    const toolMeta: Record<number, ToolMeta> = {}
    const toolJson: Record<number, string> = {}
    const modelName = options.model || this.modelName

    // Читается из message_start, используется в финальном чанке message_delta
    let inputTokens = 0
    let cacheReadTokens = 0

    return {
      parse(line: string): ChatChunk | null {
        if (!line.startsWith('data: ')) return null
        const raw = line.slice(6).trim()
        if (!raw || raw === '[DONE]') return null

        let event: Record<string, unknown>
        try {
          event = JSON.parse(raw) as Record<string, unknown>
        } catch {
          return null
        }

        const type = event.type as string

        if (type === 'message_start') {
          // Читаем input tokens и cache_read из message_start — в message_delta их нет
          const usage = (event.message as Record<string, unknown> | undefined)?.usage as
            | Record<string, number>
            | undefined
          inputTokens = usage?.input_tokens ?? 0
          cacheReadTokens = usage?.cache_read_input_tokens ?? 0
          return null
        }

        if (type === 'content_block_start') {
          const block = event.content_block as Record<string, unknown> | undefined
          const idx = event.index as number
          if (block?.type === 'tool_use') {
            toolMeta[idx] = { id: block.id as string, name: block.name as string }
            toolJson[idx] = ''
          }
          return null
        }

        if (type === 'content_block_delta') {
          const delta = event.delta as Record<string, unknown> | undefined
          const idx = event.index as number
          const deltaType = delta?.type as string

          if (deltaType === 'text_delta') {
            return { content: (delta?.text as string) ?? '', model: modelName }
          }
          if (deltaType === 'thinking_delta') {
            const thinkingText = (delta?.thinking as string) ?? ''
            return thinkingText ? { content: '', thinking: thinkingText, model: modelName } : null
          }
          if (deltaType === 'input_json_delta' && toolMeta[idx] !== undefined) {
            // Накапливаем строку JSON — парсить partial JSON нельзя
            toolJson[idx] = (toolJson[idx] ?? '') + ((delta?.partial_json as string) ?? '')
          }
          return null
        }

        if (type === 'message_delta') {
          const delta = event.delta as Record<string, unknown> | undefined
          const stopReason = delta?.stop_reason as string | undefined
          if (!stopReason) return null

          const outputTokens =
            (event.usage as Record<string, number> | undefined)?.output_tokens ?? 0
          const totalTokens = inputTokens + outputTokens || undefined

          const toolCallsList = Object.entries(toolMeta).map(([idxStr, tc]) => {
            const idx = parseInt(idxStr, 10)
            let args: unknown = {}
            const jsonStr = toolJson[idx] ?? ''
            if (jsonStr) {
              try {
                args = JSON.parse(jsonStr)
              } catch {
                args = {}
              }
            }
            return {
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: JSON.stringify(args) }
            }
          })

          if (toolCallsList.length > 0 && stopReason === 'tool_use') {
            return {
              content: '',
              tool_calls: toolCallsList,
              stop_reason: stopReason,
              model: modelName,
              total_tokens: totalTokens,
              input_tokens: inputTokens || undefined,
              output_tokens: outputTokens || undefined,
              cache_read_tokens: cacheReadTokens || undefined
            }
          }

          return {
            content: '',
            stop_reason: stopReason,
            model: modelName,
            total_tokens: totalTokens,
            input_tokens: inputTokens || undefined,
            output_tokens: outputTokens || undefined,
            cache_read_tokens: cacheReadTokens || undefined
          }
        }

        return null
      },

      finalize(): ChatChunk[] {
        return []
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
    throw new Error(`Claude API error ${status}: ${detail}`)
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/v1/models/${encodeURIComponent(this.modelName)}`, {
        headers: this.buildHeaders(),
        signal: AbortSignal.timeout(5_000)
      })
      return res.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<LoadedModel[]> {
    try {
      const res = await fetch(`${this.apiUrl}/v1/models`, { headers: this.buildHeaders() })
      if (!res.ok) return []
      const data = (await res.json()) as { data?: Array<{ id: string }> }
      return (data.data ?? []).map((m) => ({ name: m.id }))
    } catch {
      return []
    }
  }

  async getModelPlacement(): Promise<ModelPlacement> {
    return 'unknown'
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31'
    }
  }

  private convertMessages(messages: ChatOptions['messages']): AnthropicMessage[] {
    return messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => {
        if (msg.role === 'tool') {
          return {
            role: 'user' as const,
            content: [
              {
                type: 'tool_result' as const,
                tool_use_id: msg.tool_call_id ?? '',
                content: msg.content ?? ''
              }
            ]
          }
        }

        const content: AnthropicContentBlock[] = []

        if (msg.content) {
          content.push({ type: 'text', text: msg.content })
        }

        if (msg.tool_calls?.length) {
          for (const call of msg.tool_calls) {
            let input: unknown = {}
            try {
              input = JSON.parse(call.function.arguments)
            } catch {
              input = {}
            }
            content.push({ type: 'tool_use', id: call.id, name: call.function.name, input })
          }
        }

        return {
          role: (msg.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
          content
        }
      })
  }
}
