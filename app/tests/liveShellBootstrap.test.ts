import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import {
  resolveLiveShellPathsFromClone,
  installLiveShellRendererReload
} from '../electron/main/liveShellBootstrap'
import {
  BUNDLED_RUNTIME_MAIN_MIN_BYTES,
  BUNDLED_SHELL_RENDERER_MIN_BYTES
} from '../shared/constants'

const cloneRoot = 'C:/Users/test/AppData/Roaming/codeviper/source/app'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  statSync: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getPath: (name: string) =>
      name === 'userData' ? 'C:/Users/test/AppData/Roaming/codeviper' : '',
    on: vi.fn()
  }
}))

vi.mock('../electron/main/bundledSourceBuild', () => ({
  getBundledSourceAppRoot: () => cloneRoot
}))

describe('liveShellBootstrap', () => {
  beforeEach(() => {
    vi.stubEnv('CODEVIPER_E2E', '')
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(statSync).mockImplementation((p) => {
      const path = String(p)
      if (path.endsWith('index.html')) return { size: 671 } as ReturnType<typeof statSync>
      return { size: BUNDLED_RUNTIME_MAIN_MIN_BYTES + 100 } as ReturnType<typeof statSync>
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('resolveLiveShellPathsFromClone принимает index.html <1 KB', () => {
    const paths = resolveLiveShellPathsFromClone()
    expect(paths).not.toBeNull()
    expect(paths?.rendererIndex).toBe(join(cloneRoot, 'out', 'renderer', 'index.html'))
    expect(671).toBeGreaterThanOrEqual(BUNDLED_SHELL_RENDERER_MIN_BYTES)
  })

  it('resolveLiveShellPathsFromClone возвращает null если preload слишком мал', () => {
    vi.mocked(statSync).mockImplementation((p) => {
      const path = String(p).replace(/\\/g, '/')
      if (path.endsWith('preload/index.js')) return { size: 10 } as ReturnType<typeof statSync>
      if (path.endsWith('index.html')) return { size: 671 } as ReturnType<typeof statSync>
      return { size: BUNDLED_RUNTIME_MAIN_MIN_BYTES + 100 } as ReturnType<typeof statSync>
    })
    expect(resolveLiveShellPathsFromClone()).toBeNull()
  })

  it('installLiveShellRendererReload регистрирует browser-window-created в packaged', async () => {
    const { app } = await import('electron')
    installLiveShellRendererReload()
    expect(app.on).toHaveBeenCalledWith('browser-window-created', expect.any(Function))
  })
})
