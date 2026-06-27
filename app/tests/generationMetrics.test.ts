import { describe, it, expect } from 'vitest'
import {
  buildRequestGenerationMetrics,
  formatGenerationMetricsHint,
  getRequestTokenCount,
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

describe('buildRequestGenerationMetrics', () => {
  it('добавляет prompt_eval_count к Ollama-метрикам', () => {
    const metrics = buildRequestGenerationMetrics(42, 2_000_000_000, 128, undefined, 0, 0)
    expect(metrics).toEqual({
      evalCount: 42,
      evalDurationSec: 2,
      tokensPerSec: 21,
      totalTokens: 170
    })
  })

  it('возвращает totalTokens для облачного провайдера', () => {
    const metrics = buildRequestGenerationMetrics(undefined, undefined, undefined, 512, 0, 0)
    expect(metrics).toEqual({
      evalCount: 0,
      evalDurationSec: 0,
      tokensPerSec: 0,
      totalTokens: 512
    })
  })

  it('суммирует input/output если total_tokens нет', () => {
    const metrics = buildRequestGenerationMetrics(
      undefined,
      undefined,
      undefined,
      undefined,
      100,
      20
    )
    expect(metrics?.totalTokens).toBe(120)
  })
})

describe('getRequestTokenCount', () => {
  it('предпочитает totalTokens перед evalCount', () => {
    expect(
      getRequestTokenCount({
        evalCount: 10,
        evalDurationSec: 1,
        tokensPerSec: 10,
        totalTokens: 150
      })
    ).toBe(150)
  })

  it('возвращает evalCount для Ollama без totalTokens', () => {
    expect(
      getRequestTokenCount({
        evalCount: 42,
        evalDurationSec: 2,
        tokensPerSec: 21
      })
    ).toBe(42)
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
