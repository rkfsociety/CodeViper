import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const mocks = vi.hoisted(() => ({
  deleteFile: vi.fn().mockResolvedValue(undefined),
  upsertPoints: vi.fn().mockResolvedValue(undefined),
  ensureCollection: vi.fn().mockResolvedValue(true),
  computeEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
}))

vi.mock('../electron/main/vectorStore', () => ({
  ProjectQdrantIndex: class {
    ensureCollection = mocks.ensureCollection
    deleteFile = mocks.deleteFile
    upsertPoints = mocks.upsertPoints
  }
}))

vi.mock('../electron/main/embeddings', () => ({
  computeEmbedding: (...args: unknown[]) => mocks.computeEmbedding(...args)
}))

import {
  buildProjectFilePoints,
  isProjectIndexableRelPath,
  reindexSingleProjectFile,
  removeSingleProjectFileFromIndex
} from '../electron/main/contextRAG'
import {
  clearIncrementalProjectIndexTimers,
  scheduleIncrementalProjectIndex
} from '../electron/main/embeddingQueue'

describe('isProjectIndexableRelPath', () => {
  it('пропускает текстовые расширения вне ignore-папок', () => {
    expect(isProjectIndexableRelPath('src/app.ts')).toBe(true)
    expect(isProjectIndexableRelPath('docs/readme.md')).toBe(true)
  })

  it('отклоняет node_modules и скрытые файлы', () => {
    expect(isProjectIndexableRelPath('node_modules/pkg/index.js')).toBe(false)
    expect(isProjectIndexableRelPath('.env')).toBe(false)
    expect(isProjectIndexableRelPath('src/.hidden.ts')).toBe(false)
  })
})

describe('reindexSingleProjectFile', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cv-inc-idx-'))
    mocks.deleteFile.mockClear()
    mocks.upsertPoints.mockClear()
    mocks.ensureCollection.mockClear()
    mocks.computeEmbedding.mockClear()
    mocks.computeEmbedding.mockResolvedValue([0.1, 0.2, 0.3])
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
  })

  it('удаляет старые чанки и upsert новый контент без full reindex', async () => {
    const filePath = join(projectDir, 'alpha.ts')
    writeFileSync(filePath, 'export const UNIQUE_MARKER_42 = true\n', 'utf-8')

    await reindexSingleProjectFile(
      projectDir,
      filePath,
      'http://127.0.0.1:11434',
      'http://127.0.0.1:6333'
    )

    expect(mocks.ensureCollection).toHaveBeenCalled()
    expect(mocks.deleteFile).toHaveBeenCalledWith('alpha.ts', projectDir)
    expect(mocks.computeEmbedding).toHaveBeenCalled()
    expect(mocks.upsertPoints).toHaveBeenCalledTimes(1)
    const points = mocks.upsertPoints.mock.calls[0][0]
    expect(points.length).toBeGreaterThan(0)
    expect(points[0].payload.filePath).toBe('alpha.ts')
  })

  it('buildProjectFilePoints включает новый текст в чанк', async () => {
    const points = await buildProjectFilePoints(
      projectDir,
      'beta.ts',
      'const NEW_CONTENT_XYZ = 1',
      'http://127.0.0.1:11434'
    )
    expect(points).toHaveLength(1)
    expect(mocks.computeEmbedding).toHaveBeenCalledWith(
      expect.stringContaining('NEW_CONTENT_XYZ'),
      'http://127.0.0.1:11434'
    )
  })

  it('removeSingleProjectFileFromIndex удаляет векторы файла', async () => {
    await removeSingleProjectFileFromIndex(projectDir, 'gone.ts', 'http://127.0.0.1:6333')
    expect(mocks.deleteFile).toHaveBeenCalledWith('gone.ts', projectDir)
    expect(mocks.upsertPoints).not.toHaveBeenCalled()
  })
})

describe('scheduleIncrementalProjectIndex', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    clearIncrementalProjectIndexTimers()
  })

  afterEach(() => {
    clearIncrementalProjectIndexTimers()
    vi.useRealTimers()
  })

  it('debounce: один вызов после серии событий', async () => {
    const run = vi.fn()
    scheduleIncrementalProjectIndex('k1', run, 500)
    scheduleIncrementalProjectIndex('k1', run, 500)
    scheduleIncrementalProjectIndex('k1', run, 500)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(500)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
