import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/projectReadErrorHint' }
}))

import { createProjectToolHandlers } from '../electron/main/agentHandlersProject'
import { formatProjectReadErrorHint } from '../electron/main/services'

let projectDir: string

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'cv-read-hint-'))
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe('formatProjectReadErrorHint', () => {
  it('подсказывает app/src когда src отсутствует в корне', async () => {
    const appSrc = join(projectDir, 'app', 'src')
    mkdirSync(appSrc, { recursive: true })
    writeFileSync(join(appSrc, 'App.tsx'), 'export {}\n')

    const hint = await formatProjectReadErrorHint(
      projectDir,
      'src',
      'ENOENT: no such file or directory'
    )
    expect(hint).toMatch(/app\/src/)
    expect(hint).toMatch(/list_directory/)
  })

  it('подсказывает list_directory для существующей папки', async () => {
    const sub = join(projectDir, 'pkg')
    mkdirSync(sub, { recursive: true })

    const hint = await formatProjectReadErrorHint(projectDir, 'pkg', 'Это не файл')
    expect(hint).toMatch(/list_directory/)
    expect(hint).toMatch(/pkg/)
  })
})

describe('read_file ENOENT hints', () => {
  it('возвращает подсказку app/src при read_file src в monorepo', async () => {
    const appSrc = join(projectDir, 'app', 'src')
    mkdirSync(appSrc, { recursive: true })
    writeFileSync(join(appSrc, 'main.ts'), 'export {}\n')

    const { handlers } = createProjectToolHandlers(projectDir)
    await expect(handlers.read_file!({ path: 'src' })).rejects.toThrow(/app\/src/)
  })
})

describe('list_directory ENOENT hints', () => {
  it('возвращает подсказку app/src при list_directory src в monorepo', async () => {
    const appSrc = join(projectDir, 'app', 'src')
    mkdirSync(appSrc, { recursive: true })
    writeFileSync(join(appSrc, 'main.ts'), 'export {}\n')

    const { handlers } = createProjectToolHandlers(projectDir)
    await expect(handlers.list_directory!({ path: 'src' })).rejects.toThrow(/app\/src/)
  })
})
