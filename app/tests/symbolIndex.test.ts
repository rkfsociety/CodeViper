import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  findSymbolDeclarations,
  findSymbolReferences,
  formatSymbolResults
} from '../electron/main/symbolIndex'

describe('symbolIndex', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-symbol-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'sample.ts'),
      [
        'export function knownHelper(value: string): string {',
        '  return knownHelperEcho(value)',
        '}',
        '',
        'function knownHelperEcho(input: string): string {',
        '  return input',
        '}',
        '',
        'export class KnownClass {',
        '  run() {',
        '    return knownHelper("x")',
        '  }',
        '}'
      ].join('\n')
    )
    writeFileSync(
      join(root, 'src', 'util.py'),
      ['def known_helper(data):', '    return data', '', 'class KnownPyClass:', '    pass'].join(
        '\n'
      )
    )
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('find_symbol находит объявление известной функции в ts', async () => {
    const result = await findSymbolDeclarations(root, 'knownHelper')
    expect(result.symbols.length).toBeGreaterThan(0)
    const hit = result.symbols.find((s) => s.path.endsWith('sample.ts'))
    expect(hit).toBeDefined()
    expect(hit!.line).toBe(1)
    expect(hit!.kind).toBe('function')
    expect(formatSymbolResults(root, 'knownHelper', result, 'declaration')).toContain(
      'sample.ts:1:'
    )
  })

  it('find_symbol находит класс и python-функцию', async () => {
    const tsClass = await findSymbolDeclarations(root, 'KnownClass')
    expect(tsClass.symbols.some((s) => s.kind === 'class')).toBe(true)

    const pyFn = await findSymbolDeclarations(root, 'known_helper')
    expect(pyFn.symbols.some((s) => s.path.endsWith('util.py') && s.kind === 'function')).toBe(true)
  })

  it('find_references находит вхождения символа', async () => {
    const result = await findSymbolReferences(root, 'knownHelper')
    expect(result.symbols.length).toBeGreaterThan(1)
    expect(result.symbols.some((s) => s.line > 1)).toBe(true)
  })
})
