import type { AgentRole } from '../types'

const ROLE_META: Record<AgentRole, { label: string; icon: string; tone: string }> = {
  user: { label: 'Вы', icon: '👤', tone: 'user' },
  assistant: { label: 'CodeViper', icon: '🐍', tone: 'assistant' },
  tool: { label: 'Инструмент', icon: '⚙', tone: 'tool' },
  system: { label: 'Система', icon: 'ℹ', tone: 'system' }
}

interface Props {
  role: AgentRole
  toolName?: string
}

export function MessageRoleBadge({ role, toolName }: Props) {
  const meta = ROLE_META[role]
  const label = role === 'tool' && toolName ? toolName : meta.label

  return (
    <div className={`message-role-badge tone-${meta.tone}`} title={label}>
      <span className="message-role-icon" aria-hidden="true">
        {meta.icon}
      </span>
      <span className="message-role-text">{label}</span>
    </div>
  )
}
