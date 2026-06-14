export const CONTEXT_SUMMARIZE_THRESHOLD = 0.85
export const MIN_RECENT_CONTEXT_MESSAGES = 8
export const MAX_TOOL_MESSAGE_CHARS = 4_000

export function getModelContextLimitTokens(model: string): number {
  const name = model.toLowerCase()

  if (/\b(70b|72b|671b)\b/.test(name)) return 128_000
  if (/\b(32b|30b|22b)\b/.test(name)) return 64_000
  if (/\b(14b|12b|9b|8b|7b)\b/.test(name)) return 32_000
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
  model: string
): {
  limitTokens: number
  estimatedTokens: number
  usagePercent: number
  shouldSummarize: boolean
} {
  const limitTokens = getModelContextLimitTokens(model)
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
