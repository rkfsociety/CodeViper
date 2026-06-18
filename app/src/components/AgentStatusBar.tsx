import { TOOL_LABELS } from '../../shared/toolDisplay'
import { formatGenerationMetricsHint, type GenerationMetrics } from '../../shared/generationMetrics'
import type { SystemStats } from '../types'

export type AgentPhase = 'thinking' | 'writing' | 'tool'

function formatModelLabel(model: string): string {
  const name = model.trim()
  if (!name) return 'модель'
  return name.includes(':') ? name.split(':')[0]! : name
}

function formatSystemStatsHint(stats: SystemStats): string {
  const parts: string[] = [`CPU ${stats.cpu}%`]
  if (stats.gpu != null) parts.push(`GPU ${stats.gpu}%`)
  return parts.join(' / ')
}

export function agentStatusLabel(
  phase: AgentPhase,
  toolName?: string,
  model?: string,
  queueSize = 0,
  generationMetrics?: GenerationMetrics | null,
  systemStats?: SystemStats | null
): string {
  const queueHint = queueSize > 0 ? ` · в очереди ${queueSize}` : ''
  const metricsHint = generationMetrics
    ? ` · ${formatGenerationMetricsHint(generationMetrics)}`
    : ''
  const statsHint = systemStats ? ` · ${formatSystemStatsHint(systemStats)}` : ''

  if (phase === 'writing') return `Пишу ответ…${metricsHint}${statsHint}${queueHint}`
  if (phase === 'tool') {
    const label = toolName ? TOOL_LABELS[toolName] : undefined
    return `${label ?? (toolName ? `Запускаю ${toolName}` : 'Работаю с инструментом…')}${metricsHint}${statsHint}${queueHint}`
  }
  const modelLabel = formatModelLabel(model ?? '')
  return `${modelLabel} думает…${metricsHint}${statsHint}${queueHint}`
}

interface Props {
  phase: AgentPhase
  toolName?: string
  model?: string
  queueSize?: number
  summarizing?: boolean
  generationMetrics?: GenerationMetrics | null
  systemStats?: SystemStats | null
}

export function AgentStatusBar({
  phase,
  toolName,
  model,
  queueSize = 0,
  summarizing = false,
  generationMetrics = null,
  systemStats = null
}: Props) {
  const queueHint = queueSize > 0 ? ` · в очереди ${queueSize}` : ''
  const label = summarizing
    ? `Сжимаю контекст…${queueHint}`
    : agentStatusLabel(phase, toolName, model, queueSize, generationMetrics, systemStats)

  return (
    <div
      className={`agent-status-bar phase-${phase}${summarizing ? ' summarizing' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="agent-status-bar-head">
        <span className="agent-status-pulse" aria-hidden="true" />
        <span className="agent-status-label">{label}</span>
      </div>
      <div className="agent-status-track" aria-hidden="true">
        <div className="agent-status-fill" />
      </div>
    </div>
  )
}
