/** Интерфейс для абстрактной работы с разными провайдерами моделей. */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
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
  signal?: AbortSignal
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
}

export interface LoadedModel {
  name: string
  size?: number
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
