import type {
  ModelProvider,
  ProviderConfig,
  ChatOptions,
  ChatChunk,
  LoadedModel,
  ModelPlacement
} from '../../shared/modelProvider'
import { OllamaProvider } from './providers/ollamaProvider'
import { GeminiProvider } from './providers/geminiProvider'
import { OpenAIProvider } from './providers/openaiProvider'
import { ClaudeProvider } from './providers/claudeProvider'
import { GroqProvider } from './providers/groqProvider'
import { TogetherProvider } from './providers/togetherProvider'
import {
  DEEPSEEK_API_BASE_URL,
  GEMINI_API_BASE_URL,
  GEMINI_MODEL_DEFAULT,
  OPENROUTER_API_BASE_URL
} from '../../shared/constants'

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
      const defaultUrl =
        config.type === 'deepseek' ? DEEPSEEK_API_BASE_URL : 'https://api.openai.com/v1'
      const baseUrl = config.baseUrl || defaultUrl
      const apiKey = config.apiKey || ''
      const model = config.model || 'gpt-3.5-turbo'
      return new OpenAIProvider(baseUrl, apiKey, model)
    }

    if (config.type === 'gemini') {
      const apiKey = config.apiKey || ''
      const model = config.model || GEMINI_MODEL_DEFAULT
      const rpm = typeof config.rpm === 'number' ? config.rpm : 5
      return new GeminiProvider(
        apiKey,
        model,
        (config.baseUrl || GEMINI_API_BASE_URL).replace(/\/$/, ''),
        rpm
      )
    }

    if (config.type === 'groq') {
      const apiKey = config.apiKey || ''
      const model = config.model || 'llama3-8b-8192'
      return new GroqProvider(apiKey, model)
    }

    if (config.type === 'together') {
      const apiKey = config.apiKey || ''
      const model = config.model || 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo'
      return new TogetherProvider(apiKey, model)
    }

    if (config.type === 'openrouter') {
      const baseUrl = OPENROUTER_API_BASE_URL
      const apiKey = config.apiKey || ''
      const model = config.model || 'openai/gpt-4o-mini'
      return new OpenAIProvider(
        baseUrl,
        apiKey,
        model,
        {
          'HTTP-Referer': 'https://github.com/rkfsociety/CodeViper',
          'X-OpenRouter-Title': 'CodeViper'
        },
        `${OPENROUTER_API_BASE_URL}/models?supported_parameters=tools&order=most-popular`
      )
    }

    if (config.type === 'anthropic') {
      const apiKey = config.apiKey || ''
      const model = config.model || 'claude-3-5-sonnet-20241022'
      return new ClaudeProvider(apiKey, model)
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

  async ensureModelLoaded(model: string, signal?: AbortSignal): Promise<void> {
    if (this.provider instanceof OllamaProvider) {
      await this.provider.ensureModelLoaded(model, signal)
    }
  }

  async getModelMemoryInfo(
    model?: string
  ): Promise<{ name: string; size?: number; vram?: number }[]> {
    if (this.provider instanceof OllamaProvider) {
      return this.provider.getModelMemoryInfo(model)
    }
    return []
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
