import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findDeadCode, formatDeadCodeReport } from '../electron/main/deadCodeIndex'

describe('deadCodeIndex', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-dead-'))
    mkdirSync(join(root, 'src'), { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('находит недостижимые операторы после return', async () => {
    writeFileSync(
      join(root, 'src', 'unreachable.ts'),
      [
        'export function run(flag: boolean) {',
        '  if (flag) {',
        '    return 1',
        '    const neverUsed = 2',
        '  }',
        '  return 0',
        '}'
      ].join('\n')
    )

    const result = await findDeadCode(root)
    expect(result.issues.some((i) => i.kind === 'unreachable_statement')).toBe(true)
    const report = formatDeadCodeReport(root, result)
    expect(report).toContain('find_dead_code')
    expect(report).toContain('unreachable.ts')
  })

  it('находит if с константным false и тернарник с константным true', async () => {
    writeFileSync(
      join(root, 'src', 'constant.ts'),
      [
        'export function label() {',
        '  if (false) {',
        '    return "never"',
        '  }',
        '  return true ? "yes" : "no"',
        '}'
      ].join('\n')
    )

    const result = await findDeadCode(root, { subpath: 'src/constant.ts' })
    expect(result.issues.some((i) => i.kind === 'constant_condition')).toBe(true)
    expect(result.issues.some((i) => i.kind === 'constant_conditional_expression')).toBe(true)
  })

  it('возвращает пустой отчёт для живого кода', async () => {
    writeFileSync(
      join(root, 'src', 'clean.ts'),
      ['export function sum(a: number, b: number) {', '  return a + b', '}'].join('\n')
    )

    const result = await findDeadCode(root)
    expect(result.issues).toHaveLength(0)
    expect(formatDeadCodeReport(root, result)).toContain('не обнаружен')
  })
})
