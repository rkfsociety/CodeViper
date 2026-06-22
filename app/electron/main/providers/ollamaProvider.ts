import type {
  ModelProvider,
  ChatOptions,
  ChatChunk,
  LoadedModel,
  ModelPlacement
} from '../../../shared/modelProvider'
import { modelsMatch } from '../../../shared/modelRouter'
import { StreamingChatProvider, type ChunkParser, type FetchInit } from './streamingChatProvider'

function translateOllamaError(status: number, raw: string): string {
  const r = raw.toLowerCase()

  if (
    r.includes('out-of-memory') ||
    r.includes('cudamalloc failed') ||
    r.includes('out of memory') ||
    r.includes('failed to allocate')
  ) {
    return (
      `Недостаточно памяти GPU для запуска модели (ошибка ${status}).\n\n` +
      `Что можно сделать:\n` +
      `• Настройки → Performance → «Слоёв на GPU» → поставь 0 (только CPU) или небольшое число (например 20) чтобы часть слоёв ушла в RAM\n` +
      `• Выбери более лёгкую модель (7b вместо 12b+)\n` +
      `• Закрой другие программы, занимающие VRAM`
    )
  }

  if (
    r.includes('model') &&
    (r.includes('not found') || r.includes("doesn't exist") || status === 404)
  ) {
    const model = raw.match(/["']?([a-z0-9.:/_-]+)["']? not found/i)?.[1] ?? ''
    return `Модель${model ? ` «${model}»` : ''} не найдена в Ollama. Скачай её: ollama pull ${model || '<название>'}`
  }

  if (
    r.includes('connection refused') ||
    r.includes('econnrefused') ||
    r.includes('fetch failed')
  ) {
    return `Ollama недоступна (ошибка ${status}). Убедись что Ollama запущена: ollama serve`
  }

  if (r.includes('context length') || r.includes('context window') || r.includes('kv cache')) {
    return `Превышен размер контекста модели (ошибка ${status}). Попробуй сократить историю чата или включить суммаризацию в настройках.`
  }

  if (r.includes('llama runner process has terminated') || r.includes('runner process')) {
    return `Процесс модели аварийно завершился (ошибка ${status}). Вероятно, не хватает RAM или VRAM. Попробуй уменьшить число GPU-слоёв в настройках.`
  }

  if (raw) {
    return `Ошибка Ollama (${status}): ${raw}`
  }
  return `Ошибка Ollama (${status})`
}

export class OllamaProvider extends StreamingChatProvider implements ModelProvider {
  constructor(private baseUrl: string) {
    super()
  }

  protected override buildRequest(options: ChatOptions): { url: string; init: FetchInit } {
    return {
      url: `${this.baseUrl.replace(/\/$/, '')}/api/chat`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model,
          stream: true,
          messages: options.messages,
          temperature: options.temperature,
          top_p: options.top_p,
          tools: options.tools,
          // tool_choice не поддерживается Ollama — не передаём
          keep_alive: options.keep_alive ?? 5 * 60,
          num_ctx: 4096,
          num_predict: options.max_tokens ?? 2048,
          ...(options.num_gpu != null ? { num_gpu: options.num_gpu } : {})
        })
      }
    }
  }

  protected override createChunkParser(_options: ChatOptions): ChunkParser {
    return {
      parse(line: string): ChatChunk | null {
        try {
          const chunk = JSON.parse(line) as {
            message?: { content?: string; thinking?: string }
            stop_reason?: string
            eval_count?: number
            eval_duration?: number
            prompt_eval_count?: number
            prompt_eval_duration?: number
            model?: string
          }
          return {
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
          return null
        }
      },
      finalize(): ChatChunk[] {
        return []
      }
    }
  }

  protected override handleHttpError(status: number, body: string): never {
    let raw = ''
    try {
      raw = (JSON.parse(body) as { error?: string }).error ?? ''
    } catch {
      /* ignore */
    }
    throw new Error(translateOllamaError(status, raw))
  }

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
    const loaded = await this.listModels()
    if (loaded.some((item) => modelsMatch(item.name, model))) {
      return
    }

    const url = this.baseUrl.replace(/\/$/, '')
    const res = await fetch(`${url}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: false }),
      signal: signal || AbortSignal.timeout(10 * 60 * 1000)
    })

    if (!res.ok) {
      throw new Error(`Failed to pull model ${model}: ${res.status}`)
    }
  }

  async getModelMemoryInfo(
    model?: string
  ): Promise<{ name: string; size?: number; vram?: number }[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/ps`)
      if (!res.ok) return []

      const data = (await res.json()) as {
        models?: Array<{ name: string; size?: number; size_vram?: number }>
      }

      return (data.models ?? [])
        .filter((m) => !model || modelsMatch(m.name, model))
        .map((m) => ({
          name: m.name,
          size: m.size,
          vram: m.size_vram
        }))
    } catch {
      return []
    }
  }
}
