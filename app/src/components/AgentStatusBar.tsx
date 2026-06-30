import { useState, useEffect, useReducer } from 'react'
import { TOOL_LABELS } from '../../shared/toolDisplay'
import {
  formatGenerationMetricsHint,
  formatElapsed,
  formatTokenCount,
  formatCostUsd
} from '../../shared/generationMetrics'
import type { ProgressInfo } from '../types'
import { useAgentState } from '../contexts/AgentContext'
import type { AgentPhase } from '../contexts/agentPhase'
import type { RunStats } from '../../shared/generationMetrics'

const srOnlyStyle = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0
} as const

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

function formatAgentLivePhrase(phase: AgentPhase): string {
  if (phase === 'idle') return 'Готово'
  return 'Агент работает'
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
  if (phase === 'idle') return `Готов${statsHint}${queueHint}`
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

export function formatP2pOfflineLabel(): string {
  return 'P2P offline'
}

export function formatIndexProgressChip(percent: number): string {
  return `Индекс ${percent}%`
}

interface Props {
  model?: string
  queueSize?: number
  queueItems?: Array<{ id: string; text: string }>
  onRemoveFromQueue?: (index: number) => void
  progress?: ProgressInfo | null
  /** Прогресс фоновой индексации (autoIndexOnOpen), когда агент не занят */
  indexPercent?: number | null
  p2pCredits?: number | null
  /** WSS к сигнальному серверу оборван (сервер остановлен и т.п.) */
  p2pOffline?: boolean
}

export function AgentStatusBar({
  model,
  queueSize = 0,
  queueItems = [],
  onRemoveFromQueue,
  progress = null,
  indexPercent: indexPercentProp = null,
  p2pCredits = null,
  p2pOffline = false
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
    exploring,
    editing,
    retry429,
    circuitBreakerState,
    circuitBreakerOpenUntilMs,
    collectiveSyncStatus,
    collectiveSyncBranch,
    collectiveSyncPending,
    indexProgress
  } = useAgentState()
  const displayModel = runModel || model
  const [planExpanded, setPlanExpanded] = useState(false)

  const resolvedIndexPercent =
    indexPercentProp ??
    indexProgress ??
    (progress?.label?.startsWith('Индексация') ? progress.percent : null)

  // Форсируем ре-рендер каждую секунду для живого обратного отсчёта (429, circuit breaker).
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (circuitBreakerState !== 'open' && !retry429) return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [circuitBreakerState, retry429])

  const cbSecsLeft =
    circuitBreakerOpenUntilMs != null
      ? Math.max(0, Math.ceil((circuitBreakerOpenUntilMs - Date.now()) / 1000))
      : 0

  const retrySecsLeft = retry429
    ? Math.max(0, Math.ceil((retry429.untilMs - Date.now()) / 1000))
    : 0

  const label =
    circuitBreakerState === 'open'
      ? `⚡ Провайдер недоступен — слишком много ошибок${cbSecsLeft > 0 ? ` (~${cbSecsLeft} с)` : ''}${queueSize > 0 ? ` · в очереди ${queueSize}` : ''}`
      : circuitBreakerState === 'half-open'
        ? `⚡ Проверяю соединение с провайдером…${queueSize > 0 ? ` · в очереди ${queueSize}` : ''}`
        : retry429
          ? `Лимит запросов, осталось ${retrySecsLeft} с… (попытка ${retry429.attempt}/4)${queueSize > 0 ? ` · в очереди ${queueSize}` : ''}`
          : resolvedIndexPercent != null
            ? agentStatusLabel(
                agentPhase,
                activeToolName,
                displayModel,
                queueSize,
                generationMetrics,
                runStats
              )
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
  const liveText = formatAgentLivePhrase(agentPhase)
  const queuedItems = queueItems.slice(0, queueSize)

  return (
    <div
      className={`agent-status-bar phase-${agentPhase}${summarizing ? ' summarizing' : ''}${
        progress || resolvedIndexPercent != null ? ' has-progress' : ''
      }${circuitBreakerState === 'open' ? ' circuit-breaker-open' : ''}${circuitBreakerState === 'half-open' ? ' circuit-breaker-half-open' : ''}`}
    >
      <span role="status" aria-live="polite" aria-atomic="true" style={srOnlyStyle}>
        {liveText}
      </span>
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
        {exploring && (
          <span className="agent-orchestrating-chip" title="Субагент-разведчик анализирует проект">
            Разведываю…
          </span>
        )}
        {editing && (
          <span className="agent-orchestrating-chip" title="Субагент-редактор выполняет задачу">
            Редактирую…
          </span>
        )}
        {resolvedIndexPercent != null && (
          <span className="agent-orchestrating-chip" title="Индексация проекта в Qdrant">
            {formatIndexProgressChip(resolvedIndexPercent)}
          </span>
        )}
        {generationMetrics?.estimatedCostUsd != null &&
          generationMetrics.estimatedCostUsd > 0 &&
          agentPhase === 'idle' && (
            <span
              className="agent-collective-sync-chip"
              title={`Оценка стоимости сессии: входные ${generationMetrics.sessionInputTokens ?? '?'} tok · выходные ${generationMetrics.sessionOutputTokens ?? '?'} tok · кэш ${generationMetrics.sessionCacheReadTokens ?? 0} tok`}
            >
              ~{formatCostUsd(generationMetrics.estimatedCostUsd)}
            </span>
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
        {p2pOffline && (
          <span
            className="agent-collective-sync-chip offline"
            title="Нет соединения с P2P-сигнальным сервером (WSS отключён)"
          >
            {formatP2pOfflineLabel()}
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
      {queuedItems.length > 0 && (
        <div className="agent-status-queue" aria-label="Очередь сообщений">
          {queuedItems.map((item, index) => (
            <div className="agent-status-queue-item" key={`${item.id}-${index}`}>
              <span className="agent-status-queue-text" title={item.text}>
                {item.text}
              </span>
              {onRemoveFromQueue && (
                <button
                  type="button"
                  className="agent-status-queue-remove"
                  aria-label={`Удалить сообщение из очереди: ${item.text}`}
                  title="Удалить из очереди"
                  onClick={() => onRemoveFromQueue(index)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {orchestrating && orchestratingPlan && planExpanded && (
        <pre className="agent-orchestrating-plan">{orchestratingPlan}</pre>
      )}
    </div>
  )
}
