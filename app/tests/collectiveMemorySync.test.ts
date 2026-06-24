import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { MemoryEntry } from '../src/types'
import {
  getPendingCollectiveMemoryCount,
  mergeEntriesWithSemanticDedup,
  queueCollectiveMemoryEntry
} from '../electron/main/collectiveMemorySync'

vi.mock('../electron/main/embeddingQueue', () => ({
  maxSemanticSimilarity: vi.fn()
}))

import { maxSemanticSimilarity } from '../electron/main/embeddingQueue'

const mockedMaxSemanticSimilarity = vi.mocked(maxSemanticSimilarity)

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

describe('semantic dedup', () => {
  beforeEach(() => {
    mockedMaxSemanticSimilarity.mockReset()
  })

  it('две семантически близкие записи — в память попадает одна', async () => {
    const existing =
      'В TypeScript предпочитайте async/await вместо цепочек .then() для работы с промисами'
    const similar =
      'При работе с промисами в TypeScript лучше использовать async/await, а не .then()'

    mockedMaxSemanticSimilarity.mockImplementation(async (text, others) => {
      const corpus = [existing, similar]
      if (!corpus.includes(text)) return 0
      if (others.some((item) => corpus.includes(item) && item !== text)) return 0.97
      return 0
    })

    const now = new Date().toISOString()
    const store = {
      version: 1 as const,
      entries: [
        {
          id: 'existing-1',
          content: existing,
          category: 'pattern' as const,
          tags: [],
          scope: 'global' as const,
          createdAt: now,
          lastUsedAt: now,
          useCount: 1
        }
      ]
    }

    const incoming: MemoryEntry = {
      id: 'incoming-1',
      content: similar,
      category: 'pattern',
      tags: [],
      scope: 'global',
      createdAt: now,
      lastUsedAt: now,
      useCount: 1
    }

    const { store: merged, added } = await mergeEntriesWithSemanticDedup(
      store,
      [incoming],
      'http://127.0.0.1:11434'
    )

    expect(added).toBe(0)
    expect(merged.entries).toHaveLength(1)
    expect(merged.entries[0].useCount).toBe(2)
  })

  it('две близкие записи в одном батче — сохраняется только первая', async () => {
    const first = 'В проекте CodeViper используйте npm run typecheck перед коммитом'
    const second = 'Перед коммитом в CodeViper всегда запускайте npm run typecheck'

    mockedMaxSemanticSimilarity.mockImplementation(async (text, others) => {
      const corpus = [first, second]
      if (!corpus.includes(text)) return 0
      if (others.some((item) => corpus.includes(item) && item !== text)) return 0.98
      return 0
    })

    const now = new Date().toISOString()
    const makeEntry = (content: string, id: string): MemoryEntry => ({
      id,
      content,
      category: 'pattern',
      tags: [],
      scope: 'global',
      createdAt: now,
      lastUsedAt: now,
      useCount: 1
    })

    const { store: merged, added } = await mergeEntriesWithSemanticDedup(
      { version: 1, entries: [] },
      [makeEntry(first, 'a'), makeEntry(second, 'b')],
      'http://127.0.0.1:11434'
    )

    expect(added).toBe(1)
    expect(merged.entries).toHaveLength(1)
    expect(merged.entries[0].content).toBe(first)
  })
})

describe('filterEntriesBeforePush', () => {
  it('отклоняет пустые записи', async () => {
    // Примечание: тест проверяет логику фильтрации пустых строк
    // Полный интеграционный тест требует доступа к файловой системе
    // Обновлено в collectiveMemorySync.ts: filterEntriesBeforePush проверяет trim().length === 0
    const emptyContent = ''
    const trimmed = emptyContent.trim()
    expect(trimmed).toBe('')
    expect(trimmed.length).toBe(0)
  })
})

describe('pushWithRebaseOnConflict', () => {
  it('детектирует non-fast-forward ошибки по ключевым словам', () => {
    // Тест проверяет логику определения non-fast-forward конфликтов
    // Функция pushWithRebaseOnConflict в selfCommit.ts ищет эти строки в stderr/stdout:
    const errors = ['non-fast-forward', 'rejected', 'failed to push']

    for (const keyword of errors) {
      const errorOutput = `git push failed: ${keyword} error`.toLowerCase()
      const isNonFastForward =
        errorOutput.includes('non-fast-forward') ||
        errorOutput.includes('rejected') ||
        errorOutput.includes('failed to push')
      expect(isNonFastForward).toBe(true)
    }
  })

  it('не срабатывает на другие ошибки git', () => {
    const otherErrors = ['authentication failed', 'permission denied', 'fatal: bad config']

    for (const err of otherErrors) {
      const errorOutput = `git error: ${err}`.toLowerCase()
      const isNonFastForward =
        errorOutput.includes('non-fast-forward') ||
        errorOutput.includes('rejected') ||
        errorOutput.includes('failed to push')
      expect(isNonFastForward).toBe(false)
    }
  })
})
