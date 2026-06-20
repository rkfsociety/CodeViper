import { TOOL_LABELS } from '../../shared/toolDisplay'
import { formatGenerationMetricsHint } from '../../shared/generationMetrics'
import type { ProgressInfo } from '../types'
import { useAgentState } from '../contexts/AgentContext'

export type AgentPhase = 'thinking' | 'writing' | 'tool'

function formatModelLabel(model: string): string {
  const name = model.trim()
  if (!name) return 'модель'
  return name.includes(':') ? name.split(':')[0]! : name
}

export function agentStatusLabel(
  phase: AgentPhase,
  toolName?: string,
  model?: string,
  queueSize = 0,
  generationMetrics?: import('../../shared/generationMetrics').GenerationMetrics | null
): string {
  const queueHint = queueSize > 0 ? ` · в очереди ${queueSize}` : ''
  const metricsHint = generationMetrics
    ? ` · ${formatGenerationMetricsHint(generationMetrics)}`
    : ''

  if (phase === 'writing') return `Пишу ответ…${metricsHint}${queueHint}`
  if (phase === 'tool') {
    const label = toolName ? TOOL_LABELS[toolName] : undefined
    return `${label ?? (toolName ? `Запускаю ${toolName}` : 'Работаю с инструментом…')}${metricsHint}${queueHint}`
  }
  const modelLabel = formatModelLabel(model ?? '')
  return `${modelLabel} думает…${metricsHint}${queueHint}`
}

interface Props {
  model?: string
  queueSize?: number
  progress?: ProgressInfo | null
}

export function AgentStatusBar({ model, queueSize = 0, progress = null }: Props) {
  const { agentPhase, activeToolName, summarizing, generationMetrics, runModel } = useAgentState()
  const displayModel = runModel || model

  const hasPercent = progress != null && progress.percent != null
  const label = progress
    ? `${progress.label}${progress.percent != null ? ` ${progress.percent}%` : ''}${queueSize > 0 ? ` · в очереди ${queueSize}` : ''}`
    : summarizing
      ? `Сжимаю контекст…${queueSize > 0 ? ` · в очереди ${queueSize}` : ''}`
      : agentStatusLabel(agentPhase, activeToolName, displayModel, queueSize, generationMetrics)

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
      </div>
      <div className="agent-status-track" aria-hidden="true">
        {hasPercent ? (
          <div
            className="agent-status-fill agent-status-fill-determinate"
            style={{ width: `${progress!.percent}%` }}
          />
        ) : (
          <div className="agent-status-fill" />
        )}
      </div>
    </div>
  )
}
