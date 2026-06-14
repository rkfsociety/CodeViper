import { describe, it, expect } from 'vitest'
import {
  computeContextUsage,
  CONTEXT_SUMMARIZE_THRESHOLD,
  estimateTokensFromChars,
  getModelContextLimitTokens
} from '../shared/contextLimits'

describe('contextLimits', () => {
  it('возвращает лимит токенов по размеру модели', () => {
    expect(getModelContextLimitTokens('qwen2.5-coder:3b')).toBe(16_000)
    expect(getModelContextLimitTokens('qwen2.5-coder:7b')).toBe(32_000)
    expect(getModelContextLimitTokens('qwen2.5-coder:14b')).toBe(32_000)
    expect(getModelContextLimitTokens('llama3.3:70b')).toBe(128_000)
  })

  it('считает процент использования контекста', () => {
    const limit = getModelContextLimitTokens('qwen2.5-coder:7b')
    const chars = Math.floor(limit * CONTEXT_SUMMARIZE_THRESHOLD * 3.5) + 2_000
    const usage = computeContextUsage(chars, 'qwen2.5-coder:7b')

    expect(usage.usagePercent).toBeGreaterThanOrEqual(85)
    expect(usage.shouldSummarize).toBe(true)
  })

  it('не требует суммаризацию при низкой загрузке', () => {
    const usage = computeContextUsage(10_000, 'qwen2.5-coder:7b')
    expect(usage.shouldSummarize).toBe(false)
    expect(usage.usagePercent).toBeLessThan(Math.round(CONTEXT_SUMMARIZE_THRESHOLD * 100))
  })
})
