/** Интерфейс для абстрактной работы с разными провайдерами моделей. */

/** Tool call в формате OpenAI (для cloud-провайдеров). */
export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  /** Может быть null для assistant-сообщений с tool_calls (OpenAI-формат). */
  content: string | null
  thinking?: string
  /** Нативные tool calls ассистента (cloud-провайдеры). */
  tool_calls?: OpenAIToolCall[]
  /** ID вызова инструмента для tool-результатов (cloud-провайдеры). */
  tool_call_id?: string
}

export interface ChatOptions {
  model: string
  messages: ChatMessage[]
  stream?: boolean
  tools?: Array<{ name: string; description?: string; input_schema?: unknown }>
  tool_choice?: 'auto' | 'required'
  temperature?: number
  top_p?: number
  max_tokens?: number
  keep_alive?: string | number
  /** Ollama: кол-во слоёв на GPU (-1 = авто, 0 = только CPU) */
  num_gpu?: number
  signal?: AbortSignal
  /** Вызывается перед каждой повторной попыткой после HTTP 429 */
  onRetry429?: (waitMs: number, attempt: number) => void
  /** Вызывается при смене состояния circuit breaker (open/half-open/closed) */
  onCircuitBreaker?: (state: 'open' | 'half-open' | 'closed', openUntilMs?: number) => void
}

export interface ChatChunk {
  content: string
  thinking?: string
  stop_reason?: string
  eval_count?: number
  eval_duration?: number
  prompt_eval_count?: number
  prompt_eval_duration?: number
  model?: string
  /** Общее число токенов (для облачных провайдеров — из usage.total_tokens) */
  total_tokens?: number
  /** Входные токены (Claude, OpenAI — разделённо для точного расчёта стоимости) */
  input_tokens?: number
  /** Выходные токены */
  output_tokens?: number
  /** Токены, прочитанные из prompt cache (Claude) */
  cache_read_tokens?: number
  /** Нативные tool calls из streaming (cloud-провайдеры). */
  tool_calls?: OpenAIToolCall[]
}

export interface LoadedModel {
  name: string
  size?: number
  // Информация о совместимости с системой (добавляется на сервере)
  sizeGB?: number
  contextLength?: number
  parameterSize?: string
  isSupported?: boolean
  reason?: string
  recommendedFor?: string
}

export type ModelPlacement = 'gpu' | 'cpu' | 'partial' | 'unknown'

export interface ModelProvider {
  /** Проверить доступность провайдера (ping) */
  ping(signal?: AbortSignal): Promise<boolean>

  /** Список загруженных/доступных моделей */
  listModels(): Promise<LoadedModel[]>

  /** Chat API — стрим ответа построчно */
  chat(options: ChatOptions): AsyncGenerator<ChatChunk>

  /** Где загружена модель (GPU/CPU/etc) — опционально */
  getModelPlacement?(model: string, signal?: AbortSignal): Promise<ModelPlacement>

  /** Выгрузить модель из памяти — опционально */
  unloadModel?(model: string): Promise<void>

  /** Подготовить к использованию модель (выгрузить другие и т.д.) — опционально */
  prepareModel?(model: string): Promise<{ unloaded: string[] }>
}

export interface ProviderConfig {
  type: 'ollama' | 'openai' | 'anthropic' | string
  baseUrl?: string
  apiKey?: string
  model?: string
  [key: string]: unknown
}
