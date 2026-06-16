import type { ModelProvider, ProviderConfig, ChatOptions, ChatChunk, LoadedModel, ModelPlacement } from '../../shared/modelProvider'
import { OllamaProvider } from './providers/ollamaProvider'
import { OpenAIProvider } from './providers/openaiProvider'

/** Фасад для выбора провайдера моделей по конфигурации. */
export class ModelRuntime {
  private provider: ModelProvider

  constructor(config: ProviderConfig) {
    this.provider = this.createProvider(config)
  }

  private createProvider(config: ProviderConfig): ModelProvider {
    if (config.type === 'ollama') {
      const baseUrl = (config.baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '')
      return new OllamaProvider(baseUrl)
    }

    if (config.type === 'openai' || config.type === 'deepseek') {
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1'
      const apiKey = config.apiKey || ''
      const model = config.model || 'gpt-3.5-turbo'
      return new OpenAIProvider(baseUrl, apiKey, model)
    }

    // Fallback на Ollama
    const baseUrl = (config.baseUrl || 'http://127.0.0.1:11434').replace(/\/$/, '')
    return new OllamaProvider(baseUrl)
  }

  async ping(signal?: AbortSignal): Promise<boolean> {
    return this.provider.ping(signal)
  }

  async listModels(): Promise<LoadedModel[]> {
    return this.provider.listModels()
  }

  async *chat(options: ChatOptions): AsyncGenerator<ChatChunk> {
    yield* this.provider.chat(options)
  }

  async getModelPlacement(model: string, signal?: AbortSignal): Promise<ModelPlacement> {
    return this.provider.getModelPlacement?.(model, signal) ?? 'unknown'
  }

  async unloadModel(model: string): Promise<void> {
    await this.provider.unloadModel?.(model)
  }

  async prepareModel(model: string): Promise<{ unloaded: string[] }> {
    return this.provider.prepareModel?.(model) ?? { unloaded: [] }
  }
}

// Экспортируем для обратной совместимости
export async function listLoadedOllamaModels(baseUrl: string) {
  const runtime = new ModelRuntime({ type: 'ollama', baseUrl })
  return runtime.listModels()
}

export async function getModelPlacement(baseUrl: string, model: string): Promise<ModelPlacement> {
  const runtime = new ModelRuntime({ type: 'ollama', baseUrl })
  return runtime.getModelPlacement(model)
}

export async function unloadOllamaModel(baseUrl: string, model: string): Promise<void> {
  const runtime = new ModelRuntime({ type: 'ollama', baseUrl })
  await runtime.unloadModel(model)
}

export async function prepareOllamaModel(baseUrl: string, targetModel: string) {
  const runtime = new ModelRuntime({ type: 'ollama', baseUrl })
  return runtime.prepareModel(targetModel)
}

export function formatModelSwitchMessage(
  model: string,
  reason: string,
  unloaded: string[]
): string {
  const parts = [`🤖 Авто-модель: ${model}`, reason]
  if (unloaded.length) {
    parts.push(`Выгружено из RAM: ${unloaded.join(', ')}`)
  }
  return parts.join('\n')
}
