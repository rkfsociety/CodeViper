import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { getCodeViperSourceRoot } from './codeviperSource'
import { getBundledSourceRoot } from './bundledSourceSync'

export interface RoadmapItem {
  num: number
  size: 'S' | 'M' | 'L' | 'XL'
  title: string
  priority: string
  chain: string
}

/** ROADMAP.md в корне репозитория — не внутри app/. */
export function resolveRoadmapPath(): string | null {
  const candidates = [join(getCodeViperSourceRoot(), '..', 'ROADMAP.md')]
  try {
    candidates.push(join(getBundledSourceRoot(), 'ROADMAP.md'))
  } catch {
    /* electron app не инициализирован (vitest, node) */
  }

  const seen = new Set<string>()
  for (const candidate of candidates) {
    const path = resolve(candidate)
    if (seen.has(path)) continue
    seen.add(path)
    if (existsSync(path)) return path
  }
  return null
}

export async function listRoadmapItems(): Promise<RoadmapItem[]> {
  const roadmapPath = resolveRoadmapPath()
  if (!roadmapPath) return []

  const content = await readFile(roadmapPath, 'utf-8')
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  const items: RoadmapItem[] = []
  let inPlans = false
  let currentChain = 'Независимые'

  for (const line of lines) {
    if (line.startsWith('## 📋') || line.startsWith('## В планах')) {
      inPlans = true
      continue
    }
    if (inPlans && line.startsWith('## ') && !line.startsWith('###')) {
      inPlans = false
      continue
    }
    if (!inPlans) continue

    // Заголовок цепочки или уровня
    const chainMatch = line.match(/^###\s+[\u{1F517}\u26A1\u{1F7E0}\u{1F7E1}\u{1F7E2}]\s+(.+)/u)
    if (chainMatch) {
      currentChain = chainMatch[1].trim()
      continue
    }

    // Пункт: **N · SIZE · Title** — приор. PRIORITY | уровень N
    const itemMatch = line.match(
      /^\*\*(\d+)\s+·\s+(S|M|L|XL)\s+·\s+(.+?)\*\*(?:\s+—\s+(?:приор\.\s+(\S+)|уровень\s+(\d+)))?/
    )
    if (itemMatch) {
      items.push({
        num: parseInt(itemMatch[1], 10),
        size: itemMatch[2] as 'S' | 'M' | 'L' | 'XL',
        title: itemMatch[3].trim(),
        priority: itemMatch[4] ?? (itemMatch[5] ? `уровень ${itemMatch[5]}` : 'Low'),
        chain: currentChain
      })
    }
  }

  return items
}

/** Текстовый список для агента: num · title · chain */
export function formatRoadmapItemsList(items: RoadmapItem[]): string {
  if (items.length === 0) {
    return 'ROADMAP.md не найден или в разделе «В планах» нет пунктов.'
  }
  const lines = items.map((it) => `${it.num} · ${it.title} · ${it.chain}`)
  return `Пункты ROADMAP «В планах» (${items.length}):\n\n${lines.join('\n')}`
}
