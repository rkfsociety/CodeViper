import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { getCodeViperSourceRoot } from './codeviperSource'

export interface RoadmapItem {
  num: number
  size: 'S' | 'M' | 'L' | 'XL'
  title: string
  priority: string
  chain: string
}

export async function listRoadmapItems(): Promise<RoadmapItem[]> {
  const appRoot = getCodeViperSourceRoot()
  const roadmapPath = join(appRoot, '..', 'ROADMAP.md')
  if (!existsSync(roadmapPath)) return []

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
    if (line.startsWith('## ✅') || line.startsWith('## Сделано')) {
      inPlans = false
      continue
    }
    if (!inPlans) continue

    // Заголовок цепочки
    const chainMatch = line.match(/^###\s+[\u{1F517}⚡]\s+(.+)/u)
    if (chainMatch) {
      currentChain = chainMatch[1].trim()
      continue
    }

    // Пункт: **N · SIZE · Title** — приор. PRIORITY
    const itemMatch = line.match(
      /^\*\*(\d+)\s+·\s+(S|M|L|XL)\s+·\s+(.+?)\*\*(?:\s+—\s+приор\.\s+(\S+))?/
    )
    if (itemMatch) {
      items.push({
        num: parseInt(itemMatch[1], 10),
        size: itemMatch[2] as 'S' | 'M' | 'L' | 'XL',
        title: itemMatch[3].trim(),
        priority: itemMatch[4] ?? 'Low',
        chain: currentChain
      })
    }
  }

  return items
}
