// ── Агент: защита от циклов ───────────────────────────────────────────────────
/** Лимит повторений одного инструмента с одинаковыми аргументами подряд */
export const MAX_CONSECUTIVE_SAME_TOOL = 5
/** Лимит повторений одного инструмента в сессии (защита от зацикливания) */
export const MAX_SAME_TOOL_TOTAL = 50

// ── Агент: контекст ───────────────────────────────────────────────────────────
/** Порог заполнения контекста (0–1), при котором запускается суммаризация */
export const CONTEXT_SUMMARIZE_THRESHOLD = 0.85

// ── Файлы ─────────────────────────────────────────────────────────────────────
/** Максимальный размер файла для полного чтения */
export const FILE_SIZE_LIMIT_BYTES = 512_000
/** Количество строк, возвращаемых read_file по умолчанию при частичном чтении */
export const READ_DEFAULT_LINE_LIMIT = 300

// ── Команды ───────────────────────────────────────────────────────────────────
/** Таймаут выполнения команды по умолчанию (сек) */
export const DEFAULT_COMMAND_TIMEOUT_SEC = 120
export const COMMAND_TIMEOUT_SEC_MIN = 10
export const COMMAND_TIMEOUT_SEC_MAX = 600

// ── Агент: таймаут прогона ────────────────────────────────────────────────────
/** Максимальное суммарное время одного прогона агента (мс). По истечении — ошибка таймаута. */
export const AGENT_RUN_TIMEOUT_MS = 24 * 60 * 60 * 1000
/** Таймаут для режима автономного самообучения — значительно больше обычного. */
export const SELF_IMPROVE_RUN_TIMEOUT_MS = 2 * 60 * 60 * 1000

// ── Очередь сообщений ─────────────────────────────────────────────────────────
/** Максимальное число сообщений в очереди агента */
export const MAX_QUEUE_SIZE = 50

// ── UI ────────────────────────────────────────────────────────────────────────
/** Debounce перед запросом превью контекста (мс) */
export const CONTEXT_PREVIEW_DEBOUNCE_MS = 1000

// ── Провайдеры моделей ────────────────────────────────────────────────────────
/** URL DeepSeek API (OpenAI-совместимый) */
export const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com/v1'
/** Модель DeepSeek по умолчанию */
export const DEEPSEEK_MODEL_DEFAULT = 'deepseek-chat'
/** URL OpenRouter API (OpenAI-совместимый, агрегатор моделей) */
/** URL Gemini API */
export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
/** Модель Gemini по умолчанию */
export const GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash'

/** Модели Gemini/Gemma доступные на бесплатном уровне с фиксированными лимитами */
export const GEMINI_FREE_MODELS = [
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', rpm: 10, tpm: 250_000 },
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash', rpm: 5, tpm: 250_000 },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', rpm: 15, tpm: 250_000 },
  { id: 'gemma-4-26b', label: 'Gemma 4 26B', rpm: 15, tpm: null },
  { id: 'gemma-4-31b', label: 'Gemma 4 31B', rpm: 15, tpm: null }
] as const

export type GeminiFreeModelId = (typeof GEMINI_FREE_MODELS)[number]['id']
export const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1'
/** Провайдер по умолчанию */
export const DEFAULT_MODEL_PROVIDER = 'ollama' as const
