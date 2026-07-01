export const TOOL_LABELS: Record<string, string> = {
  list_directory: 'Смотрю структуру проекта',
  grep_files: 'Ищу текст в файлах',
  find_files: 'Ищу файлы по имени',
  read_file: 'Читаю файл',
  file_info: 'Смотрю метаданные файла',
  project_stats: 'Смотрю сводку проекта',
  generate_project_metrics: 'Считаю метрики проекта',
  recent_changes: 'Смотрю последние изменения',
  package_info: 'Читаю package.json',
  read_package_lock: 'Читаю package-lock.json',
  dependency_summary: 'Смотрю зависимости',
  test_summary: 'Смотрю тестовые команды',
  file_search_summary: 'Сводка поиска по файлам',
  write_file: 'Записываю файл',
  create_file: 'Создаю файл',
  edit_file: 'Редактирую файл',
  append_file: 'Дописываю в файл',
  copy_file: 'Копирую файл',
  rename_folder: 'Переименовываю папку',
  copy_folder: 'Копирую папку',
  run_command: 'Выполняю команду',
  git_status: 'Смотрю git status',
  git_diff: 'Смотрю git diff',
  git_log: 'Смотрю git log',
  git_commit: 'Создаю git commit',
  git_push: 'Отправляю git push',
  git_checkout: 'Переключаю ветку git',
  git_stash: 'Сохраняю в git stash',
  git_stash_pop: 'Восстанавливаю git stash',
  create_issue: 'Создаю issue',
  create_pr: 'Создаю PR',
  list_issues: 'Смотрю issues',
  open_issue: 'Открываю issue',
  trigger_github_workflow: 'Запускаю workflow',
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
  find_skill_file_issues: 'Проверяю SKILL.md',
  find_index_param_issues: 'Проверяю параметры индексации',
  find_p2p_connection_issues: 'Checking P2P connection',
  delegate_to_reviewer: 'Ревью…',
  index_project: 'Индексирую проект'
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

const FILE_PATH_TOOLS = new Set([
  'read_file',
  'write_file',
  'create_file',
  'edit_file',
  'append_file',
  'copy_file',
  'delete_file',
  'move_file',
  'undo_edit',
  'file_info',
  'read_multiple_files'
])

function parseToolInput(toolInput?: string): Record<string, unknown> | null {
  if (!toolInput?.trim()) return null
  try {
    return JSON.parse(toolInput) as Record<string, unknown>
  } catch {
    return null
  }
}

function shortenPath(path: string, max = 56): string {
  const normalized = path.replace(/\\/g, '/').trim()
  if (normalized.length <= max) return normalized
  const parts = normalized.split('/')
  if (parts.length <= 2) return `…${normalized.slice(-(max - 1))}`
  return `…/${parts.slice(-2).join('/')}`
}

function pathFromToolInput(input: Record<string, unknown> | null): string | undefined {
  if (!input) return undefined
  const path = input.path
  if (typeof path === 'string' && path.trim()) return shortenPath(path)
  const paths = input.paths
  if (Array.isArray(paths)) {
    const files = paths.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0
    )
    if (files.length === 1) return shortenPath(files[0])
    if (files.length > 1) return `${files.length} файлов`
  }
  const from = input.from
  const to = input.to
  if (typeof from === 'string' && typeof to === 'string' && from.trim() && to.trim()) {
    return `${shortenPath(from, 28)} → ${shortenPath(to, 28)}`
  }
  return undefined
}

function pathFromToolOutput(output: string): string | undefined {
  const body = output.trim()
  if (!body) return undefined

  const fileHeader = body.match(/^\[Файл:\s*([^\]|]+)/)?.[1]?.trim()
  if (fileHeader) return shortenPath(fileHeader)

  const statusLine = body
    .match(/^Файл (?:записан|создан|изменён|восстановлен|удалён):?\s*(.+)$/m)?.[1]
    ?.trim()
  if (statusLine) return shortenPath(statusLine.replace(/\s*\(.*\)$/, ''))

  const appended = body.match(/^Добавлено в конец:\s*(.+)$/m)?.[1]?.trim()
  if (appended) return shortenPath(appended)

  const moved = body.match(/^Файл (?:перемещён|скопирован):\s*(.+)$/m)?.[1]?.trim()
  if (moved) {
    const [from, to] = moved.split('→').map((part) => part.trim())
    if (from && to) return `${shortenPath(from, 28)} → ${shortenPath(to, 28)}`
    return shortenPath(moved)
  }

  const infoLine = body.match(/^Файл:\s*(.+)$/m)?.[1]?.trim()
  if (infoLine && !/^\d/.test(infoLine)) {
    return shortenPath(infoLine.split('|')[0]?.trim() ?? infoLine)
  }

  return undefined
}

export function extractToolFilePath(
  name: string | undefined,
  toolInput?: string,
  output?: string
): string | undefined {
  if (!name || !FILE_PATH_TOOLS.has(name)) return undefined
  return pathFromToolInput(parseToolInput(toolInput)) ?? pathFromToolOutput(output ?? '')
}

function withFilePath(label: string, filePath: string | undefined, suffix?: string): string {
  const tail = suffix ? ` — ${suffix}` : ''
  return filePath ? `${label} — ${filePath}${tail}` : suffix ? `${label}${tail}` : label
}

export function compactToolChatLine(
  name: string | undefined,
  output: string | undefined,
  phase: 'start' | 'end',
  toolInput?: string
): string {
  const label = toolLabel(name)
  const filePath = extractToolFilePath(name, toolInput, output)

  if (phase === 'start') {
    return `▶ ${withFilePath(label, filePath)}…`
  }

  const body = output ?? ''

  switch (name) {
    case 'list_directory':
    case 'grep_files':
    case 'find_files':
    case 'git_status':
    case 'git_diff':
    case 'git_log': {
      const count = countTreeLines(body)
      return count > 0 ? `✓ ${label} — ${count} элементов` : `✓ ${label} — пусто`
    }
    case 'read_file':
    case 'read_multiple_files': {
      const lines = body ? body.split('\n').length : 0
      return `✓ ${withFilePath(label, filePath, `${lines} строк`)}`
    }
    case 'write_file':
    case 'create_file':
    case 'edit_file':
    case 'append_file':
    case 'delete_file':
    case 'undo_edit':
    case 'move_file':
    case 'copy_file':
      return filePath ? `✓ ${withFilePath(label, filePath)}` : `✓ ${firstLine(body) || label}`
    case 'run_command': {
      const exit = body.match(/^exit:\s*(-?\d+)/)?.[1]
      return exit !== undefined ? `✓ ${label} — код ${exit}` : `✓ ${label}`
    }
    case 'git_commit': {
      const exit = body.match(/^exit:\s*(-?\d+)/)?.[1]
      return exit !== undefined ? `✓ ${label} — код ${exit}` : `✓ ${label}`
    }
    case 'git_push': {
      const exit = body.match(/^exit:\s*(-?\d+)/)?.[1]
      return exit !== undefined ? `✓ ${label} — код ${exit}` : `✓ ${label}`
    }
    case 'git_checkout':
    case 'git_stash':
    case 'git_stash_pop': {
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
      return filePath ? `✓ ${withFilePath(label, filePath)}` : `✓ ${firstLine(body) || label}`
    case 'file_info':
      return filePath ? `✓ ${withFilePath(label, filePath)}` : `✓ ${firstLine(body) || label}`
    case 'remember':
    case 'search_memory':
    case 'forget':
    case 'create_skill':
    case 'update_skill':
    case 'delete_skill':
    case 'create_ollama_model':
      return `✓ ${firstLine(body) || label}`
    default:
      return body.trim() ? `✓ ${label} — ${firstLine(body)}` : `✓ ${label}`
  }
}
