import { TOOL_LABELS } from '../../shared/toolDisplay'
import { formatGenerationMetricsHint, type GenerationMetrics } from '../../shared/generationMetrics'

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
  generationMetrics?: GenerationMetrics | null
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
  phase: AgentPhase
  toolName?: string
  model?: string
  queueSize?: number
  /** Идёт сжатие контекста — показываем отдельную метку поверх обычной фазы */
  summarizing?: boolean
  /** Метрики последнего шага генерации (tok/s, длительность) */
  generationMetrics?: GenerationMetrics | null
}

export function AgentStatusBar({
  phase,
  toolName,
  model,
  queueSize = 0,
  summarizing = false,
  generationMetrics = null
}: Props) {
  const queueHint = queueSize > 0 ? ` · в очереди ${queueSize}` : ''
  const label = summarizing
    ? `Сжимаю контекст…${queueHint}`
    : agentStatusLabel(phase, toolName, model, queueSize, generationMetrics)

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
