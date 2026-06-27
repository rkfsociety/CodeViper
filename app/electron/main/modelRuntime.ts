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

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

const CB_ERROR_THRESHOLD = 5
const CB_OPEN_MS = 30_000

type CbState = 'closed' | 'open' | 'half-open'
type CbNotify = ((state: CbState, openUntilMs?: number) => void) | undefined

/** Конечный автомат circuit breaker. Экземпляр хранится в реестре — живёт дольше AgentRunner. */
class CircuitBreaker {
  private state: CbState = 'closed'
  private consecutiveErrors = 0
  private openUntilMs = 0

  /**
   * Вызвать перед отправкой запроса.
   * Бросает CircuitBreakerOpenError если цепь разомкнута и время сброса ещё не вышло.
   * Переходит в half-open если время сброса истекло.
   */
  beforeRequest(notify: CbNotify): void {
    if (this.state === 'open') {
      if (Date.now() >= this.openUntilMs) {
        this.state = 'half-open'
        notify?.('half-open')
      } else {
        throw new CircuitBreakerOpenError(this.openUntilMs)
      }
    }
  }

  /** Вызвать после успешного завершения запроса. */
  onSuccess(notify: CbNotify): void {
    this.consecutiveErrors = 0
    if (this.state !== 'closed') {
      this.state = 'closed'
      notify?.('closed')
    }
  }

  /**
   * Вызвать после ошибки запроса.
   * Размыкает цепь (open) при 5 последовательных ошибках или при ошибке в half-open.
   */
  onError(notify: CbNotify): void {
    this.consecutiveErrors++
    if (this.state === 'half-open' || this.consecutiveErrors >= CB_ERROR_THRESHOLD) {
      this.openUntilMs = Date.now() + CB_OPEN_MS
      this.state = 'open'
      this.consecutiveErrors = 0
      notify?.('open', this.openUntilMs)
    }
  }
}

/** Брошен в ModelRuntime.chat() когда circuit breaker находится в состоянии open. */
export class CircuitBreakerOpenError extends Error {
  constructor(public readonly openUntilMs: number) {
    const secsLeft = Math.ceil((openUntilMs - Date.now()) / 1000)
    super(`Circuit breaker open — слишком много ошибок подряд. Повторно через ${secsLeft} с.`)
    this.name = 'CircuitBreakerOpenError'
  }
}

/** Реестр: один CircuitBreaker на уникальный config (тип + URL + модель). */
const cbRegistry = new Map<string, CircuitBreaker>()

function getCb(config: ProviderConfig): CircuitBreaker {
  const key = `${config.type}|${config.baseUrl ?? ''}|${config.model ?? ''}`
  let cb = cbRegistry.get(key)
  if (!cb) {
    cb = new CircuitBreaker()
    cbRegistry.set(key, cb)
  }
  return cb
}

// ─── ModelRuntime ─────────────────────────────────────────────────────────────

/** Фасад для выбора провайдера моделей по конфигурации. */
export class ModelRuntime {
  private provider: ModelProvider
  private readonly cb: CircuitBreaker

  constructor(config: ProviderConfig) {
    this.provider = this.createProvider(config)
    this.cb = getCb(config)
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
        `${OPENROUTER_API_BASE_URL}/models?supported_parameters=tools&sort=most-popular`
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
    // Проверяем состояние circuit breaker. Если open — бросаем CircuitBreakerOpenError.
    // Если время сброса истекло — переходим в half-open и пропускаем один пробный запрос.
    this.cb.beforeRequest(options.onCircuitBreaker)

    try {
      for await (const chunk of this.provider.chat(options)) {
        yield chunk
      }
      this.cb.onSuccess(options.onCircuitBreaker)
    } catch (error) {
      // AbortError (отмена пользователем) не считается ошибкой провайдера.
      const isAbort = error instanceof DOMException && error.name === 'AbortError'
      if (!isAbort) this.cb.onError(options.onCircuitBreaker)
      throw error
    }
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
