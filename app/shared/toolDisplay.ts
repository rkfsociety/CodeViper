export const TOOL_LABELS: Record<string, string> = {
  list_directory: 'Смотрю структуру проекта',
  grep_files: 'Ищу текст в файлах',
  find_files: 'Ищу файлы по имени',
  read_file: 'Читаю файл',
  write_file: 'Записываю файл',
  create_file: 'Создаю файл',
  edit_file: 'Редактирую файл',
  append_file: 'Дописываю в файл',
  run_command: 'Выполняю команду',
  git_status: 'Смотрю git status',
  git_diff: 'Смотрю git diff',
  git_log: 'Смотрю git log',
  remember: 'Запоминаю',
  search_memory: 'Ищу в памяти',
  forget: 'Удаляю из памяти',
  list_skills: 'Смотрю навыки',
  read_skill: 'Читаю навык',
  create_skill: 'Создаю навык',
  update_skill: 'Обновляю навык',
  delete_skill: 'Удаляю навык',
  read_skill_data: 'Читаю данные навыка',
  write_skill_data: 'Сохраняю данные навыка',
  list_codeviper_directory: 'Смотрю исходники CodeViper',
  grep_codeviper_files: 'Ищу в коде CodeViper',
  find_codeviper_files: 'Ищу файлы CodeViper',
  read_codeviper_file: 'Читаю код CodeViper',
  write_codeviper_file: 'Правлю код CodeViper',
  create_codeviper_file: 'Создаю файл CodeViper',
  edit_codeviper_file: 'Редактирую код CodeViper',
  append_codeviper_file: 'Дописываю в CodeViper',
  run_codeviper_command: 'Команда в CodeViper',
  preview_ollama_modelfile: 'Собираю Modelfile',
  create_ollama_model: 'Создаю модель Ollama',
  set_self_improvement_plan: 'План самоулучшения',
  complete_self_improvement_item: 'Пункт выполнен',
  get_self_improvement_plan: 'Статус плана'
}

export function toolLabel(name: string | undefined): string {
  if (!name) return 'инструмент'
  return TOOL_LABELS[name] ?? name
}

function countTreeLines(output: string): number {
  return output.split('\n').filter((line) => line.trim()).length
}

function firstLine(output: string, max = 72): string {
  const line = output.trim().split('\n').find(Boolean) ?? ''
  if (line.length <= max) return line
  return `${line.slice(0, max)}…`
}

export function compactToolChatLine(
  name: string | undefined,
  output: string | undefined,
  phase: 'start' | 'end'
): string {
  const label = toolLabel(name)

  if (phase === 'start') {
    return `▶ ${label}…`
  }

  const body = output ?? ''

  switch (name) {
    case 'list_directory':
    case 'list_codeviper_directory':
    case 'grep_files':
    case 'find_files':
    case 'grep_codeviper_files':
    case 'find_codeviper_files':
    case 'git_status':
    case 'git_diff':
    case 'git_log': {
      const count = countTreeLines(body)
      return count > 0 ? `✓ ${label} — ${count} элементов` : `✓ ${label} — пусто`
    }
    case 'read_file':
    case 'read_codeviper_file': {
      const lines = body ? body.split('\n').length : 0
      return `✓ ${label} — ${lines} строк`
    }
    case 'write_file':
    case 'create_file':
    case 'edit_file':
    case 'append_file':
      return `✓ ${firstLine(body) || label}`
    case 'run_command': {
      const exit = body.match(/^exit:\s*(-?\d+)/)?.[1]
      return exit !== undefined ? `✓ ${label} — код ${exit}` : `✓ ${label}`
    }
    case 'run_codeviper_command': {
      const exit = body.match(/^exit:\s*(-?\d+)/)?.[1]
      return exit !== undefined ? `✓ ${label} — код ${exit}` : `✓ ${label}`
    }
    case 'write_codeviper_file':
    case 'create_codeviper_file':
    case 'edit_codeviper_file':
    case 'append_codeviper_file':
      return `✓ ${firstLine(body) || label}`
    case 'remember':
    case 'search_memory':
    case 'forget':
    case 'create_skill':
    case 'update_skill':
    case 'delete_skill':
    case 'create_ollama_model':
    case 'set_self_improvement_plan':
    case 'complete_self_improvement_item':
    case 'get_self_improvement_plan':
      return `✓ ${firstLine(body) || label}`
    default:
      return body.trim() ? `✓ ${label} — ${firstLine(body)}` : `✓ ${label}`
  }
}
