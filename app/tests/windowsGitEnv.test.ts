import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync } from 'fs'

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: vi.fn(actual.existsSync) }
})

import { prependWindowsGitToPath } from '../electron/main/windowsGitEnv'

describe('prependWindowsGitToPath', () => {
  afterEach(() => {
    vi.mocked(existsSync).mockRestore()
  })

  it('на non-win32 не меняет env', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux' })
    const env = { PATH: '/usr/bin' }
    expect(prependWindowsGitToPath(env)).toBe(env)
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('на win32 добавляет Git cmd в PATH', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })

    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p)
      return s.includes('Program Files\\Git\\cmd\\git.exe')
    })

    const result = prependWindowsGitToPath({ PATH: 'C:\\Windows' })
    expect(result.PATH).toContain('C:\\Program Files\\Git\\cmd')
    expect(result.PATH).toContain('C:\\Windows')
    expect(result.Path).toBe(result.PATH)

    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })
})
