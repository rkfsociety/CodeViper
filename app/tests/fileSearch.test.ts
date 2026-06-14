import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { grepInTree, findFilesInTree, formatGrepResults } from '../electron/main/fileSearch'

describe('fileSearch', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-grep-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'app.ts'), 'export const APP = 1\nexport function hello() {}\n')
    writeFileSync(join(root, 'readme.md'), '# Hello CodeViper\n')
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('находит текст grep_files', async () => {
    const result = await grepInTree(root, 'hello')
    expect(result.matches.length).toBeGreaterThan(0)
    expect(formatGrepResults(root, 'hello', result)).toContain('app.ts')
  })

  it('находит файлы find_files', async () => {
    const result = await findFilesInTree(root, '*.ts')
    expect(result.paths.some((p) => p.endsWith('app.ts'))).toBe(true)
  })
})
