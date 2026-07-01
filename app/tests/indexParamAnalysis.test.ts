import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findIndexParamIssues } from '../electron/main/indexParamAnalysis'

function makeTempProject(): string {
  return mkdtempSync(join(tmpdir(), 'cv-index-param-'))
}

describe('findIndexParamIssues', () => {
  it('returns a clean report for valid fixture values', async () => {
    const dir = makeTempProject()
    try {
      writeFileSync(
        join(dir, 'settings.ts'),
        `import { z } from 'zod'

export const PersistedSettingsSchema = z.object({
  chunkSize: z.number().int().min(256).max(8192),
  overlap: z.number().int().min(0).max(255).refine((value) => value < 255, 'overlap < chunk'),
  batchSize: z.number().int().min(1).max(64)
})
`,
        'utf8'
      )

      writeFileSync(
        join(dir, 'rag.ts'),
        `export const AUTO_INDEX_CHUNK_LINES = 1024
export const AUTO_INDEX_OVERLAP_LINES = 128
export const BATCH_SIZE = 4
`,
        'utf8'
      )

      const result = await findIndexParamIssues(dir)
      expect(result).toContain('find_index_param_issues():')
      expect(result).toContain('не нарушены')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports invalid chunk, overlap, batch and zod bounds', async () => {
    const dir = makeTempProject()
    try {
      writeFileSync(
        join(dir, 'settings.ts'),
        `import { z } from 'zod'

export const PersistedSettingsSchema = z.object({
  chunkSize: z.number().int().min(128).max(9000),
  overlap: z.number().int().min(0).max(9000),
  batchSize: z.number().int().min(0).max(256)
})
`,
        'utf8'
      )

      writeFileSync(
        join(dir, 'rag.ts'),
        `export const AUTO_INDEX_CHUNK_LINES = 64
export const AUTO_INDEX_OVERLAP_LINES = 128
export const BATCH_SIZE = 0
`,
        'utf8'
      )

      const result = await findIndexParamIssues(dir)
      expect(result).toContain('find_index_param_issues(): найдено')
      expect(result).toContain('chunk=64')
      expect(result).toContain('overlap=128')
      expect(result).toContain('batch=0')
      expect(result).toContain('Zod bounds')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('scans the real repository files cleanly', async () => {
    const result = await findIndexParamIssues(join(process.cwd(), '..'))
    expect(result).toContain('find_index_param_issues():')
    expect(result).toContain('не нарушены')
  })
})
