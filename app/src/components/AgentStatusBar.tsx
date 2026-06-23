import { useState, useEffect, useReducer } from 'react'
import { TOOL_LABELS } from '../../shared/toolDisplay'
import {
  formatGenerationMetricsHint,
  formatElapsed,
  formatTokenCount
} from '../../shared/generationMetrics'
import type { ProgressInfo } from '../types'
import { useAgentState } from '../contexts/AgentContext'
import type { RunStats } from '../../shared/generationMetrics'

export type AgentPhase = 'thinking' | 'writing' | 'tool'

function formatModelLabel(model: string): string {
  const name = model.trim()
  if (!name) return 'модель'
  return name.includes(':') ? name.split(':')[0]! : name
}

function formatLiveStats(
  runStats?: RunStats | null,
  generationMetrics?: import('../../shared/generationMetrics').GenerationMetrics | null
): string {
  // После завершения генерации — показываем финальные метрики (tok/s, длительность)
  if (generationMetrics) return ` · ${formatGenerationMetricsHint(generationMetrics)}`
  // Во время работы — показываем живой таймер и накопленные токены
  if (runStats && runStats.elapsedSec > 0) {
    const parts: string[] = [formatElapsed(runStats.elapsedSec)]
    if (runStats.tokens > 0) parts.push(`${formatTokenCount(runStats.tokens)} tok`)
    return ` · ${parts.join(' · ')}`
  }
  return ''
}

export function agentStatusLabel(
  phase: AgentPhase,
  toolName?: string,
  model?: string,
  queueSize = 0,
  generationMetrics?: import('../../shared/generationMetrics').GenerationMetrics | null,
  runStats?: RunStats | null
): string {
  const queueHint = queueSize > 0 ? ` · в очереди ${queueSize}` : ''
  const statsHint = formatLiveStats(runStats, generationMetrics)

  if (phase === 'writing') return `Пишу ответ…${statsHint}${queueHint}`
  if (phase === 'tool') {
    const label = toolName ? TOOL_LABELS[toolName] : undefined
    return `${label ?? (toolName ? `Запускаю ${toolName}` : 'Работаю с инструментом…')}${statsHint}${queueHint}`
  }
  const modelLabel = formatModelLabel(model ?? '')
  return `${modelLabel} думает…${statsHint}${queueHint}`
}

export function formatP2pCreditsLabel(balance: number): string {
  return `⚡ P2P ${balance} кр.`
}

interface Props {
  model?: string
  queueSize?: number
  progress?: ProgressInfo | null
  p2pCredits?: number | null
}

export function AgentStatusBar({
  model,
  queueSize = 0,
  progress = null,
  p2pCredits = null
}: Props) {
  const {
    agentPhase,
    activeToolName,
    summarizing,
    generationMetrics,
    runModel,
    runStats,
    orchestrating,
    orchestratingPlan,
    retry429,
    circuitBreakerState,
    circuitBreakerOpenUntilMs,
    collectiveSyncStatus,
    collectiveSyncBranch,
    collectiveSyncPending
  } = useAgentState()
  const displayModel = runModel || model
  const [planExpanded, setPlanExpanded] = useState(false)

  // Форсируем ре-рендер каждую секунду пока circuit breaker открыт, чтобы обновлять обратный отсчёт.
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (circuitBreakerState !== 'open') return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [circuitBreakerState])

  const cbSecsLeft =
    circuitBreakerOpenUntilMs != null
      ? Math.max(0, Math.ceil((circuitBreakerOpenUntilMs - Date.now()) / 1000))
      : 0

  const label =
    circuitBreakerState === 'open'
      ? `⚡ Провайдер недоступен — слишком много ошибок${cbSecsLeft > 0 ? ` (~${cbSecsLeft} с)` : ''}${queueSize > 0 ? ` · в очереди ${queueSize}` : ''}`
      : circuitBreakerState === 'half-open'
        ? `⚡ Проверяю соединение с провайдером…${queueSize > 0 ? ` · в очереди ${queueSize}` : ''}`
        : retry429
          ? `Лимит запросов, жду ${Math.round(retry429.waitMs / 1000)} с… (попытка ${retry429.attempt}/4)${queueSize > 0 ? ` · в очереди ${queueSize}` : ''}`
          : progress
            ? `${progress.label}${progress.percent != null ? ` ${progress.percent}%` : ''}${queueSize > 0 ? ` · в очереди ${queueSize}` : ''}`
            : summarizing
              ? `Сжимаю контекст…${queueSize > 0 ? ` · в очереди ${queueSize}` : ''}`
              : agentStatusLabel(
                  agentPhase,
                  activeToolName,
                  displayModel,
                  queueSize,
                  generationMetrics,
                  runStats
                )

  return (
    <div
      className={`agent-status-bar phase-${agentPhase}${summarizing ? ' summarizing' : ''}${
        progress ? ' has-progress' : ''
      }${circuitBreakerState === 'open' ? ' circuit-breaker-open' : ''}${circuitBreakerState === 'half-open' ? ' circuit-breaker-half-open' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="agent-status-bar-head">
        <span className="agent-status-pulse" aria-hidden="true" />
        <span className="agent-status-label">{label}</span>
        {orchestrating && (
          <button
            type="button"
            className="agent-orchestrating-chip"
            onClick={() => orchestratingPlan && setPlanExpanded((v) => !v)}
            title={orchestratingPlan ? 'Нажми, чтобы увидеть план' : undefined}
          >
            Планирую{orchestratingPlan ? (planExpanded ? ' ▾' : ' ▸') : '…'}
          </button>
        )}
        {(collectiveSyncStatus === 'queued' || collectiveSyncStatus === 'syncing') && (
          <span className="agent-collective-sync-chip" title="Синхронизация знаний на GitHub">
            ☁️ Память → {collectiveSyncBranch}
            {collectiveSyncPending > 0 ? ` (${collectiveSyncPending})` : ''}
            {collectiveSyncStatus === 'syncing' ? '…' : ''}
          </span>
        )}
        {collectiveSyncStatus === 'done' && (
          <span className="agent-collective-sync-chip done" title="Коллективная память обновлена">
            ☁️ GitHub ✓
          </span>
        )}
        {p2pCredits != null && (
          <span
            className="agent-collective-sync-chip"
            title="Баланс P2P-кредитов на сигнальном сервере"
          >
            {formatP2pCreditsLabel(p2pCredits)}
          </span>
        )}
      </div>
      {orchestrating && orchestratingPlan && planExpanded && (
        <pre className="agent-orchestrating-plan">{orchestratingPlan}</pre>
      )}
    </div>
  )
}
