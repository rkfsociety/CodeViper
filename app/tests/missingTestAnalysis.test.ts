import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findMissingTests, formatMissingTestsOutput } from '../electron/main/missingTestAnalysis'

describe('missingTestAnalysis', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-missing-tests-'))
    mkdirSync(join(root, 'src', 'nested'), { recursive: true })
    mkdirSync(join(root, 'tests', 'src', 'nested'), { recursive: true })
    mkdirSync(join(root, 'out'), { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('находит исходники без парных тестов рядом или в tests', async () => {
    writeFileSync(join(root, 'src', 'hasLocalTest.ts'), 'export const a = 1')
    writeFileSync(
      join(root, 'src', 'hasLocalTest.test.ts'),
      'import { describe, it } from "vitest"'
    )

    writeFileSync(
      join(root, 'src', 'nested', 'hasTestsMirror.tsx'),
      'export const View = () => null'
    )
    writeFileSync(
      join(root, 'tests', 'src', 'nested', 'hasTestsMirror.test.ts'),
      'import { describe, it } from "vitest"'
    )

    writeFileSync(join(root, 'src', 'missing.ts'), 'export const missing = true')
    writeFileSync(
      join(root, 'src', 'nested', 'alsoMissing.tsx'),
      'export const Missing = () => null'
    )
    writeFileSync(join(root, 'src', 'types.d.ts'), 'export interface OnlyType { ok: boolean }')
    writeFileSync(join(root, 'vite.config.ts'), 'export default {}')
    writeFileSync(join(root, 'out', 'generated.ts'), 'export const generated = true')

    const result = await findMissingTests(root)

    expect(result.missing.map((item) => item.path.replace(/\\/g, '/'))).toEqual([
      'src/missing.ts',
      'src/nested/alsoMissing.tsx'
    ])
    expect(result.missing.some((item) => item.path.includes('hasLocalTest.ts'))).toBe(false)
    expect(result.missing.some((item) => item.path.includes('hasTestsMirror.tsx'))).toBe(false)
    expect(formatMissingTestsOutput(root, result)).toContain('find_missing_tests')
  })

  it('возвращает пустой отчёт если все исходники покрыты тестами', async () => {
    writeFileSync(
      join(root, 'src', 'math.ts'),
      'export const sum = (a: number, b: number) => a + b'
    )
    writeFileSync(
      join(root, 'tests', 'src', 'math.spec.ts'),
      'import { describe, it } from "vitest"'
    )

    const result = await findMissingTests(root, { subpath: 'src' })

    expect(result.missing).toHaveLength(0)
    expect(formatMissingTestsOutput(root, result)).toContain('не обнаружены')
  })
})
