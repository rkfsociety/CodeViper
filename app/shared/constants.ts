// ── Агент: шаги ──────────────────────────────────────────────────────────────
export const DEFAULT_MAX_STEPS = 12
export const MAX_STEPS_MIN = 3
export const MAX_STEPS_MAX = 30

// ── Агент: прогоны в час ──────────────────────────────────────────────────────
export const DEFAULT_MAX_RUNS_PER_HOUR = 20
export const MAX_RUNS_PER_HOUR_MIN = 1
export const MAX_RUNS_PER_HOUR_MAX = 100

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

// ── UI ────────────────────────────────────────────────────────────────────────
/** Debounce перед запросом превью контекста (мс) */
export const CONTEXT_PREVIEW_DEBOUNCE_MS = 600

// ── Провайдеры моделей ────────────────────────────────────────────────────────
/** URL DeepSeek API (OpenAI-совместимый) */
export const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com/v1'
/** Модель DeepSeek по умолчанию */
export const DEEPSEEK_MODEL_DEFAULT = 'deepseek-chat'
/** Провайдер по умолчанию */
export const DEFAULT_MODEL_PROVIDER = 'ollama' as const
