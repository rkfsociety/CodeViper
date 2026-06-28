export type RamTier = '8' | '12' | '16' | '24' | '32' | '48+'

export interface RecommendedModel {
  name: string
  description: string
  ramHint: string
  /** Группа для сортировки по железу */
  ramTier: RamTier
  /** Рекомендуемый выбор в своей категории RAM */
  featured?: boolean
  /** Ссылка на страницу модели на Ollama */
  url?: string
}

export const RECOMMENDED_MODEL_TIERS: { id: RamTier; label: string }[] = [
  { id: '8', label: '8 GB — минимум для агента' },
  { id: '12', label: '12 GB' },
  { id: '16', label: '16 GB — комфортная работа' },
  { id: '24', label: '24 GB' },
  { id: '32', label: '32 GB — мощные модели' },
  { id: '48+', label: '48 GB+ — максимум качества' }
]

/** Модели Ollama с поддержкой tool calling для агента CodeViper. */
export const RECOMMENDED_MODELS: RecommendedModel[] = [
  {
    name: 'qwen2.5-coder:7b',
    description: 'Лучший выбор для кода и агента — быстро и точно',
    ramHint: '8 GB',
    ramTier: '8',
    featured: true,
    url: 'https://ollama.com/library/qwen2.5-coder'
  },
  {
    name: 'qwen2.5:7b',
    description: 'Универсальная Qwen2.5, tool calling',
    ramHint: '8 GB',
    ramTier: '8',
    url: 'https://ollama.com/library/qwen2.5'
  },
  {
    name: 'llama3.1:8b',
    description: 'Проверенная модель Meta с tool calling',
    ramHint: '8 GB',
    ramTier: '8',
    url: 'https://ollama.com/library/llama3.1'
  },
  {
    name: 'qwen3:8b',
    description: 'Qwen3 — сильнее Qwen2.5 на тех же 8 GB',
    ramHint: '8 GB',
    ramTier: '8',
    url: 'https://ollama.com/library/qwen3'
  },
  {
    name: 'mistral-nemo:12b',
    description: 'Mistral Nemo 12B — баланс качества и RAM',
    ramHint: '12 GB',
    ramTier: '12',
    url: 'https://ollama.com/library/mistral-nemo'
  },
  {
    name: 'qwen2.5-coder:14b',
    description: 'Код высокого качества, стабильный tool calling',
    ramHint: '16 GB',
    ramTier: '16',
    featured: true,
    url: 'https://ollama.com/library/qwen2.5-coder'
  },
  {
    name: 'qwen2.5:14b',
    description: 'Универсальная 14B — лучше понимает контекст',
    ramHint: '16 GB',
    ramTier: '16',
    url: 'https://ollama.com/library/qwen2.5'
  },
  {
    name: 'qwen3:14b',
    description: 'Qwen3 14B — новое поколение на 16 GB',
    ramHint: '16 GB',
    ramTier: '16',
    url: 'https://ollama.com/library/qwen3'
  },
  {
    name: 'codestral:22b',
    description: 'Mistral Codestral — специализация на коде',
    ramHint: '16–24 GB',
    ramTier: '24',
    url: 'https://ollama.com/library/codestral'
  },
  {
    name: 'qwen2.5-coder:32b',
    description: 'Топ кодер для 32 GB — минимум галлюцинаций',
    ramHint: '24–32 GB',
    ramTier: '32',
    featured: true,
    url: 'https://ollama.com/library/qwen2.5-coder'
  },
  {
    name: 'qwen3:30b',
    description: 'Qwen3 30B — сильная универсальная модель',
    ramHint: '24–32 GB',
    ramTier: '32',
    url: 'https://ollama.com/library/qwen3'
  },
  {
    name: 'llama3.1:70b',
    description: 'Llama 3.1 70B — топ open-source (нужен GPU/RAM)',
    ramHint: '48 GB+',
    ramTier: '48+',
    url: 'https://ollama.com/library/llama3.1'
  },
  {
    name: 'llama3.3:70b',
    description: 'Llama 3.3 70B — новее 3.1, лучше рассуждения',
    ramHint: '48 GB+',
    ramTier: '48+',
    featured: true,
    url: 'https://ollama.com/library/llama3.3'
  },
  {
    name: 'qwen2.5:72b',
    description: 'Qwen2.5 72B — максимум для локального агента',
    ramHint: '48 GB+',
    ramTier: '48+',
    url: 'https://ollama.com/library/qwen2.5'
  }
]

export function groupRecommendedModelsByTier(
  models: RecommendedModel[] = RECOMMENDED_MODELS
): { tier: (typeof RECOMMENDED_MODEL_TIERS)[number]; models: RecommendedModel[] }[] {
  return RECOMMENDED_MODEL_TIERS.map((tier) => ({
    tier,
    models: models.filter((model) => model.ramTier === tier.id)
  })).filter((group) => group.models.length > 0)
}

export function normalizeModelTag(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/:latest$/, '')
}

export function modelsMatchTag(a: string, b: string): boolean {
  const na = normalizeModelTag(a)
  const nb = normalizeModelTag(b)
  if (!na || !nb) return false
  return na === nb || na.startsWith(`${nb}:`) || nb.startsWith(`${na}:`)
}

/** Модели без надёжного tool calling — не показываем и не даём скачать. */
const NON_TOOL_MODEL_PATTERNS = [
  /\bllama2\b/i,
  /\bgemma2\b/i,
  /\bdeepseek-r1\b/i,
  /\bphi-?3\b/i,
  /\bphi4\b/i,
  /^mistral:7b$/i,
  /^mistral:latest$/i,
  /^mistral$/i
]

export function isToolCallingModel(name: string): boolean {
  const normalized = normalizeModelTag(name)
  if (!normalized) return false

  if (NON_TOOL_MODEL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false
  }

  return RECOMMENDED_MODELS.some((model) => modelsMatchTag(model.name, normalized))
}

export function assertPullableToolModel(name: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Укажите имя модели')

  if (!isToolCallingModel(trimmed)) {
    throw new Error(
      `Модель «${trimmed}» не поддерживает tool calling или отсутствует в каталоге CodeViper. Выберите модель из списка ниже.`
    )
  }
}

export function filterToolCallingModels<T extends { name: string; supportsTools?: boolean }>(
  models: T[]
): T[] {
  return models.filter((model) => {
    // Если Ollama явно сказала поддерживает/нет — доверяем ей
    if (model.supportsTools === true) return true
    if (model.supportsTools === false) return false
    // Иначе — проверяем по имени из каталога
    return isToolCallingModel(model.name)
  })
}

/** Минимальный размер модели (в миллиардах параметров) для агент-режима (Code). */
export const MIN_AGENT_PARAMS_B = 7

function parseParamSizeB(parameterSize: string | undefined): number | null {
  if (!parameterSize) return null
  const m = parameterSize.match(/^(\d+(?:\.\d+)?)\s*[Bb]/)
  return m ? parseFloat(m[1]!) : null
}

/** Модели ≤8B — короткие системные инструкции и nudge (qwen2.5-coder:7b, llama3.1:8b). */
export function isCompactPromptModel(name: string, parameterSize?: string): boolean {
  const sizeB = parseParamSizeB(parameterSize)
  if (sizeB !== null) return sizeB <= 8
  const n = normalizeModelTag(name || '')
  if (!n) return false
  return /:(7|8)b\b/i.test(n) || /[-_](7|8)b\b/i.test(n)
}

/** Модели ≥14B — extended-блок длинных инструкций в system prompt. */
export function isExtendedPromptModel(name: string, parameterSize?: string): boolean {
  const sizeB = parseParamSizeB(parameterSize)
  if (sizeB !== null) return sizeB >= 14
  const n = normalizeModelTag(name || '')
  if (!n) return false
  return /:(1[4-9]|[2-9]\d)b\b/i.test(n) || /[-_](1[4-9]|[2-9]\d)b\b/i.test(n)
}

/**
 * Фильтрует модели, слишком маленькие для агент-режима (< MIN_AGENT_PARAMS_B B).
 * Если размер неизвестен — пропускаем модель (на всякий случай оставляем).
 */
export function filterAgentCapableModels<T extends { name: string; parameterSize?: string }>(
  models: T[]
): T[] {
  return models.filter((model) => {
    const sizeB = parseParamSizeB(model.parameterSize)
    if (sizeB === null) return true // неизвестный размер — не скрываем
    return sizeB >= MIN_AGENT_PARAMS_B
  })
}

/** Подсказка в селекторе моделей чата для локальных моделей. */
export function getModelPickerHint(
  model: { name: string; supportsTools?: boolean; parameterSize?: string },
  codeMode: boolean
): string | undefined {
  const isTool =
    model.supportsTools === true ||
    (model.supportsTools !== false && isToolCallingModel(model.name))
  if (!isTool) return 'без tool calling'

  const sizeB = parseParamSizeB(model.parameterSize)
  if (codeMode && sizeB !== null && sizeB < MIN_AGENT_PARAMS_B) {
    return `< ${MIN_AGENT_PARAMS_B}B · только Chat`
  }
  return undefined
}

export function isRecommendedModelInstalled(
  catalogName: string,
  installed: Array<{ name: string }>
): boolean {
  return installed.some((item) => modelsMatchTag(item.name, catalogName))
}

export function filterDownloadableRecommendedModels(
  installed: Array<{ name: string }>,
  models: RecommendedModel[] = RECOMMENDED_MODELS
): RecommendedModel[] {
  return models.filter((model) => !isRecommendedModelInstalled(model.name, installed))
}
