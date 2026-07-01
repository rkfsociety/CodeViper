import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findMagicNumbers, formatMagicNumbersOutput } from '../electron/main/magicNumberIndex'

describe('magicNumberIndex', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-magic-'))
    mkdirSync(join(root, 'app', 'shared'), { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('finds suspicious numeric literals and skips consts, enum members, indexes, and shared constants', async () => {
    writeFileSync(
      join(root, 'src', 'sample.ts'),
      [
        'const MAX_RETRIES = 3',
        'enum Mode { Fast = 2 }',
        'export function run(items: string[]) {',
        '  const first = items[0]',
        '  return first + String(42) + String(-7)',
        '}'
      ].join('\\n')
    )
    writeFileSync(
      join(root, 'app', 'shared', 'constants.ts'),
      ['export const DEFAULT_TIMEOUT = 120', 'export const LIMIT = 2'].join('\\n')
    )

    const result = await findMagicNumbers(root)
    expect(result.issues.map((issue) => issue.value)).toEqual(expect.arrayContaining(['42', '-7']))
    expect(result.issues.some((issue) => issue.value === '3')).toBe(false)
    expect(result.issues.some((issue) => issue.value === '0')).toBe(false)
    expect(formatMagicNumbersOutput(root, result)).toContain('find_magic_numbers')
    expect(formatMagicNumbersOutput(root, result)).toContain('sample.ts')
  })

  it('returns a clean report for code without magic numbers', async () => {
    writeFileSync(
      join(root, 'src', 'clean.ts'),
      [
        'export const SIZE = 1',
        'export function add(a: number, b: number) {',
        '  return a + b',
        '}'
      ].join('\\n')
    )

    const result = await findMagicNumbers(root, { subpath: 'src/clean.ts' })
    expect(result.issues).toHaveLength(0)
    expect(formatMagicNumbersOutput(root, result)).toContain('не обнаружены')
  })
})
