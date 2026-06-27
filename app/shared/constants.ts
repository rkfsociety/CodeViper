// ── Агент: защита от циклов ───────────────────────────────────────────────────
/** Лимит повторений одного инструмента с одинаковыми аргументами подряд */
export const MAX_CONSECUTIVE_SAME_TOOL = 5
/** Лимит повторений одного инструмента в сессии (защита от зацикливания) */
export const MAX_SAME_TOOL_TOTAL = 50
/** Шагов агента без mutating tools на mutation-задаче — nudge «пора править» */
export const EXPLORATION_STALL_MIN_STEPS = 8

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
/** Порог cosine similarity: выше — запись считается семантическим дублем */
export const COLLECTIVE_MEMORY_SEMANTIC_DEDUP_THRESHOLD = 0.95

// ── Команды ───────────────────────────────────────────────────────────────────
/** Таймаут выполнения команды по умолчанию (сек) */
export const DEFAULT_COMMAND_TIMEOUT_SEC = 120
/** Максимальный суммарный объём stdout+stderr (байт) до принудительного завершения команды */
export const COMMAND_OUTPUT_BUFFER_LIMIT_BYTES = 10 * 1024 * 1024 // 10 МБ
export const COMMAND_TIMEOUT_SEC_MIN = 10
export const COMMAND_TIMEOUT_SEC_MAX = 600

// ── Агент: таймауты ───────────────────────────────────────────────────────────
/** Лимит стоимости прогона по умолчанию (USD). 0 = без лимита. */
export const DEFAULT_MAX_COST_PER_RUN_USD = 0

/** 0 или undefined — лимит отключён. */
export function resolveMaxCostPerRunUsd(limit: number | undefined | null): number | null {
  if (limit == null || limit <= 0) return null
  return limit
}

/** true, если накопленная стоимость превысила лимит. */
export function isCostLimitExceeded(estimatedCostUsd: number, maxCostUsd: number | null): boolean {
  return maxCostUsd != null && estimatedCostUsd > maxCostUsd
}

/** Таймаут одного LLM-шага (мс). Зависший запрос прерывается и агент сообщает об ошибке. */
export const AGENT_STEP_TIMEOUT_MS = 120_000
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
/** Ollama-модель по умолчанию для оркестратора (быстрая, JSON-стабильнее 1.5B GGUF) */
export const ORCHESTRATOR_DEFAULT_OLLAMA_MODEL = 'qwen2.5:3b'

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

/** Режим ANY (tool_choice required) с большим числом declarations даёт 400 branching. */
export const GEMINI_ANY_MODE_MAX_TOOLS = 40

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
/** Суффикс бесплатных моделей OpenRouter в id каталога */
export const OPENROUTER_FREE_MODEL_SUFFIX = ':free'

export function isOpenRouterFreeModel(modelId: string): boolean {
  return modelId.includes(OPENROUTER_FREE_MODEL_SUFFIX)
}

export function filterOpenRouterModelsByTier<T extends { name: string }>(
  models: T[],
  tier: 'free' | 'paid'
): T[] {
  return tier === 'free'
    ? models.filter((m) => isOpenRouterFreeModel(m.name))
    : models.filter((m) => !isOpenRouterFreeModel(m.name))
}
/** Провайдер по умолчанию */
export const DEFAULT_MODEL_PROVIDER = 'ollama' as const

// ── MCP ───────────────────────────────────────────────────────────────────────
/** Таймаут запроса манифеста MCP-сервера (мс) */
export const MCP_MANIFEST_TIMEOUT_MS = 15_000
/** Таймаут ping MCP при старте приложения — не блокировать запуск. */
export const MCP_HEALTH_CHECK_TIMEOUT_MS = 5_000

// ── Индексация проекта ────────────────────────────────────────────────────────
/** Debounce переиндексации файла после изменения (мс) */
export const PROJECT_INDEX_DEBOUNCE_MS = 2_000

// ── Коллективная память ───────────────────────────────────────────────────────
/** Общие знания агента в репозитории CodeViper (синхронизация через git) */
export const COLLECTIVE_MEMORY_REPO_PATH = 'docs/collective/ViperMemory.md'
/** Повторы merge+push при конфликте с remote (non-fast-forward). */
export const COLLECTIVE_MEMORY_PUSH_RETRY_MAX = 3
/** Коллективные навыки в репозитории CodeViper */
export const COLLECTIVE_SKILLS_REPO_PATH = 'docs/collective/ViperSkills.md'
/** Репозиторий для API-синхронизации коллективной памяти (без локального git) */
export const CODEVIPER_GITHUB_OWNER = 'rkfsociety'
export const CODEVIPER_GITHUB_REPO = 'CodeViper'
/** Публичный URL для git clone (установщик и авто-клон в userData/source) */
export const CODEVIPER_GITHUB_CLONE_URL = `https://github.com/${CODEVIPER_GITHUB_OWNER}/${CODEVIPER_GITHUB_REPO}`

// ── Live runtime (блок 0) ─────────────────────────────────────────────────────
/** Подпапка клона репозитория относительно userData (%APPDATA%/CodeViper/source) */
export const BUNDLED_SOURCE_DIR_NAME = 'source'
/** Подпапка app/ внутри клона (%APPDATA%/CodeViper/source/app) */
export const BUNDLED_SOURCE_APP_DIR_NAME = 'app'
/** Макс. ожидание startup sync перед показом окна (мс) */
export const BUNDLED_SOURCE_STARTUP_WAIT_MS = 3_000
/** Первый git clone при автообновлении без NSIS — дольше обычного startup wait */
export const BUNDLED_SOURCE_FIRST_CLONE_WAIT_MS = 120_000
/** Минимальный размер out/main/index.js / runtimeHandlers.js в клоне (защита от пустого stub) */
export const BUNDLED_RUNTIME_MAIN_MIN_BYTES = 1024
/** out/renderer/index.html — маленький entrypoint (~650 байт), отдельный порог */
export const BUNDLED_SHELL_RENDERER_MIN_BYTES = 64
/** Таймаут npm install / build в клоне (с) */
export const BUNDLED_SOURCE_BUILD_TIMEOUT_SEC = 600

// ── P2P-вычисления ───────────────────────────────────────────────────────────
/** CPU выше порога → входящие P2P-задачи на паузе */
export const P2P_PAUSE_CPU_THRESHOLD = 15
/** GPU выше порога → входящие P2P-задачи на паузе */
export const P2P_PAUSE_GPU_THRESHOLD = 20
/** Максимум одновременно выполняемых входящих P2P-задач на узле */
export const P2P_MAX_CONCURRENT_TASKS = 3
/** Сколько ждать слот в очереди P2P (мс), затем 503 */
export const P2P_QUEUE_WAIT_TIMEOUT_MS = 60_000
/** Списание кредитов у отправителя за одну P2P-задачу */
export const P2P_TASK_CREDIT_COST = 10
/** Начисление кредитов провайдеру за выполненную задачу */
export const P2P_TASK_CREDIT_REWARD = 10
/** Стартовый баланс нового пользователя на сигнальном сервере */
export const P2P_INITIAL_CREDITS = 100

// ── Тарифы облачных провайдеров ($ за 1M токенов) ────────────────────────────
/**
 * Прайс-лист моделей для оценки стоимости.
 * input — входные токены, output — выходные, cacheRead — кэш-чтение (Claude).
 * Источник: официальные страницы ценообразования провайдеров (актуально на 2025-06).
 */
export interface ModelPricing {
  input: number
  output: number
  cacheRead?: number
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // ── Anthropic Claude ────────────────────────────────────────────────────────
  'claude-opus-4-8': { input: 15.0, output: 75.0, cacheRead: 1.5 },
  'claude-opus-4': { input: 15.0, output: 75.0, cacheRead: 1.5 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cacheRead: 0.3 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0, cacheRead: 0.3 },
  'claude-sonnet-3-7': { input: 3.0, output: 15.0, cacheRead: 0.3 },
  'claude-haiku-4-5': { input: 0.8, output: 4.0, cacheRead: 0.08 },
  'claude-haiku-3-5': { input: 0.8, output: 4.0, cacheRead: 0.08 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0, cacheRead: 0.3 },
  'claude-3-5-haiku': { input: 0.8, output: 4.0, cacheRead: 0.08 },
  'claude-3-opus': { input: 15.0, output: 75.0, cacheRead: 1.5 },
  // ── OpenAI ──────────────────────────────────────────────────────────────────
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  o3: { input: 2.0, output: 8.0 },
  'o4-mini': { input: 1.1, output: 4.4 },
  // ── Google Gemini ───────────────────────────────────────────────────────────
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-1.5-flash': { input: 0.075, output: 0.3 }
}

/**
 * Найти тариф по имени модели (нечёткое совпадение по подстроке).
 * Возвращает null если модель не найдена (Ollama и др. локальные).
 */
export function findModelPricing(model: string): ModelPricing | null {
  const key = model.toLowerCase()
  // Точное совпадение
  if (MODEL_PRICING[key]) return MODEL_PRICING[key]!
  // Поиск по подстроке (например "claude-sonnet-4-6-20251022" → "claude-sonnet-4-6")
  for (const [name, pricing] of Object.entries(MODEL_PRICING)) {
    if (key.includes(name) || name.includes(key)) return pricing
  }
  return null
}

/**
 * Оценить стоимость запроса в USD.
 * Все счётчики — абсолютные числа токенов (не в тысячах).
 */
export function estimateRequestCost(
  pricing: ModelPricing,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0
): number {
  return (
    (inputTokens * pricing.input +
      outputTokens * pricing.output +
      cacheReadTokens * (pricing.cacheRead ?? 0)) /
    1_000_000
  )
}
