import type { FileNode } from '../src/types'

export interface FileMentionItem {
  relativePath: string
  isDirectory: boolean
}

/** Разворачивает дерево проекта в плоский список относительных путей. */
export function flattenFileTree(nodes: FileNode[], base = ''): FileMentionItem[] {
  const items: FileMentionItem[] = []
  for (const node of nodes) {
    const rel = base ? `${base}/${node.name}` : node.name
    const relativePath = rel.replace(/\\/g, '/')
    items.push({ relativePath, isDirectory: node.isDirectory })
    if (node.children?.length) {
      items.push(...flattenFileTree(node.children, relativePath))
    }
  }
  return items
}

/** Активное @-упоминание под курсором (префикс пути после @). */
export function getActiveFileMention(
  text: string,
  cursor: number
): { start: number; query: string } | null {
  const before = text.slice(0, cursor)
  const match = before.match(/(^|[\s([{])@([^\s@]*)$/)
  if (!match) return null
  const query = match[2] ?? ''
  const start = before.length - query.length - 1
  return { start, query }
}

/** Фильтр путей по префиксу запроса (@src → src/…). */
export function filterFileMentionPaths(
  items: FileMentionItem[],
  query: string,
  limit = 50
): FileMentionItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items.slice(0, limit)

  const matched = items.filter(({ relativePath }) => {
    const path = relativePath.toLowerCase()
    if (path.startsWith(q)) return true
    const segments = path.split('/')
    return segments.some((segment) => segment.startsWith(q))
  })

  return matched.slice(0, limit)
}

/** Вставляет @path вместо текущего упоминания. */
export function insertFileMention(
  text: string,
  mentionStart: number,
  cursor: number,
  relativePath: string
): { value: string; cursor: number } {
  const before = text.slice(0, mentionStart)
  const after = text.slice(cursor)
  const mention = `@${relativePath.replace(/\\/g, '/')}`
  const value = `${before}${mention}${after}`
  return { value, cursor: before.length + mention.length }
}
