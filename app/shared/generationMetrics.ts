export interface GenerationMetrics {
  evalCount: number
  evalDurationSec: number
  tokensPerSec: number
  /** Общее число токенов за запрос (для облачных провайдеров) */
  totalTokens?: number
  /** Накопленные токены за всю сессию (только для облачных провайдеров) */
  sessionTokens?: number
}

/** Метрики из финального чанка Ollama (`eval_count`, `eval_duration` в наносекундах). */
export function parseOllamaGenerationMetrics(
  evalCount: number | undefined,
  evalDurationNs: number | undefined
): GenerationMetrics | null {
  if (
    evalCount == null ||
    evalDurationNs == null ||
    !Number.isFinite(evalCount) ||
    !Number.isFinite(evalDurationNs) ||
    evalDurationNs <= 0 ||
    evalCount < 0
  ) {
    return null
  }

  const evalDurationSec = evalDurationNs / 1e9
  const tokensPerSec = evalCount / evalDurationSec
  return { evalCount, evalDurationSec, tokensPerSec }
}

export function formatGenerationMetricsHint(metrics: GenerationMetrics): string {
  if (metrics.totalTokens != null) {
    const parts = [`${metrics.totalTokens} tok`]
    if (metrics.sessionTokens != null) {
      parts.push(`сессия: ${metrics.sessionTokens} tok`)
    }
    return parts.join(' · ')
  }
  const tps =
    metrics.tokensPerSec >= 100
      ? String(Math.round(metrics.tokensPerSec))
      : metrics.tokensPerSec.toFixed(1)
  const sec =
    metrics.evalDurationSec >= 10
      ? String(Math.round(metrics.evalDurationSec))
      : metrics.evalDurationSec.toFixed(1)
  return `${tps} tok/s · ${sec}с`
}
