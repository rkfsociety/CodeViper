import Anthropic from '@anthropic-ai/sdk'
import type {
  ModelProvider,
  ChatOptions,
  ChatChunk,
  LoadedModel,
  ModelPlacement
} from '../../../shared/modelProvider'

/** Ephemeral prompt cache — system + tools кэшируются между шагами ReAct (−90% стоимости чтения). */
const CACHE_CONTROL_EPHEMERAL: Anthropic.CacheControlEphemeral = { type: 'ephemeral' }

export class ClaudeProvider implements ModelProvider {
  private client: Anthropic

  constructor(
    apiKey: string,
    private modelName: string
  ) {
    this.client = new Anthropic({ apiKey })
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.models.retrieve(this.modelName)
      return true
    } catch {
      return false
    }
  }

  async listModels(): Promise<LoadedModel[]> {
    try {
      const response = await this.client.models.list()
      return response.data.map((model) => ({
        name: model.id,
        contextLength: model.max_input_tokens ?? undefined
      }))
    } catch {
      return []
    }
  }

  async *chat(options: ChatOptions): AsyncGenerator<ChatChunk> {
    // Преобразование сообщений из стандартного формата в формат Claude
    const messages = this.convertMessages(options.messages)

    // Система сообщение — отдельный параметр
    const systemMessages = options.messages.filter((m) => m.role === 'system')
    const systemPrompt = systemMessages
      .map((m) => m.content)
      .join('\n')
      .trim()

    // Преобразование инструментов; cache_control на последнем tool кэширует весь каталог ~70 tools
    const tools = options.tools?.map((tool, index, toolsList) => {
      const inputSchema = (tool.input_schema as Record<string, unknown>) || {
        type: 'object' as const,
        properties: {}
      }
      // Убедимся, что есть required type для JSON schema
      if (!('type' in inputSchema)) {
        inputSchema.type = 'object'
      }
      const isLastTool = index === toolsList.length - 1
      return {
        name: tool.name,
        description: tool.description || '',
        input_schema: inputSchema as Anthropic.Tool['input_schema'],
        ...(isLastTool && { cache_control: CACHE_CONTROL_EPHEMERAL })
      }
    })

    const requestParams: Anthropic.Messages.MessageCreateParamsStreaming = {
      model: options.model || this.modelName,
      max_tokens: options.max_tokens || 4096,
      ...(options.temperature !== undefined && { temperature: options.temperature }),
      ...(options.top_p !== undefined && { top_p: options.top_p }),
      ...(systemPrompt && {
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: CACHE_CONTROL_EPHEMERAL
          }
        ]
      }),
      ...(tools && tools.length > 0 && { tools }),
      stream: true,
      messages
    }

    try {
      const stream = await this.client.messages.stream(requestParams)

      let toolUseAccumulator: Record<
        string,
        { id: string; name: string; input: Record<string, unknown> }
      > = {}

      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          // Инициализация tool use
          if (event.content_block.type === 'tool_use') {
            toolUseAccumulator[event.index] = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: {}
            }
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            // Выдаём текст как есть
            yield {
              content: event.delta.text,
              model: options.model || this.modelName
            }
          } else if (event.delta.type === 'input_json_delta') {
            // Аккумулируем input для tool use (не выдаём промежуточные chunks)
            const idx = event.index
            if (toolUseAccumulator[idx]) {
              try {
                const partial = JSON.parse(event.delta.partial_json)
                if (partial && typeof partial === 'object') {
                  toolUseAccumulator[idx].input = partial
                }
              } catch {
                // Пропускаем неполные JSON
              }
            }
          }
        } else if (event.type === 'message_start') {
          // usage.cache_read_input_tokens > 0 на 2-й итерации ReAct — признак prompt cache hit
        } else if (event.type === 'message_delta') {
          // Финальное событие с usage и stop_reason
          if (event.delta.stop_reason) {
            const chunks = Object.values(toolUseAccumulator)
            const inputTokens = event.usage?.input_tokens ?? 0
            const outputTokens = event.usage?.output_tokens ?? 0
            const cacheReadTokens =
              (event.usage as unknown as Record<string, number> | undefined)
                ?.cache_read_input_tokens ?? 0
            const totalTokens = inputTokens && outputTokens ? inputTokens + outputTokens : undefined

            if (chunks.length > 0 && event.delta.stop_reason === 'tool_use') {
              yield {
                content: '',
                tool_calls: chunks.map((chunk) => ({
                  id: chunk.id,
                  type: 'function' as const,
                  function: {
                    name: chunk.name,
                    arguments: JSON.stringify(chunk.input)
                  }
                })),
                stop_reason: event.delta.stop_reason,
                model: options.model || this.modelName,
                total_tokens: totalTokens,
                input_tokens: inputTokens || undefined,
                output_tokens: outputTokens || undefined,
                cache_read_tokens: cacheReadTokens || undefined
              }
            } else if (totalTokens) {
              yield {
                content: '',
                stop_reason: event.delta.stop_reason,
                model: options.model || this.modelName,
                total_tokens: totalTokens,
                input_tokens: inputTokens || undefined,
                output_tokens: outputTokens || undefined,
                cache_read_tokens: cacheReadTokens || undefined
              }
            }
          }
        } else if (event.type === 'message_stop') {
          // Конец потока
          toolUseAccumulator = {}
        }
      }
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Claude API error ${error.status}: ${error.message}`)
      }
      throw error
    }
  }

  async getModelPlacement(): Promise<ModelPlacement> {
    return 'unknown'
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private convertMessages(messages: ChatOptions['messages']): Anthropic.MessageParam[] {
    return messages
      .filter((msg) => msg.role !== 'system') // System messages обрабатываются отдельно
      .map((msg) => {
        const content: Array<Anthropic.ContentBlockParam> = []

        // Текстовое содержимое
        if (msg.content) {
          content.push({ type: 'text', text: msg.content })
        }

        // Tool calls от ассистента
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const call of msg.tool_calls) {
            content.push({
              type: 'tool_use',
              id: call.id,
              name: call.function.name,
              input: JSON.parse(call.function.arguments)
            })
          }
        }

        const param: Anthropic.MessageParam = {
          role: msg.role === 'tool' ? 'user' : (msg.role as 'user' | 'assistant'),
          content:
            msg.role === 'tool'
              ? [
                  {
                    type: 'tool_result',
                    tool_use_id: msg.tool_call_id || '',
                    content: msg.content || ''
                  }
                ]
              : (content as Anthropic.ContentBlockParam[])
        }

        return param
      })
  }
}
