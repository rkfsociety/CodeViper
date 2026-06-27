import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'

vi.mock('electron', () => ({
  app: {
    getPath: () => process.cwd(),
    getAppPath: () => process.cwd()
  }
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync)
  }
})

import { existsSync } from 'fs'
import {
  getBundledNodeBin,
  getCodeViperSourceRoot,
  isAllowedSelfPath,
  normalizeCodeViperPath
} from '../electron/main/codeviperSource'

describe('codeviperSource', () => {
  it('находит корень с agent.ts', () => {
    const root = getCodeViperSourceRoot()
    expect(isAllowedSelfPath(root, join(root, 'electron', 'main', 'agent.ts'))).toBe(true)
  })

  it('запрещает node_modules', () => {
    const root = getCodeViperSourceRoot()
    expect(isAllowedSelfPath(root, join(root, 'node_modules', 'x', 'y.js'))).toBe(false)
  })

  it('запрещает out', () => {
    const root = getCodeViperSourceRoot()
    expect(isAllowedSelfPath(root, join(root, 'out', 'main', 'index.js'))).toBe(false)
  })

  it('разрешает ROADMAP.md и README.md в родительской папке app/', () => {
    const root = getCodeViperSourceRoot()
    expect(isAllowedSelfPath(root, '../ROADMAP.md')).toBe(true)
    expect(isAllowedSelfPath(root, '../README.md')).toBe(true)
    expect(isAllowedSelfPath(root, '../../secret/ROADMAP.md')).toBe(false)
  })

  it('normalizeCodeViperPath убирает app/ при корне app/', () => {
    const root = getCodeViperSourceRoot()
    const rootName = root.split(/[/\\]/).pop()?.toLowerCase()
    if (rootName !== 'app') return

    const normalized = normalizeCodeViperPath(root, 'app/electron/main/agentTools/integrations.ts')
    expect(isAllowedSelfPath(root, normalized)).toBe(true)
    expect(normalized).toBe('electron/main/agentTools/integrations.ts')
  })

  it('getBundledNodeBin находит node.exe в resources/node', () => {
    const binaryName = process.platform === 'win32' ? 'node.exe' : join('bin', 'node')
    const expected = join(process.cwd(), 'resources', 'node', binaryName)
    vi.mocked(existsSync).mockImplementation((path) => path === expected)

    expect(getBundledNodeBin()).toBe(expected)
  })

  it('getBundledNodeBin возвращает null если бинарник не найден', () => {
    vi.mocked(existsSync).mockReturnValue(false)

    expect(getBundledNodeBin()).toBeNull()
  })
})
