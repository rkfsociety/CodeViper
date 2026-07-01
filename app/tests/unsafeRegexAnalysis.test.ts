import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findUnsafeRegex, formatUnsafeRegexOutput } from '../electron/main/unsafeRegexAnalysis'

describe('unsafeRegexAnalysis', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-regex-'))
    mkdirSync(join(root, 'src'), { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('находит вложенные квантификаторы и опасные alternation-паттерны', async () => {
    writeFileSync(
      join(root, 'src', 'unsafe.ts'),
      [
        'export const nested = /(a+)+$/',
        'export const alt = new RegExp("(foo|fo)+bar")',
        'export const safe = /abc+/',
        'export const built = RegExp("^(?:\\d+)-([a-z]+)$")'
      ].join('\n')
    )

    const result = await findUnsafeRegex(root)
    expect(result.issues.some((issue) => issue.pattern.includes('(a+)+'))).toBe(true)
    expect(result.issues.some((issue) => issue.pattern.includes('(foo|fo)+'))).toBe(true)
    expect(result.issues.some((issue) => issue.pattern.includes('abc+'))).toBe(false)
    const report = formatUnsafeRegexOutput(root, result)
    expect(report).toContain('find_unsafe_regex')
    expect(report).toContain('unsafe.ts')
  })

  it('возвращает чистый отчёт для безопасных regex', async () => {
    writeFileSync(
      join(root, 'src', 'clean.ts'),
      [
        'export const ok = /^[a-z0-9_-]+$/i',
        'export function test(value: string) {',
        '  return ok.test(value)',
        '}'
      ].join('\n')
    )

    const result = await findUnsafeRegex(root, { subpath: 'src/clean.ts' })
    expect(result.issues).toHaveLength(0)
    expect(formatUnsafeRegexOutput(root, result)).toContain('не обнаружено')
  })
})
