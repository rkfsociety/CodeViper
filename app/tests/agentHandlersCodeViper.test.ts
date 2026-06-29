import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'

vi.mock('electron', () => ({
  app: {
    getPath: () => process.cwd(),
    getAppPath: () => process.cwd()
  }
}))

import { setSourceRootOverride } from '../electron/main/codeviperSource'
import { createCodeViperToolHandlers } from '../electron/main/agentHandlersCodeViper'

describe('createCodeViperToolHandlers', () => {
  let sourceRoot: string

  beforeEach(() => {
    const base = mkdtempSync(join(tmpdir(), 'cv-self-'))
    sourceRoot = join(base, 'app')
    mkdirSync(join(sourceRoot, 'electron', 'main'), { recursive: true })
    mkdirSync(join(sourceRoot, 'src', 'components'), { recursive: true })
    writeFileSync(join(sourceRoot, 'package.json'), '{}')
    writeFileSync(join(sourceRoot, 'electron', 'main', 'agent.ts'), 'export {}')
    writeFileSync(join(sourceRoot, 'src', 'components', 'App.tsx'), 'export const App = 1')
    setSourceRootOverride(sourceRoot)
  })

  afterEach(() => {
    setSourceRootOverride(null)
    rmSync(join(sourceRoot, '..'), { recursive: true, force: true })
  })

  it('list_codeviper_directory нормализует app/src без двойного app/', async () => {
    const handlers = createCodeViperToolHandlers()
    const result = await handlers.list_codeviper_directory!({ path: 'app/src/components' })
    expect(result).toContain('App.tsx')
    expect(result).not.toMatch(/ENOENT|no such file/i)
  })

  it('grep_codeviper_files возвращает подсказку без query', async () => {
    const handlers = createCodeViperToolHandlers()
    const result = await handlers.grep_codeviper_files!({ query: '' })
    expect(result).toMatch(/Не указан параметр query/)
  })

  it('grep_codeviper_files находит текст в src/', async () => {
    const handlers = createCodeViperToolHandlers()
    const result = await handlers.grep_codeviper_files!({
      query: 'export const App',
      path: 'app/src/components'
    })
    expect(result).toContain('App.tsx')
  })

  it('create_codeviper_file без content — понятная ошибка, не trim crash', async () => {
    const handlers = createCodeViperToolHandlers()
    await expect(
      handlers.create_codeviper_file!({ path: 'src/components/New.tsx' } as {
        path: string
        content: string
      })
    ).rejects.toThrow(/Не указан параметр content/)
  })

  it('read_codeviper_file при ENOENT подсказывает похожий путь', async () => {
    const handlers = createCodeViperToolHandlers()
    await expect(handlers.read_codeviper_file!({ path: 'wrong/App.tsx' })).rejects.toThrow(
      /Похожие файлы:.*src\/components\/App\.tsx/
    )
  })
})
