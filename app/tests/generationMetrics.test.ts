import { describe, it, expect } from 'vitest'
import {
  formatGenerationMetricsHint,
  parseOllamaGenerationMetrics
} from '../shared/generationMetrics'

describe('parseOllamaGenerationMetrics', () => {
  it('считает tok/s и длительность из наносекунд Ollama', () => {
    const metrics = parseOllamaGenerationMetrics(42, 2_000_000_000)
    expect(metrics).toEqual({
      evalCount: 42,
      evalDurationSec: 2,
      tokensPerSec: 21
    })
  })

  it('возвращает null при отсутствии данных', () => {
    expect(parseOllamaGenerationMetrics(undefined, 1_000_000)).toBeNull()
    expect(parseOllamaGenerationMetrics(10, undefined)).toBeNull()
    expect(parseOllamaGenerationMetrics(10, 0)).toBeNull()
  })
})

describe('formatGenerationMetricsHint', () => {
  it('форматирует подсказку для статус-бара', () => {
    expect(
      formatGenerationMetricsHint({
        evalCount: 42,
        evalDurationSec: 2,
        tokensPerSec: 21
      })
    ).toBe('21.0 tok/s · 2.0с')
  })
})
