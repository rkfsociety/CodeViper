import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findMergeConflicts, formatMergeConflictReport } from '../electron/main/mergeConflictScan'

describe('mergeConflictScan', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-merge-conflicts-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'out'), { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('находит маркеры merge-конфликта и возвращает path:line', async () => {
    writeFileSync(
      join(root, 'src', 'conflict.ts'),
      [
        'export const version = 1',
        '<<<<<<< HEAD',
        'export const title = "local"',
        '=======',
        'export const title = "remote"',
        '>>>>>>> feature/title'
      ].join('\n')
    )
    writeFileSync(join(root, 'out', 'generated.ts'), '<<<<<<< ignored')

    const result = await findMergeConflicts(root)

    expect(result.matches.map((item) => `${item.marker}@${item.line}`)).toEqual([
      '<<<<<<<@2',
      '=======@4',
      '>>>>>>>@6'
    ])
    expect(formatMergeConflictReport(root, result)).toContain('find_merge_conflicts')
    expect(formatMergeConflictReport(root, result)).toContain('src/conflict.ts:2')
  })

  it('возвращает чистый отчёт если маркеров нет', async () => {
    writeFileSync(join(root, 'src', 'clean.ts'), 'export const clean = true')

    const result = await findMergeConflicts(root, { subpath: 'src' })

    expect(result.matches).toHaveLength(0)
    expect(formatMergeConflictReport(root, result)).toContain('не найдено')
  })
})
