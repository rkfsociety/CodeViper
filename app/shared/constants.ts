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
/** Порог (байт), выше которого без явного диапазона строк возвращается голова+хвост файла */
export const FILE_PREVIEW_THRESHOLD_BYTES = 20_000
/** Строк в голове и хвосте при авто-превью большого файла */
export const FILE_PREVIEW_HEAD_TAIL_LINES = 50
/** Количество строк, возвращаемых read_file по умолчанию при частичном чтении */
export const READ_DEFAULT_LINE_LIMIT = 300

// ── Коллективная память ───────────────────────────────────────────────────────
/** Минимальная длина записи коллективной памяти (символов) */
export const MIN_COLLECTIVE_ENTRY_LENGTH = 20

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

// ── Оркестратор (node-llama-cpp) ─────────────────────────────────────────────
/** Максимум токенов на один вызов analyze() */
export const ORCHESTRATOR_MAX_TOKENS = 256
/** Температура для JSON-генерации (низкая = детерминированный вывод) */
export const ORCHESTRATOR_TEMPERATURE = 0.1
/** URL GGUF-модели по умолчанию (Qwen2.5-1.5B-Instruct Q4_K_M, ~970 МБ) */
export const ORCHESTRATOR_DEFAULT_GGUF_URL =
  'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'
/** Имя файла GGUF-модели по умолчанию */
export const ORCHESTRATOR_DEFAULT_GGUF_FILENAME = 'qwen2.5-1.5b-instruct-q4_k_m.gguf'

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
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', rpm: 20, rpd: 20, tpm: 250_000 },
  {
    id: 'gemini-2.5-flash-lite-preview-06-17',
    label: 'Gemini 2.5 Flash Lite',
    rpm: 10,
    rpd: 20,
    tpm: 250_000
  },
  { id: 'gemini-3-flash', label: 'Gemini 3 Flash', rpm: 5, rpd: 20, tpm: 250_000 },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', rpm: 5, rpd: 20, tpm: 250_000 },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    rpm: 15,
    rpd: 500,
    tpm: 250_000
  }
] as const

export type GeminiFreeModelId = (typeof GEMINI_FREE_MODELS)[number]['id']
export const OPENROUTER_API_BASE_URL = 'https://openrouter.ai/api/v1'
/** Провайдер по умолчанию */
export const DEFAULT_MODEL_PROVIDER = 'ollama' as const

// ── MCP ───────────────────────────────────────────────────────────────────────
/** Таймаут запроса манифеста MCP-сервера (мс) */
export const MCP_MANIFEST_TIMEOUT_MS = 15_000

// ── Коллективная память ───────────────────────────────────────────────────────
/** Общие знания агента в репозитории CodeViper (синхронизация через git) */
export const COLLECTIVE_MEMORY_REPO_PATH = 'docs/collective/ViperMemory.md'
/** Коллективные навыки в репозитории CodeViper */
export const COLLECTIVE_SKILLS_REPO_PATH = 'docs/collective/ViperSkills.md'

// ── P2P-вычисления ───────────────────────────────────────────────────────────
/** CPU выше порога → входящие P2P-задачи на паузе */
export const P2P_PAUSE_CPU_THRESHOLD = 15
/** GPU выше порога → входящие P2P-задачи на паузе */
export const P2P_PAUSE_GPU_THRESHOLD = 20
