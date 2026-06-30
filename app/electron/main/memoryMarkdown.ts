import type { MemoryStore } from '../../src/types'

export const MEMORY_STORE_MARKER = '<!-- viper-memory-store'

function emptyStore(): MemoryStore {
  return { version: 1, entries: [] }
}

export function parseMemoryMarkdown(raw: string): MemoryStore {
  const match = raw.match(/<!-- viper-memory-store\n([\s\S]*?)\n-->/)
  if (!match) return emptyStore()

  try {
    const parsed = JSON.parse(match[1]) as MemoryStore
    if (!Array.isArray(parsed.entries)) return emptyStore()
    return parsed
  } catch {
    return emptyStore()
  }
}

export function renderMemoryMarkdown(store: MemoryStore): string {
  const lines = [
    '# ViperMemory',
    '',
    'Долгосрочная память агента CodeViper. Записи добавляются через инструмент `remember`.',
    '',
    MEMORY_STORE_MARKER,
    JSON.stringify(store),
    '-->',
    '',
    '## Записи',
    ''
  ]

  if (!store.entries.length) {
    lines.push('_Пока пусто._')
  } else {
    for (const entry of store.entries) {
      const tags = entry.tags.length ? entry.tags.join(', ') : '—'
      lines.push(`### ${entry.id} · ${entry.category} · ${entry.scope}`)
      lines.push(
        `**Теги:** ${tags} · **Использовано:** ${entry.useCount} · **Обновлено:** ${entry.lastUsedAt}`
      )
      if (entry.source) lines.push(`**Источник:** ${entry.source}`)
      lines.push('')
      lines.push(entry.content)
      lines.push('')
      lines.push('---')
      lines.push('')
    }
  }

  return lines.join('\n')
}
