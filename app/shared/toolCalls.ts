export const AGENT_TOOL_NAMES = [
  // Файловые операции
  'search_knowledge_base',
  'list_directory',
  'grep_files',
  'find_files',
  'find_symbol',
  'find_references',
  'find_slow_code',
  'generate_dependency_diagram',
  'generate_class_diagram',
  'generate_dataflow_diagram',
  'generate_project_metrics',
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
  'format_project',
  'git_status',
  'git_diff',
  'git_log',
  'git_commit',
  'git_push',
  'git_checkout',
  'git_stash',
  'git_stash_pop',
  'recent_changes',
  // GitHub
  'check_github_auth',
  'create_issue',
  'report_trace_to_github',
  'create_pr',
  'list_issues',
  'list_pull_requests',
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
  // Индексация
  'index_project',
  // Веб
  'web_fetch',
  'web_search',
  'check_cve',
  // Субагент-редактор
  'delegate_to_editor',
  // Тесты
  'run_tests'
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

/** JSON `{"name":"…","arguments":{…}}` внутри prose (qwen часто пишет пояснение, затем JSON). */
function extractInlineJsonToolCalls(
  content: string,
  extraToolNames?: readonly string[]
): {
  content: string
  toolCalls: ParsedToolCall[]
} {
  const toolCalls: ParsedToolCall[] = []
  let remaining = content
  const needle = '{"name"'
  let searchFrom = 0

  while (searchFrom < remaining.length) {
    const idx = remaining.indexOf(needle, searchFrom)
    if (idx === -1) break

    const json = extractBalancedJsonObject(remaining.slice(idx))
    if (json) {
      const parsed = tryParseToolCallJson(json, extraToolNames)
      if (parsed) {
        toolCalls.push(...parsed)
        remaining = (remaining.slice(0, idx) + remaining.slice(idx + json.length)).trim()
        searchFrom = Math.max(0, idx - 1)
        continue
      }
    }
    searchFrom = idx + needle.length
  }

  return { content: remaining.trim(), toolCalls }
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

/** Обрыв предыдущего JSON-стрима qwen: ведущая `}` перед `{"name":…}`. */
function stripLeadingOrphanBrace(text: string): string {
  return text.replace(/^\s*\}\s*(?=\{)/, '').trimStart()
}

export function extractEmbeddedToolCalls(
  content: string,
  extraToolNames?: readonly string[]
): {
  content: string
  toolCalls: ParsedToolCall[]
} {
  const toolCalls: ParsedToolCall[] = []
  let remaining = stripLeadingOrphanBrace(content)

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

  const inline = extractInlineJsonToolCalls(remaining, extraToolNames)
  if (inline.toolCalls.length) {
    return inline
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

function stripTrailingToolCallDraft(text: string): string {
  const fenceIdx = text.search(/\n\s*```(?:json)?\b/i)
  if (fenceIdx !== -1) return text.slice(0, fenceIdx).trim()

  const inlineIdx = text.search(/\n\s*\{\s*"name"\s*:\s*"/)
  if (inlineIdx !== -1) return text.slice(0, inlineIdx).trim()

  return text
}

/** Незавершённый JSON/markdown tool call во время стрима модели (qwen, Ollama text-based). */
export function looksLikePartialToolCallStream(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  if (looksLikeEmbeddedToolCall(trimmed)) return true

  if (/^```(?:json)?\s*$/i.test(trimmed)) return true
  if (/^```(?:json)?[\s\n]*\{/.test(trimmed)) return true

  const fenceOpen = trimmed.match(/```(?:json)?/i)
  if (fenceOpen) {
    const afterOpen = trimmed.slice(fenceOpen.index! + fenceOpen[0].length)
    if (!afterOpen.includes('```')) {
      const body = afterOpen.trimStart()
      if (/^\{/.test(body) && (body.includes('"name"') || body.includes('"arguments"'))) {
        return true
      }
    }
  }

  if (/^\{\s*"name"\s*:\s*"/.test(trimmed)) return true
  if (/^\}\s*\n?\s*\{\s*"name"/.test(trimmed)) return true

  if (/tool_response\b/i.test(trimmed) && /\{/.test(trimmed)) {
    const jsonPart = trimmed.replace(/^[\s\S]*?tool_response\s+/i, '').trimStart()
    if (/^\{/.test(jsonPart) && !extractBalancedJsonObject(jsonPart)) return true
  }

  if (
    trimmed.startsWith('{') &&
    trimmed.includes('"name"') &&
    !extractBalancedJsonObject(trimmed)
  ) {
    return true
  }

  if (/\n\s*```(?:json)?\b/i.test(trimmed)) return true
  if (/\n\s*\{\s*"name"\s*:\s*"/.test(trimmed)) return true

  return false
}

function stripMalformedToolCallPrefix(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return trimmed

  if (tryParseToolCallJson(trimmed)) return ''

  if (/^\{\s*"name"\s*:\s*"[^"]+"\s*,/.test(trimmed) && trimmed.includes('"arguments"')) {
    if (!extractBalancedJsonObject(trimmed)) return ''
  }

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

/** Текст ассистента для UI: prose без JSON tool call; при стриме скрывает незавершённые вызовы. */
export function visibleAssistantContent(content: string, streaming = false): string {
  let text = content
  if (streaming && looksLikePartialToolCallStream(text)) {
    text = stripTrailingToolCallDraft(text)
    if (looksLikePartialToolCallStream(text)) return ''
  }
  return sanitizeAssistantContent(text)
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
