import { describe, it, expect, vi } from 'vitest'
import { join } from 'path'

vi.mock('electron', () => ({
  app: {
    getPath: () => process.cwd(),
    getAppPath: () => process.cwd()
  }
}))

import { getCodeViperSourceRoot, isAllowedSelfPath } from '../electron/main/codeviperSource'

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
})
