export const AGENT_TOOL_NAMES = [
  // Файловые операции
  'search_knowledge_base',
  'list_directory',
  'grep_files',
  'find_files',
  'find_symbol',
  'find_references',
  'search_in_project',
  'read_file',
  'read_multiple_files',
  'file_info',
  'project_stats',
  'search_in_file',
  'file_search_summary',
  'show_file_history',
  'copy_file',
  'rename_folder',
  'copy_folder',
  'preview_edit',
  'preview_patch',
  'write_file',
  'create_file',
  'edit_file',
  'undo_edit',
  'append_file',
  'delete_file',
  'move_file',
  // Команды и Git
  'run_command',
  'run_script',
  'review_code',
  'git_status',
  'git_diff',
  'git_log',
  'recent_changes',
  // GitHub
  'create_issue',
  'create_pr',
  'list_issues',
  'open_issue',
  'trigger_github_workflow',
  // GitLab
  'list_gitlab_mrs',
  'create_gitlab_mr',
  'get_gitlab_pipeline',
  // Память
  'remember',
  'search_memory',
  'forget',
  // Зависимости
  'package_info',
  'read_package_lock',
  'dependency_summary',
  'test_summary',
  // Навыки
  'list_skills',
  'read_skill',
  'create_skill',
  'update_skill',
  'delete_skill',
  'read_skill_data',
  'write_skill_data',
  // Todo
  'set_todo_list',
  'complete_todo_item',
  'clear_todo_list',
  // CodeViper self-edit
  'list_codeviper_directory',
  'grep_codeviper_files',
  'find_codeviper_files',
  'read_codeviper_file',
  'write_codeviper_file',
  'create_codeviper_file',
  'edit_codeviper_file',
  'append_codeviper_file',
  'delete_codeviper_file',
  'move_codeviper_file',
  'run_codeviper_command',
  'create_codeviper_branch',
  'push_codeviper_branch',
  'create_codeviper_pr',
  // Модели
  'preview_ollama_modelfile',
  'create_ollama_model',
  // Саморазвитие
  'set_self_improvement_plan',
  'complete_self_improvement_item',
  'get_self_improvement_plan',
  // Индексация
  'index_project',
  // Веб
  'web_fetch',
  'web_search'
] as const

const TOOL_NAME_SET = new Set<string>(AGENT_TOOL_NAMES)

function isKnownToolName(name: string, extraToolNames?: readonly string[]): boolean {
  if (TOOL_NAME_SET.has(name)) return true
  if (!extraToolNames?.length) return false
  return extraToolNames.includes(name)
}

export interface ParsedToolCall {
  name: string
  arguments: Record<string, unknown>
}

function objectsToToolCalls(
  obj: unknown,
  extraToolNames?: readonly string[]
): ParsedToolCall[] | null {
  const items = Array.isArray(obj) ? obj : [obj]
  const calls: ParsedToolCall[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object') return null
    const record = item as Record<string, unknown>
    const name = record.name
    if (typeof name !== 'string' || !isKnownToolName(name, extraToolNames)) return null

    const args = record.arguments
    calls.push({
      name,
      arguments:
        args && typeof args === 'object' && !Array.isArray(args)
          ? (args as Record<string, unknown>)
          : {}
    })
  }

  return calls.length ? calls : null
}

function tryParseToolCallJson(
  text: string,
  extraToolNames?: readonly string[]
): ParsedToolCall[] | null {
  try {
    return objectsToToolCalls(JSON.parse(text), extraToolNames)
  } catch {
    return null
  }
}

function extractBalancedJsonObject(text: string): string | null {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith('{')) return null

  let depth = 0
  let inString = false
  let escape = false

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i]
    if (inString) {
      if (escape) escape = false
      else if (char === '\\') escape = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') inString = true
    else if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) return trimmed.slice(0, i + 1)
    }
  }

  return null
}

function extractToolResponseCalls(
  content: string,
  extraToolNames?: readonly string[]
): {
  content: string
  toolCalls: ParsedToolCall[]
} {
  const toolCalls: ParsedToolCall[] = []
  let remaining = content
  const prefixRegex = /tool_response\s+/gi
  let match: RegExpExecArray | null

  while ((match = prefixRegex.exec(content)) !== null) {
    const jsonStart = match.index + match[0].length
    const afterPrefix = content.slice(jsonStart)
    const json = extractBalancedJsonObject(afterPrefix)
    if (!json) continue

    const parsed = tryParseToolCallJson(json, extraToolNames)
    if (!parsed) continue

    toolCalls.push(...parsed)
    const consumed = content.slice(match.index, jsonStart + json.length)
    remaining = remaining.replace(consumed, '')
  }

  return { content: remaining.trim(), toolCalls }
}

export function extractEmbeddedToolCalls(
  content: string,
  extraToolNames?: readonly string[]
): {
  content: string
  toolCalls: ParsedToolCall[]
} {
  const toolCalls: ParsedToolCall[] = []
  let remaining = content

  const toolResponse = extractToolResponseCalls(content, extraToolNames)
  if (toolResponse.toolCalls.length) {
    toolCalls.push(...toolResponse.toolCalls)
    remaining = toolResponse.content
  }

  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  while ((match = codeBlockRegex.exec(remaining)) !== null) {
    const parsed = tryParseToolCallJson(match[1].trim(), extraToolNames)
    if (parsed) toolCalls.push(...parsed)
  }

  if (toolCalls.length) {
    remaining = remaining.replace(codeBlockRegex, '').trim()
    return { content: remaining, toolCalls }
  }

  const parsed = tryParseToolCallJson(remaining.trim(), extraToolNames)
  if (parsed) {
    return { content: '', toolCalls: parsed }
  }

  return { content: remaining, toolCalls: [] }
}

export function sanitizeAssistantContent(content: string): string {
  let text = extractToolResponseCalls(content.trim()).content.trim()
  if (!text) return ''

  const embedded = extractEmbeddedToolCalls(text)
  text = embedded.content.trim()

  text = text
    .replace(/```(?:json)?\s*([\s\S]*?)```/gi, (_, inner: string) => {
      const innerTrim = inner.trim()
      if (tryParseToolCallJson(innerTrim)) return ''
      return stripMalformedToolCallPrefix(innerTrim)
    })
    .trim()

  return stripMalformedToolCallPrefix(text).trim()
}

function looksLikeToolCallAttempt(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  const r = obj as Record<string, unknown>
  // {"name": "...", "arguments": {...}} — прямой вызов с неизвестным именем
  if (typeof r.name === 'string' && ('arguments' in r || 'parameters' in r)) return true
  // {"type": "...", "function": {"name": "...", ...}} — формат OpenAI tool definition
  if (typeof r.type === 'string' && r.function && typeof r.function === 'object') return true
  // {"function": {"name": "...", "description": "...", "parameters": {}}}
  if (r.function && typeof r.function === 'object') {
    const fn = r.function as Record<string, unknown>
    if (typeof fn.name === 'string' && ('description' in fn || 'parameters' in fn)) return true
  }
  return false
}

function stripMalformedToolCallPrefix(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return trimmed

  if (tryParseToolCallJson(trimmed)) return ''

  // Скрываем JSON, который выглядит как попытка вызова инструмента с неизвестным именем
  try {
    const obj = JSON.parse(trimmed)
    if (looksLikeToolCallAttempt(obj)) return ''
  } catch {
    // не валидный JSON — оставляем как есть
  }

  if (/^\{\s*"name(?!\s*"\s*:)/.test(trimmed)) {
    return trimmed.replace(/^\{\s*"name/, '').trim()
  }

  const afterToolJson = trimmed.match(
    /^\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[\s\S]*?\}\s*([\s\S]+)/
  )
  if (afterToolJson) return afterToolJson[1].trim()

  return trimmed
}

export function looksLikeEmbeddedToolCall(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  const { toolCalls, content } = extractEmbeddedToolCalls(trimmed)
  if (toolCalls.length > 0 && !content.trim()) return true

  return sanitizeAssistantContent(trimmed).length === 0 && trimmed.length > 0
}

const REFUSAL_PATTERNS: RegExp[] = [
  /как\s+(?:ai|ии|языковая\s+модель|llm|ассистент)/i,
  /я\s+не\s+могу\s+(?:просматривать|изучать|читать|открывать|выполнять|обращаться|получить|запускать|обрабатывать|работать|видеть|напрямую)/i,
  /напрямую\s+из\s+чата/i,
  /у\s+меня\s+нет\s+(?:доступа|возможности|способности)/i,
  /as\s+an?\s+(?:ai|language\s+model|llm|assistant)/i,
  /i\s+(?:can't|cannot|am\s+unable\s+to)\s+(?:access|read|view|browse|open|execute|directly)/i
]

/** Модель утверждает что не может работать с файлами/инструментами — нужна эскалация. */
export function isRefusalResponse(text: string): boolean {
  return REFUSAL_PATTERNS.some((p) => p.test(text))
}
