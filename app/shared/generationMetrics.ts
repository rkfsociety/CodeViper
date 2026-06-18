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

export interface RunStats {
  elapsedSec: number
  tokens: number
}

/** 47000 → "47.0k", 1200 → "1.2k", 500 → "500" */
export function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

/** 27 → "27s", 90 → "1m 30s", 3661 → "1h 1m" */
export function formatElapsed(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
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
