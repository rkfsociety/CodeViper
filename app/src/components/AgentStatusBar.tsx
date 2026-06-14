import { TOOL_LABELS } from '../../shared/toolDisplay'

export type AgentPhase = 'thinking' | 'writing' | 'tool'

function formatModelLabel(model: string): string {
  const name = model.trim()
  if (!name) return 'модель'
  return name.includes(':') ? name.split(':')[0]! : name
}

export function agentStatusLabel(phase: AgentPhase, toolName?: string, model?: string): string {
  if (phase === 'writing') return 'Пишу ответ…'
  if (phase === 'tool') {
    const label = toolName ? TOOL_LABELS[toolName] : undefined
    return label ?? (toolName ? `Запускаю ${toolName}` : 'Работаю с инструментом…')
  }
  const modelLabel = formatModelLabel(model ?? '')
  return `${modelLabel} думает…`
}

interface Props {
  phase: AgentPhase
  toolName?: string
  model?: string
}

export function AgentStatusBar({ phase, toolName, model }: Props) {
  const label = agentStatusLabel(phase, toolName, model)

  return (
    <div className={`agent-status-bar phase-${phase}`} role="status" aria-live="polite">
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
