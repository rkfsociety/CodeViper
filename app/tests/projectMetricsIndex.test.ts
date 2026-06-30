import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildProjectMetrics, formatProjectMetrics } from '../electron/main/projectMetricsIndex'

describe('projectMetricsIndex', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-metrics-'))
    mkdirSync(join(root, 'src'), { recursive: true })

    writeFileSync(
      join(root, 'src', 'main.ts'),
      [
        '// header comment',
        'export function greet(name: string): string {',
        '  if (!name) {',
        '    return "hello"',
        '  }',
        '  for (const part of name.split(" ")) {',
        '    if (part.length > 0) {',
        '      return part',
        '    }',
        '  }',
        '  return name',
        '}',
        ''
      ].join('\n')
    )

    writeFileSync(
      join(root, 'src', 'util.py'),
      ['# util', 'def echo(value):', '    return value', ''].join('\n')
    )

    writeFileSync(join(root, 'README.md'), ['# Demo', '', 'Small fixture project.', ''].join('\n'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('buildProjectMetrics агрегирует LOC, языки и сложность fixture-проекта', async () => {
    const result = await buildProjectMetrics(root)

    expect(result.totalFiles).toBe(3)
    expect(result.filesScanned).toBe(3)
    expect(result.totalLines).toBe(21)
    expect(result.codeLines).toBe(14)
    expect(result.languages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ language: 'TypeScript', files: 1, codeLines: 11 }),
        expect.objectContaining({ language: 'Python', files: 1, codeLines: 2 }),
        expect.objectContaining({ language: 'Markdown', files: 1, codeLines: 1 })
      ])
    )
    expect(result.totalComplexity).toBe(5)
    expect(result.maxComplexity).toBe(4)
    expect(result.maxComplexityFile).toBe('src/main.ts')
    expect(result.largestFiles[0]?.relativePath).toBe('src/main.ts')
  })

  it('formatProjectMetrics совпадает с агрегатом fixture-проекта', async () => {
    const result = await buildProjectMetrics(root)
    const markdown = formatProjectMetrics(root, result)

    expect(markdown).toContain('# Метрики проекта')
    expect(markdown).toContain('**Файлов учтено:** 3')
    expect(markdown).toContain('| Строк (всего) | 21 |')
    expect(markdown).toContain('| Строк кода | 14 |')
    expect(markdown).toContain('| TypeScript | 1 |')
    expect(markdown).toContain('| Python | 1 |')
    expect(markdown).toContain('| Markdown | 1 |')
    expect(markdown).toContain('`src/main.ts`')
    expect(markdown).toContain('| Сложность (сумма) | 5 |')
  })
})
