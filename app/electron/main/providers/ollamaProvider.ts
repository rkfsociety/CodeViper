import type {
  ModelProvider,
  ChatOptions,
  ChatChunk,
  LoadedModel,
  ModelPlacement
} from '../../../shared/modelProvider'
import { modelsMatch } from '../../../shared/modelRouter'

export class OllamaProvider implements ModelProvider {
  constructor(private baseUrl: string) {}

  async ping(signal?: AbortSignal): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: signal || AbortSignal.timeout(5_000)
      })
      return res.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<LoadedModel[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/ps`)
      if (!res.ok) return []

      const data = (await res.json()) as {
        models?: Array<{ name: string; size?: number; size_vram?: number }>
      }

      return (data.models ?? []).map((item) => ({
        name: item.name,
        size: item.size_vram ?? item.size
      }))
    } catch {
      return []
    }
  }

  async *chat(options: ChatOptions): AsyncGenerator<ChatChunk> {
    const url = this.baseUrl.replace(/\/$/, '')
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        stream: true,
        messages: options.messages,
        temperature: options.temperature,
        top_p: options.top_p,
        tools: options.tools,
        tool_choice: options.tool_choice,
        keep_alive: options.keep_alive ?? 5 * 60
      }),
      signal: options.signal
    })

    if (!res.ok) {
      throw new Error(`Ollama chat error: ${res.status}`)
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
          if (!line.trim()) continue
          try {
            const chunk = JSON.parse(line)
            yield {
              content: chunk.message?.content ?? '',
              thinking: chunk.message?.thinking,
              stop_reason: chunk.stop_reason,
              eval_count: chunk.eval_count,
              eval_duration: chunk.eval_duration,
              prompt_eval_count: chunk.prompt_eval_count,
              prompt_eval_duration: chunk.prompt_eval_duration,
              model: chunk.model
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer)
          yield {
            content: chunk.message?.content ?? '',
            thinking: chunk.message?.thinking,
            stop_reason: chunk.stop_reason,
            eval_count: chunk.eval_count,
            eval_duration: chunk.eval_duration,
            prompt_eval_count: chunk.prompt_eval_count,
            prompt_eval_duration: chunk.prompt_eval_duration,
            model: chunk.model
          }
        } catch {
          // skip malformed JSON
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  async getModelPlacement(model: string, signal?: AbortSignal): Promise<ModelPlacement> {
    try {
      const res = await fetch(`${this.baseUrl}/api/ps`, {
        signal: signal || AbortSignal.timeout(5_000)
      })
      if (!res.ok) return 'unknown'

      const data = (await res.json()) as {
        models?: Array<{ name: string; size?: number; size_vram?: number }>
      }
      const entry = (data.models ?? []).find((item) => modelsMatch(item.name, model))
      if (!entry || !entry.size) return 'unknown'

      const vram = entry.size_vram ?? 0
      if (vram <= 0) return 'cpu'
      if (vram >= entry.size) return 'gpu'
      return 'partial'
    } catch {
      return 'unknown'
    }
  }

  async unloadModel(model: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: '',
        stream: false,
        keep_alive: 0
      })
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Ollama unload ${model}: ${res.status} ${text}`)
    }
  }

  async prepareModel(model: string): Promise<{ unloaded: string[] }> {
    const loaded = await this.listModels()
    const unloaded: string[] = []

    for (const item of loaded) {
      if (modelsMatch(item.name, model)) continue
      try {
        await this.unloadModel(item.name)
        unloaded.push(item.name)
      } catch {
        // unloading is optional
      }
    }

    return { unloaded }
  }

  async ensureModelLoaded(model: string, signal?: AbortSignal): Promise<void> {
    // Проверяем, загружена ли модель
    const loaded = await this.listModels()
    if (loaded.some((item) => modelsMatch(item.name, model))) {
      return // модель уже загружена
    }

    // Загружаем модель через pull
    const url = this.baseUrl.replace(/\/$/, '')
    const res = await fetch(`${url}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: false }),
      signal: signal || AbortSignal.timeout(10 * 60 * 1000) // 10 минут таймаут для загрузки
    })

    if (!res.ok) {
      throw new Error(`Failed to pull model ${model}: ${res.status}`)
    }
  }
}
