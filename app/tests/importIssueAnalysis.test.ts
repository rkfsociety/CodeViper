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

  it('не считает npm-пакеты неразрешёнными alias', async () => {
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
      join(root, 'package.json'),
      JSON.stringify(
        {
          name: 'fixture',
          type: 'module',
          dependencies: {
            react: '^19.1.0'
          }
        },
        null,
        2
      )
    )
    mkdirSync(join(root, 'node_modules', 'react'), { recursive: true })
    writeFileSync(
      join(root, 'node_modules', 'react', 'package.json'),
      '{"name":"react","main":"index.js"}'
    )
    writeFileSync(join(root, 'node_modules', 'react', 'index.js'), 'module.exports = {}')
    writeFileSync(
      join(root, 'src', 'packages.ts'),
      [
        "import React from 'react'",
        "import { ok } from '@app/utils/ok'",
        "import { bad } from '@broken/internal'",
        'export { React, ok, bad }'
      ].join('\n')
    )
    writeFileSync(join(root, 'src', 'utils', 'ok.ts'), 'export const ok = 1')

    const result = await findImportIssues(root, { subpath: 'src/packages.ts' })
    expect(result.issues.some((issue) => issue.specifier === 'react')).toBe(false)
    expect(result.issues.some((issue) => issue.specifier === '@app/utils/ok')).toBe(false)
    expect(result.issues.some((issue) => issue.specifier === '@broken/internal')).toBe(true)
  })
})
