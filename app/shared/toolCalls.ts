export const AGENT_TOOL_NAMES = [
  'list_directory',
  'read_file',
  'write_file',
  'run_command',
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
  'write_codeviper_file',
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

export function extractEmbeddedToolCalls(content: string): {
  content: string
  toolCalls: ParsedToolCall[]
} {
  const toolCalls: ParsedToolCall[] = []
  let remaining = content

  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi
  let match: RegExpExecArray | null
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const parsed = tryParseToolCallJson(match[1].trim())
    if (parsed) toolCalls.push(...parsed)
  }

  if (toolCalls.length) {
    remaining = content.replace(codeBlockRegex, '').trim()
    return { content: remaining, toolCalls }
  }

  const parsed = tryParseToolCallJson(content.trim())
  if (parsed) {
    return { content: '', toolCalls: parsed }
  }

  return { content, toolCalls: [] }
}

export function sanitizeAssistantContent(content: string): string {
  let text = content.trim()
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
