/** Basenames из строки «Файлы:» в ROADMAP/самоулучшении. */
export function extractTaskFileBasenames(userMessage: string): string[] {
  const match = userMessage.match(/(?:^|\n)\s*Файлы:\s*([^\n]+)/iu)
  if (!match) return []
  return match[1]
    .split(/[,;]/)
    .map((s) => s.trim().replace(/^[`'"]|[`'"]$/g, ''))
    .filter((s) => s.length > 0)
    .map((s) => {
      const parts = s.replace(/\\/g, '/').split('/')
      return parts[parts.length - 1] ?? s
    })
    .filter(Boolean)
}

type ToolCallLike = {
  function?: { name?: string; arguments?: string }
}

type MessageLike = {
  role?: string
  content?: string
  tool_calls?: ToolCallLike[]
}

/** Был ли read_file по одному из файлов задачи (по basename). */
export function wasAnyTaskFileRead(messages: MessageLike[], basenames: string[]): boolean {
  if (!basenames.length) return true
  const lower = basenames.map((b) => b.toLowerCase())

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) {
        if (tc.function?.name !== 'read_file') continue
        const raw = tc.function.arguments ?? ''
        let path = ''
        try {
          const parsed = JSON.parse(raw) as { path?: string }
          path = String(parsed.path ?? '')
        } catch {
          const m = raw.match(/"path"\s*:\s*"([^"]+)"/)
          path = m?.[1] ?? ''
        }
        const base = path.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? ''
        if (base && lower.includes(base)) return true
      }
    }
    if (msg.role === 'tool' && typeof msg.content === 'string') {
      const content = msg.content.toLowerCase()
      if (content.startsWith('инструмент read_file:')) {
        for (const base of lower) {
          if (content.includes(base)) return true
        }
      }
    }
  }
  return false
}

export function buildTaskFilesUnreadNudge(basenames: string[]): string {
  return `⚠️ В задаче указаны файлы: ${basenames.join(', ')}.
Прочитай их через read_file (пути из find_files или app/electron/main/).
Не ищи src/ в корне — в CodeViper исходники в app/. Затем переходи к правкам (edit_file / write_file).`
}
