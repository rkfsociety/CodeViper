import type { AgentRole } from '../types'

const ROLE_ICONS: Record<AgentRole, string> = {
  user: '🧑‍💻',
  assistant: '🤖',
  tool: '⚙️',
  system: 'ℹ️'
}

interface Props {
  role: AgentRole
  toolName?: string
}

export function MessageRoleBadge({ role, toolName }: Props) {
  const icon = ROLE_ICONS[role]
  const title = role === 'tool' && toolName ? toolName : role

  return (
    <span className="role-icon" title={title} aria-label={title}>
      {icon}
    </span>
  )
}
