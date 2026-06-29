import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { findSlowCode, formatSlowCodeReport } from '../electron/main/slowCodeIndex'

describe('slowCodeIndex', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-slow-'))
    mkdirSync(join(root, 'src'), { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('находит вложенные циклы и await в ts', async () => {
    writeFileSync(
      join(root, 'src', 'slow.ts'),
      [
        'export async function processItems(items: string[][], lookup: string[]) {',
        '  for (const batch of items) {',
        '    for (const item of batch) {',
        '      await fetch(item)',
        '    }',
        '  }',
        '}'
      ].join('\n')
    )

    const result = await findSlowCode(root)
    expect(result.issues.some((i) => i.kind === 'nested_loops')).toBe(true)
    expect(result.issues.some((i) => i.kind === 'await_in_loop')).toBe(true)
    const report = formatSlowCodeReport(root, result)
    expect(report).toContain('find_slow_code')
    expect(report).toContain('slow.ts')
  })

  it('находит sync I/O и JSON.parse в цикле', async () => {
    writeFileSync(
      join(root, 'src', 'io.ts'),
      [
        'import { readFileSync } from "fs"',
        'export function loadAll(paths: string[]) {',
        '  const out = []',
        '  for (const p of paths) {',
        '    out.push(JSON.parse(readFileSync(p, "utf-8")))',
        '  }',
        '  return out',
        '}'
      ].join('\n')
    )

    const result = await findSlowCode(root, { subpath: 'src/io.ts' })
    expect(result.issues.some((i) => i.kind === 'sync_io_in_loop')).toBe(true)
    expect(result.issues.some((i) => i.kind === 'json_parse_in_loop')).toBe(true)
  })

  it('находит проблемы в python', async () => {
    writeFileSync(
      join(root, 'src', 'slow.py'),
      [
        'async def run(rows):',
        '    for row in rows:',
        '        for cell in row:',
        '            await cell',
        '            open(cell)',
        '            json.loads(cell)'
      ].join('\n')
    )

    const result = await findSlowCode(root)
    expect(result.issues.some((i) => i.kind === 'nested_loops')).toBe(true)
    expect(result.issues.some((i) => i.kind === 'await_in_loop')).toBe(true)
    expect(result.issues.some((i) => i.kind === 'sync_io_in_loop')).toBe(true)
  })

  it('возвращает пустой отчёт для чистого кода', async () => {
    writeFileSync(
      join(root, 'src', 'clean.ts'),
      ['export function sum(a: number, b: number) {', '  return a + b', '}'].join('\n')
    )

    const result = await findSlowCode(root)
    expect(result.issues).toHaveLength(0)
    expect(formatSlowCodeReport(root, result)).toContain('не обнаружены')
  })
})
