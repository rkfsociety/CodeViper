import type { ModelProvider, ChatOptions, ChatChunk, LoadedModel, ModelPlacement } from '../../../shared/modelProvider'

export class OpenAIProvider implements ModelProvider {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private modelName: string
  ) {}

  async ping(signal?: AbortSignal): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: signal || AbortSignal.timeout(5_000)
      })
      return res.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<LoadedModel[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      })
      if (!res.ok) return []

      const data = (await res.json()) as { data?: Array<{ id: string }> }
      return (data.data ?? []).map((item) => ({ name: item.id }))
    } catch {
      return []
    }
  }

  async *chat(options: ChatOptions): AsyncGenerator<ChatChunk> {
    const url = this.baseUrl.replace(/\/$/, '')
    const body = {
      model: options.model || this.modelName,
      stream: true,
      messages: options.messages.map((msg) => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: options.temperature,
      top_p: options.top_p,
      max_tokens: options.max_tokens,
      tools: options.tools,
      tool_choice: options.tool_choice
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
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body),
      signal: options.signal
    })

    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

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
            const chunk = JSON.parse(data)
            const delta = chunk.choices?.[0]?.delta
            if (!delta) continue

            // Конвертируем в единый формат ChatChunk
            const chatChunk: ChatChunk = {
              content: delta.content ?? '',
              stop_reason: chunk.choices?.[0]?.finish_reason,
              model: options.model || this.modelName
            }

            // Некоторые провайдеры могут передавать thinking в delta
            if (delta.reasoning) {
              chatChunk.thinking = delta.reasoning
            } else if (delta.thinking) {
              chatChunk.thinking = delta.thinking
            }

            yield chatChunk
          } catch {
            // skip malformed JSON
          }
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
