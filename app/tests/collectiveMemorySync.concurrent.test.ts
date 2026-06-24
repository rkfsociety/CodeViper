import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { MemoryEntry } from '../src/types'
import { renderMemoryMarkdown } from '../electron/main/memory'

const syncTestState = vi.hoisted(() => ({
  fileContent: '',
  activeMergeCount: 0,
  maxConcurrentMerges: 0,
  mergeDelayMs: 50
}))

const EMPTY_MEMORY_MD = renderMemoryMarkdown({ version: 1, entries: [] })

vi.mock('fs', () => ({
  existsSync: vi.fn(() => Boolean(syncTestState.fileContent))
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => syncTestState.fileContent || EMPTY_MEMORY_MD),
  writeFile: vi.fn(async (_path: string, content: string) => {
    syncTestState.activeMergeCount += 1
    syncTestState.maxConcurrentMerges = Math.max(
      syncTestState.maxConcurrentMerges,
      syncTestState.activeMergeCount
    )
    await new Promise((resolve) => setTimeout(resolve, syncTestState.mergeDelayMs))
    syncTestState.fileContent = content
    syncTestState.activeMergeCount -= 1
  }),
  mkdir: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../electron/main/settings', () => ({
  loadSettings: vi.fn().mockResolvedValue({ ollamaUrl: 'http://127.0.0.1:11434' })
}))

vi.mock('../electron/main/collectiveScores', () => ({
  loadScores: vi.fn().mockResolvedValue({}),
  COLLECTIVE_SCORE_HIDE_THRESHOLD: -2
}))

vi.mock('../electron/main/codeviperSource', () => ({
  getCodeViperSourceRoot: vi.fn(() => '/mock/repo')
}))

vi.mock('../electron/main/selfCommit', () => ({
  getRepoRoot: vi.fn().mockResolvedValue('/mock/repo'),
  commitAndPushRepoPaths: vi
    .fn()
    .mockResolvedValue({ ok: true, message: 'pushed', branch: 'agent/test' }),
  createCodeViperPr: vi.fn()
}))

vi.mock('../electron/main/embeddingQueue', () => ({
  maxSemanticSimilarity: vi.fn().mockResolvedValue(0)
}))

function makeEntry(id: string, content: string): MemoryEntry {
  const now = new Date().toISOString()
  return {
    id,
    content,
    category: 'pattern',
    tags: [],
    scope: 'global',
    createdAt: now,
    lastUsedAt: now,
    useCount: 1
  }
}

describe('flushCollectiveMemoryToGit concurrent push', () => {
  beforeEach(() => {
    vi.resetModules()
    syncTestState.fileContent = ''
    syncTestState.activeMergeCount = 0
    syncTestState.maxConcurrentMerges = 0
    syncTestState.mergeDelayMs = 50
  })

  it('два параллельных push сохраняют обе записи', async () => {
    const { parseMemoryMarkdown } = await import('../electron/main/memory')
    const { flushCollectiveMemoryToGit, queueCollectiveMemoryEntry } =
      await import('../electron/main/collectiveMemorySync')

    const entryA = makeEntry('entry-a', 'Первая тестовая запись для коллективной памяти CodeViper')
    const entryB = makeEntry('entry-b', 'Вторая тестовая запись для коллективной памяти CodeViper')

    queueCollectiveMemoryEntry(entryA)
    const flush1 = flushCollectiveMemoryToGit('sync A')

    queueCollectiveMemoryEntry(entryB)
    const flush2 = flushCollectiveMemoryToGit('sync B')

    const [resultA, resultB] = await Promise.all([flush1, flush2])

    expect(resultA.ok).toBe(true)
    expect(resultB.ok).toBe(true)
    expect(syncTestState.maxConcurrentMerges).toBe(1)

    const store = parseMemoryMarkdown(syncTestState.fileContent)
    expect(store.entries).toHaveLength(2)
    expect(store.entries.map((item) => item.content)).toEqual(
      expect.arrayContaining([entryA.content, entryB.content])
    )
  })
})
