import { useState } from 'react'
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

interface Props {
  model?: string
  queueSize?: number
  progress?: ProgressInfo | null
}

export function AgentStatusBar({ model, queueSize = 0, progress = null }: Props) {
  const {
    agentPhase,
    activeToolName,
    summarizing,
    generationMetrics,
    runModel,
    runStats,
    orchestrating,
    orchestratingPlan,
    retry429
  } = useAgentState()
  const displayModel = runModel || model
  const [planExpanded, setPlanExpanded] = useState(false)

  const label = retry429
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
      }`}
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
      </div>
      {orchestrating && orchestratingPlan && planExpanded && (
        <pre className="agent-orchestrating-plan">{orchestratingPlan}</pre>
      )}
    </div>
  )
}
