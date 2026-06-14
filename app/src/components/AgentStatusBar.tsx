export type AgentPhase = 'thinking' | 'writing' | 'tool'

const TOOL_LABELS: Record<string, string> = {
  list_directory: 'Смотрю структуру проекта',
  read_file: 'Читаю файл',
  write_file: 'Записываю файл',
  run_command: 'Выполняю команду',
  remember: 'Запоминаю',
  search_memory: 'Ищу в памяти',
  forget: 'Удаляю из памяти',
  list_skills: 'Смотрю навыки',
  read_skill: 'Читаю навык',
  create_skill: 'Создаю навык',
  update_skill: 'Обновляю навык',
  delete_skill: 'Удаляю навык',
  read_skill_data: 'Читаю данные навыка',
  write_skill_data: 'Сохраняю данные навыка'
}

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
