import { RECOMMENDED_MODELS, isToolCallingModel, type RamTier } from './recommendedModels'
import { isSelfImprovementTask } from './selfImprovement'
import { taskLikelyNeedsMutation, taskLikelyNeedsTools } from './actionVerification'

export interface InstalledModelInfo {
  name: string
  size: number
}

export interface TaskAnalysis {
  difficulty: number
  needsCoder: boolean
  needsReasoning: boolean
  label: string
}

export interface ModelSelectionResult {
  model: string
  reason: string
  taskLabel: string
  difficulty: number
}

const RAM_TIER_RANK: Record<RamTier, number> = {
  '6-8': 1,
  '8': 2,
  '12': 3,
  '16': 4,
  '24': 5,
  '32': 6,
  '48+': 7
}

const AVOID_MODEL_PATTERNS = [/\bllama2\b/i, /^mistral:7b$/i, /^mistral:latest$/i]

export function normalizeModelName(name: string): string {
  return name.trim().toLowerCase().replace(/:latest$/, '')
}

export function modelsMatch(a: string, b: string): boolean {
  const na = normalizeModelName(a)
  const nb = normalizeModelName(b)
  return na === nb || na.startsWith(`${nb}:`) || nb.startsWith(`${na}:`)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function analyzeTask(userMessage: string): TaskAnalysis {
  const text = userMessage.trim()
  let difficulty = 28
  let label = 'обычная задача'

  if (!text) {
    return { difficulty: 20, needsCoder: false, needsReasoning: false, label: 'пустой запрос' }
  }

  if (isSelfImprovementTask(text)) {
    difficulty = 92
    label = 'автономное самоулучшение'
  } else if (taskLikelyNeedsMutation(text)) {
    difficulty += 38
    label = 'изменение кода или файлов'
  } else if (taskLikelyNeedsTools(text)) {
    difficulty += 22
    label = 'изучение проекта'
  }

  if (text.length > 600) difficulty += 12
  else if (text.length > 250) difficulty += 6

  if (/(?:refactor|архитект|code review|рефактор|с нуля|микросервис)/iu.test(text)) {
    difficulty += 18
    label = 'сложная инженерная задача'
  }

  if (/(?:привет|hello|спасибо|thanks|что ты умеешь)/iu.test(text) && text.length < 80) {
    difficulty = 12
    label = 'короткий вопрос'
  }

  if (/(?:почему|объясни|анализ|compare|сравни)/iu.test(text)) {
    difficulty += 10
  }

  const needsCoder =
    /(?:код|code|файл|typescript|react|edit_file|skill|agent|компонент|bug|ошибк|тест)/iu.test(
      text
    ) || difficulty >= 45

  const needsReasoning =
    isSelfImprovementTask(text) ||
    /(?:план|стратег|почему|root cause|reason|рассужд|think)/iu.test(text) ||
    difficulty >= 75

  return {
    difficulty: clamp(difficulty, 5, 100),
    needsCoder,
    needsReasoning,
    label
  }
}

function inferParamBillions(name: string, sizeBytes: number): number {
  const tagged = name.match(/:(\d+(?:\.\d+)?)b(?:[-\w.]*)?$/i)
  if (tagged) return parseFloat(tagged[1])

  const embedded = name.match(/(\d+(?:\.\d+)?)b/i)
  if (embedded) return parseFloat(embedded[1])

  const gb = sizeBytes / 1024 ** 3
  if (gb < 2.5) return 3
  if (gb < 5) return 7
  if (gb < 9) return 8
  if (gb < 14) return 14
  if (gb < 22) return 22
  if (gb < 28) return 32
  return 70
}

function inferRamTier(name: string, sizeBytes: number): RamTier {
  const rec = RECOMMENDED_MODELS.find(
    (item) => modelsMatch(item.name, name) || name.startsWith(item.name.split(':')[0] + ':')
  )
  if (rec) return rec.ramTier

  const params = inferParamBillions(name, sizeBytes)
  if (params <= 4) return '6-8'
  if (params <= 9) return '8'
  if (params <= 12) return '12'
  if (params <= 16) return '16'
  if (params <= 24) return '24'
  if (params <= 35) return '32'
  return '48+'
}

function targetRamTier(difficulty: number): RamTier {
  if (difficulty <= 18) return '6-8'
  if (difficulty <= 32) return '8'
  if (difficulty <= 48) return '12'
  if (difficulty <= 62) return '16'
  if (difficulty <= 78) return '24'
  if (difficulty <= 88) return '32'
  return '48+'
}

function isAvoidedModel(name: string): boolean {
  return AVOID_MODEL_PATTERNS.some((pattern) => pattern.test(name))
}

interface ScoredCandidate {
  name: string
  score: number
  params: number
  tier: RamTier
}

export function selectModelForTask(
  userMessage: string,
  installed: InstalledModelInfo[],
  fallbackModel = ''
): ModelSelectionResult | null {
  const usable = installed.filter(
    (item) => item.name.trim() && !isAvoidedModel(item.name) && isToolCallingModel(item.name)
  )
  if (!usable.length) return null

  if (usable.length === 1) {
    const only = usable[0]
    return {
      model: only.name,
      reason: 'Единственная установленная модель',
      taskLabel: analyzeTask(userMessage).label,
      difficulty: analyzeTask(userMessage).difficulty
    }
  }

  const task = analyzeTask(userMessage)
  const targetTier = targetRamTier(task.difficulty)
  const targetRank = RAM_TIER_RANK[targetTier]

  // Для сложных задач отсекаем слишком слабые модели
  const minParams =
    task.difficulty >= 75 ? 14 :
    task.difficulty >= 60 ? 7 :
    0
  const candidates = minParams > 0
    ? usable.filter((item) => inferParamBillions(item.name, item.size) >= minParams)
    : usable
  const pool = candidates.length > 0 ? candidates : usable

  const scored: ScoredCandidate[] = pool.map((item) => {
    const params = inferParamBillions(item.name, item.size)
    const tier = inferRamTier(item.name, item.size)
    const tierRank = RAM_TIER_RANK[tier]

    let score = 0

    const tierDistance = Math.abs(tierRank - targetRank)
    score += Math.max(0, 40 - tierDistance * 12)

    if (task.difficulty >= 70) {
      score += params * 2
    } else if (task.difficulty <= 25) {
      score += Math.max(0, 24 - params * 2)
    } else {
      score += 10
    }

    if (task.needsCoder) {
      if (/coder|codestral|code/i.test(item.name)) score += 35
      if (/qwen2\.5-coder|qwen3/i.test(item.name)) score += 15
    }

    if (task.needsReasoning) {
      if (/r1|reason|think/i.test(item.name)) score += 25
    }

    const rec = RECOMMENDED_MODELS.find((r) => modelsMatch(r.name, item.name))
    if (rec?.featured) score += 8

    if (fallbackModel && modelsMatch(item.name, fallbackModel)) score += 3

    if (tierRank > targetRank + 1 && task.difficulty < 50) score -= 15

    return { name: item.name, score, params, tier }
  })

  scored.sort((a, b) => b.score - a.score || b.params - a.params)
  const best = scored[0]
  const alternative = scored[1]

  const reasonParts = [
    `Задача: ${task.label} (сложность ${task.difficulty}/100)`,
    `Выбрана ${best.name} (${best.params}B, tier ${best.tier})`
  ]
  if (alternative && alternative.score > best.score - 8) {
    reasonParts.push(`альтернатива: ${alternative.name}`)
  }

  return {
    model: best.name,
    reason: reasonParts.join(' · '),
    taskLabel: task.label,
    difficulty: task.difficulty
  }
}

export function shouldUseAutoModel(
  autoModelEnabled: boolean | undefined,
  installedCount: number
): boolean {
  if (autoModelEnabled === false) return false
  return installedCount >= 1
}

const EMBED_MODEL_PATTERN = /embed/i

/** Самая лёгкая установленная модель для суммаризации контекста (без embed). */
export function selectLightestModelForSummarization(
  installed: InstalledModelInfo[],
  fallbackModel: string
): string {
  const usable = installed.filter(
    (item) =>
      item.name.trim() &&
      !isAvoidedModel(item.name) &&
      !EMBED_MODEL_PATTERN.test(item.name)
  )
  if (!usable.length) return fallbackModel.trim()

  const sorted = [...usable].sort((a, b) => {
    const pa = inferParamBillions(a.name, a.size)
    const pb = inferParamBillions(b.name, b.size)
    return pa - pb || a.size - b.size
  })
  return sorted[0].name
}

/**
 * Следующая по размеру модель тяжелее текущей (для эскалации при рефьюзале).
 * Возвращает null если более тяжёлой нет.
 */
export function escalateModel(
  currentModel: string,
  installed: InstalledModelInfo[]
): string | null {
  const usable = installed.filter(
    (item) => item.name.trim() && !isAvoidedModel(item.name) && isToolCallingModel(item.name)
  )
  const currentParams = inferParamBillions(currentModel, 0)
  const heavier = usable
    .filter((item) => inferParamBillions(item.name, item.size) > currentParams)
    .sort((a, b) => inferParamBillions(a.name, a.size) - inferParamBillions(b.name, b.size))
  return heavier.length > 0 ? heavier[0].name : null
}

/** Явная модель из настроек или авто — самая лёгкая установленная. */
export function resolveSummarizeModel(
  installed: InstalledModelInfo[],
  agentModel: string,
  explicitModel = ''
): string {
  const trimmed = explicitModel.trim()
  if (trimmed) return trimmed
  return selectLightestModelForSummarization(installed, agentModel)
}
