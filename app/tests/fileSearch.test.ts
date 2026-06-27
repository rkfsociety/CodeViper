import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { grepInTree, findFilesInTree, formatGrepResults } from '../electron/main/fileSearch'
import { clearIgnorePatternsCache } from '../electron/main/ignorePatterns'

describe('fileSearch', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-grep-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'app.ts'), 'export const APP = 1\nexport function hello() {}\n')
    writeFileSync(join(root, 'readme.md'), '# Hello CodeViper\n')
    clearIgnorePatternsCache()
  })

  afterEach(() => {
    clearIgnorePatternsCache()
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

  it('файл из .codeviperignore не попадает в grep_files', async () => {
    writeFileSync(join(root, 'src', 'secret.ts'), 'export const SECRET_MARKER = 42\n')
    writeFileSync(join(root, '.codeviperignore'), 'secret.ts\n')

    const result = await grepInTree(root, 'SECRET_MARKER')
    const formatted = formatGrepResults(root, 'SECRET_MARKER', result)

    expect(formatted).not.toContain('secret.ts')
    expect(formatted).not.toContain('SECRET_MARKER')
  })

  it('файл из .codeviperignore не попадает в find_files', async () => {
    writeFileSync(join(root, 'src', 'secret.ts'), 'export {}\n')
    writeFileSync(join(root, '.codeviperignore'), 'secret.ts\n')

    const result = await findFilesInTree(root, 'secret.ts')

    expect(result.paths.some((p) => p.endsWith('secret.ts'))).toBe(false)
  })

  it('grepInTree не падает при пустом query', async () => {
    const result = await grepInTree(root, undefined)
    expect(result.matches).toEqual([])
    expect(formatGrepResults(root, '', result)).toContain('Совпадений не найдено')
  })

  it('grepInTree ищет в subpath относительно root', async () => {
    mkdirSync(join(root, 'other'), { recursive: true })
    writeFileSync(join(root, 'other', 'noise.ts'), 'ONLY_IN_OTHER\n')

    const result = await grepInTree(root, 'ONLY_IN_OTHER', { subpath: 'other' })
    expect(result.matches.some((m) => m.path.endsWith('noise.ts'))).toBe(true)

    const missed = await grepInTree(root, 'ONLY_IN_OTHER', { subpath: 'src' })
    expect(missed.matches).toEqual([])
  })
})
