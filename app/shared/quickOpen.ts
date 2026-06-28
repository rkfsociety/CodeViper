import type { FileMentionItem } from './fileMentions'

/** Оценка fuzzy-совпадения: меньше — лучше; null — не подходит. */
export function fuzzyMatchPath(path: string, query: string): number | null {
  const q = query.trim().toLowerCase()
  if (!q) return 0

  const hay = path.toLowerCase()
  let qi = 0
  let score = 0
  let lastMatch = -1

  for (let hi = 0; hi < hay.length && qi < q.length; hi++) {
    if (hay[hi] !== q[qi]) continue
    if (lastMatch >= 0 && hi === lastMatch + 1) score -= 8
    if (hi === 0 || hay[hi - 1] === '/') score -= 12
    score += hi
    lastMatch = hi
    qi++
  }

  if (qi < q.length) return null
  return score
}

export function filterQuickOpenFiles(
  items: FileMentionItem[],
  query: string,
  limit = 50
): FileMentionItem[] {
  const q = query.trim()
  if (!q) {
    return items.filter((item) => !item.isDirectory).slice(0, limit)
  }

  const scored: { item: FileMentionItem; score: number }[] = []
  for (const item of items) {
    if (item.isDirectory) continue
    const score = fuzzyMatchPath(item.relativePath, q)
    if (score !== null) scored.push({ item, score })
  }

  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        a.item.relativePath.localeCompare(b.item.relativePath, undefined, {
          sensitivity: 'base'
        })
    )
    .slice(0, limit)
    .map((row) => row.item)
}
