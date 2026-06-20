export { CONTEXT_SUMMARIZE_THRESHOLD } from './constants'
import { CONTEXT_SUMMARIZE_THRESHOLD } from './constants'
export const MIN_RECENT_CONTEXT_MESSAGES = 8
export const MAX_TOOL_MESSAGE_CHARS = 4_000

export function getModelContextLimitTokens(model: string, knownContextLength?: number): number {
  if (knownContextLength && knownContextLength > 0) return knownContextLength

  const name = model.toLowerCase()

  // Локальные модели — по размеру параметров
  if (/\b(70b|72b|671b)\b/.test(name)) return 128_000
  if (/\b(32b|30b|22b)\b/.test(name)) return 64_000
  if (/\b(14b|12b|9b|8b|7b)\b/.test(name)) return 32_000

  // Облачные модели — по имени
  if (name.startsWith('deepseek-')) return 64_000
  if (name.startsWith('gpt-4o') || name.includes('gpt-4-turbo') || name.includes('gpt-4-1106'))
    return 128_000
  if (name.startsWith('gpt-3.5')) return 16_000
  if (name.startsWith('gpt-4')) return 128_000
  if (name.startsWith('claude-')) return 200_000
  if (name.startsWith('gemini-1.5') || name.startsWith('gemini-2')) return 128_000
  if (name.startsWith('gemini-')) return 32_000

  return 16_000
}

export function estimateTokensFromChars(charCount: number): number {
  return Math.ceil(charCount / 3.5)
}

export function estimateCharsFromTokens(tokenCount: number): number {
  return Math.floor(tokenCount * 3.5)
}

export function computeContextUsage(
  totalChars: number,
  model: string,
  knownContextLength?: number
): {
  limitTokens: number
  estimatedTokens: number
  usagePercent: number
  shouldSummarize: boolean
} {
  const limitTokens = getModelContextLimitTokens(model, knownContextLength)
  const estimatedTokens = estimateTokensFromChars(totalChars)
  const ratio = limitTokens > 0 ? estimatedTokens / limitTokens : 1
  const usagePercent = Math.min(100, Math.round(ratio * 100))

  return {
    limitTokens,
    estimatedTokens,
    usagePercent,
    shouldSummarize: ratio >= CONTEXT_SUMMARIZE_THRESHOLD
  }
}

export function estimateMessageChars(content: string): number {
  return content.length + 24
}

export interface AdaptiveLimits {
  maxToolMessageChars: number
  maxHistoryMessages: number
}

/**
 * Вычисляет лимиты на размер вывода инструментов и глубину истории,
 * масштабируя их по реальному окну контекста модели.
 *
 * Формула:
 *   maxToolMessageChars ≈ contextLimit / 8   (в символах, т.к. ~3.5 симв/ток)
 *   maxHistoryMessages  ≈ contextLimit / 1333 (при среднем сообщении ~800 ток)
 *
 * Примеры (contextLimit → tool chars | history):
 *   16k  → 2 000 chars | 12 сообщений   (7B, дефолт)
 *   32k  → 4 000 chars | 24 сообщения   (14B)
 *   64k  → 8 000 chars | 48 сообщений   (32B)
 *  128k  → 16 000 chars | 80 сообщений  (70B)
 */
export function computeAdaptiveLimits(model: string, knownContextLength?: number): AdaptiveLimits {
  const limitTokens = getModelContextLimitTokens(model, knownContextLength)

  const maxToolMessageChars = Math.max(1_500, Math.min(16_000, Math.floor(limitTokens / 8)))

  const maxHistoryMessages = Math.max(
    MIN_RECENT_CONTEXT_MESSAGES,
    Math.min(80, Math.floor(limitTokens / 1_333))
  )

  return { maxToolMessageChars, maxHistoryMessages }
}
