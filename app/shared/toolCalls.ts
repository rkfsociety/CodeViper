export const AGENT_TOOL_NAMES = [
  'list_directory',
  'grep_files',
  'find_files',
  'read_file',
  'write_file',
  'create_file',
  'edit_file',
  'append_file',
  'delete_file',
  'move_file',
  'run_command',
  'git_status',
  'git_diff',
  'git_log',
  'remember',
  'search_memory',
  'forget',
  'list_skills',
  'read_skill',
  'create_skill',
  'update_skill',
  'delete_skill',
  'read_skill_data',
  'write_skill_data',
  'set_self_improvement_plan',
  'complete_self_improvement_item',
  'get_self_improvement_plan',
  'grep_codeviper_files',
  'find_codeviper_files',
  'list_codeviper_directory',
  'read_codeviper_file',
  'write_codeviper_file',
  'create_codeviper_file',
  'edit_codeviper_file',
  'append_codeviper_file',
  'delete_codeviper_file',
  'move_codeviper_file',
  'run_codeviper_command'
] as const

const TOOL_NAME_SET = new Set<string>(AGENT_TOOL_NAMES)

export interface ParsedToolCall {
  name: string
  arguments: Record<string, unknown>
}

function objectsToToolCalls(obj: unknown): ParsedToolCall[] | null {
  const items = Array.isArray(obj) ? obj : [obj]
  const calls: ParsedToolCall[] = []

  for (const item of items) {
    if (!item || typeof item !== 'object') return null
    const record = item as Record<string, unknown>
    const name = record.name
    if (typeof name !== 'string' || !TOOL_NAME_SET.has(name)) return null

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

function tryParseToolCallJson(text: string): ParsedToolCall[] | null {
  try {
    return objectsToToolCalls(JSON.parse(text))
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

function extractToolResponseCalls(content: string): {
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

    const parsed = tryParseToolCallJson(json)
    if (!parsed) continue

    toolCalls.push(...parsed)
    const consumed = content.slice(match.index, jsonStart + json.length)
    remaining = remaining.replace(consumed, '')
  }

  return { content: remaining.trim(), toolCalls }
}

export function extractEmbeddedToolCalls(content: string): {
  content: string
  toolCalls: ParsedToolCall[]
} {
  const toolCalls: ParsedToolCall[] = []
  let remaining = content

  const toolResponse = extractToolResponseCalls(content)
  if (toolResponse.toolCalls.length) {
    toolCalls.push(...toolResponse.toolCalls)
    remaining = toolResponse.content
  }

  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  while ((match = codeBlockRegex.exec(remaining)) !== null) {
    const parsed = tryParseToolCallJson(match[1].trim())
    if (parsed) toolCalls.push(...parsed)
  }

  if (toolCalls.length) {
    remaining = remaining.replace(codeBlockRegex, '').trim()
    return { content: remaining, toolCalls }
  }

  const parsed = tryParseToolCallJson(remaining.trim())
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

function stripMalformedToolCallPrefix(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return trimmed

  if (tryParseToolCallJson(trimmed)) return ''

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
  /я\s+не\s+могу\s+(?:просматривать|изучать|читать|открывать|выполнять|обращаться|получить)/i,
  /у\s+меня\s+нет\s+(?:доступа|возможности|способности)/i,
  /as\s+an?\s+(?:ai|language\s+model|llm|assistant)/i,
  /i\s+(?:can't|cannot|am\s+unable\s+to)\s+(?:access|read|view|browse|open|execute|directly)/i,
]

/** Модель утверждает что не может работать с файлами/инструментами — нужна эскалация. */
export function isRefusalResponse(text: string): boolean {
  return REFUSAL_PATTERNS.some((p) => p.test(text))
}
