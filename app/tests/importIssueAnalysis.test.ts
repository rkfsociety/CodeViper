import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findImportIssues, formatImportIssuesOutput } from '../electron/main/importIssueAnalysis'

describe('importIssueAnalysis', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-import-'))
    mkdirSync(join(root, 'src', 'utils'), { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('находит несуществующие относительные import и require', async () => {
    writeFileSync(
      join(root, 'src', 'main.ts'),
      [
        "import { helper } from './utils/helper'",
        "const thing = require('./missing')",
        'export { helper, thing }'
      ].join('\n')
    )
    writeFileSync(join(root, 'src', 'utils', 'helper.ts'), 'export const helper = 1')

    const result = await findImportIssues(root)
    expect(result.issues.some((issue) => issue.specifier === './missing')).toBe(true)
    expect(result.issues.some((issue) => issue.specifier === './utils/helper')).toBe(false)
    expect(formatImportIssuesOutput(root, result)).toContain('find_import_issues')
  })

  it('находит неразрешённый alias без tsconfig paths и пропускает валидный alias', async () => {
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@app/*': ['src/*']
            }
          }
        },
        null,
        2
      )
    )
    writeFileSync(
      join(root, 'src', 'alias.ts'),
      [
        "import { ok } from '@app/utils/ok'",
        "import { bad } from '@missing/pkg'",
        'export { ok, bad }'
      ].join('\n')
    )
    writeFileSync(join(root, 'src', 'utils', 'ok.ts'), 'export const ok = 1')

    const result = await findImportIssues(root, { subpath: 'src/alias.ts' })
    expect(result.issues.some((issue) => issue.specifier === '@app/utils/ok')).toBe(false)
    expect(result.issues.some((issue) => issue.specifier === '@missing/pkg')).toBe(true)
    expect(formatImportIssuesOutput(root, result)).toContain('alias')
  })
})
