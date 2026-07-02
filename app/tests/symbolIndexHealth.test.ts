import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findSymbolIndexIssues } from '../electron/main/symbolIndexHealth'

function makeTempProject(): string {
  return mkdtempSync(join(tmpdir(), 'cv-symbol-health-'))
}

describe('findSymbolIndexIssues', () => {
  it('reports stale runtime index entries, files without index and a successful smoke find_symbol', async () => {
    const dir = makeTempProject()
    try {
      mkdirSync(join(dir, 'src'), { recursive: true })
      mkdirSync(join(dir, '.codeviper'), { recursive: true })

      const freshPath = join(dir, 'src', 'fresh.ts')
      const stalePath = join(dir, 'src', 'stale.ts')
      const emptyPath = join(dir, 'src', 'empty.ts')

      writeFileSync(
        freshPath,
        ['export function freshHelper() {', '  return 1', '}'].join('\n'),
        'utf8'
      )
      writeFileSync(
        stalePath,
        ['export function staleHelper() {', '  return 2', '}'].join('\n'),
        'utf8'
      )
      writeFileSync(emptyPath, ['console.log("side effect")'].join('\n'), 'utf8')

      const now = Date.now()
      const freshIndexMtime = now + 30_000
      const staleIndexMtime = now - 60_000
      const staleFileMtime = now + 120_000
      utimesSync(stalePath, staleFileMtime / 1000, staleFileMtime / 1000)

      writeFileSync(
        join(dir, '.codeviper', 'symbol-index.json'),
        JSON.stringify(
          {
            generatedAt: new Date(staleIndexMtime).toISOString(),
            files: [
              {
                path: 'src/fresh.ts',
                mtimeMs: freshIndexMtime,
                symbols: [{ name: 'freshHelper', kind: 'function' }]
              },
              {
                path: 'src/stale.ts',
                mtimeMs: staleIndexMtime,
                symbols: [{ name: 'staleHelper', kind: 'function' }]
              },
              {
                path: 'src/missing.ts',
                mtimeMs: staleIndexMtime,
                symbols: [{ name: 'ghostHelper', kind: 'function' }]
              }
            ]
          },
          null,
          2
        ),
        'utf8'
      )

      const result = await findSymbolIndexIssues(dir)
      expect(result).toContain('find_symbol_index_issues(): найдено')
      expect(result).toContain('src/stale.ts')
      expect(result).toContain('src/missing.ts')
      expect(result).toContain('src/empty.ts')
      expect(result).toContain('find_symbol("freshHelper")')
      expect(result).toContain('src/fresh.ts')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('accepts a single file path as the scan scope', async () => {
    const dir = makeTempProject()
    try {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(
        join(dir, 'src', 'single.ts'),
        ['export const scopedSymbol = () => 1'].join('\n'),
        'utf8'
      )

      const result = await findSymbolIndexIssues(dir, { path: 'src/single.ts' })
      expect(result).toContain('просмотрено файлов: 1')
      expect(result).toContain('find_symbol("scopedSymbol")')
      expect(result).toContain('src/single.ts')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
