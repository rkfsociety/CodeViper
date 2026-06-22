import { describe, expect, it } from 'vitest'
import type { MemoryEntry } from '../src/types'
import {
  getPendingCollectiveMemoryCount,
  queueCollectiveMemoryEntry
} from '../electron/main/collectiveMemorySync'

function entry(content: string, scope: 'global' | 'project' = 'global'): MemoryEntry {
  const now = new Date().toISOString()
  return {
    id: `id-${content}`,
    content,
    category: 'pattern',
    tags: [],
    scope,
    createdAt: now,
    lastUsedAt: now,
    useCount: 1
  }
}

describe('collectiveMemorySync queue', () => {
  it('ставит в очередь только global знания', () => {
    const before = getPendingCollectiveMemoryCount()
    expect(queueCollectiveMemoryEntry(entry('локальное', 'project'))).toBe(false)
    expect(getPendingCollectiveMemoryCount()).toBe(before)
    expect(queueCollectiveMemoryEntry(entry(`глобальное-${Date.now()}`))).toBe(true)
    expect(getPendingCollectiveMemoryCount()).toBe(before + 1)
  })

  it('дедуплицирует очередь по содержимому', () => {
    const unique = `уникальное-${Date.now()}-${Math.random()}`
    const before = getPendingCollectiveMemoryCount()
    expect(queueCollectiveMemoryEntry(entry(unique))).toBe(true)
    expect(queueCollectiveMemoryEntry(entry(unique))).toBe(false)
    expect(getPendingCollectiveMemoryCount()).toBe(before + 1)
  })
})
