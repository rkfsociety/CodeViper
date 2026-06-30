import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import {
  BUNDLED_RUNTIME_MAIN_MIN_BYTES,
  BUNDLED_SHELL_RENDERER_MIN_BYTES
} from '../shared/constants'

const userDataDir = mkdtempSync(join(tmpdir(), 'cv-runtime-bootstrap-'))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? userDataDir : process.cwd()),
    getAppPath: () => join(process.cwd(), 'app'),
    isPackaged: true,
    on: vi.fn()
  },
  ipcMain: {
    removeHandler: vi.fn(),
    handle: vi.fn()
  }
}))

import {
  getActiveAgentSourceRootPath,
  getBundledShellPaths,
  getRuntimeMainPath,
  getRuntimeHandlersPath,
  initBundledRuntimeHandlers,
  initBundledShellPaths,
  isBundledRuntimeFromClone,
  isBundledShellFromClone,
  isValidBundledRuntimeMain,
  resolveAgentHandlerFactories,
  resolveBundledShellPaths,
  resetBundledShellPathsForTests,
  setRuntimeBootstrapTestHooks
} from '../electron/main/runtimeBootstrap'
import * as asarFactories from '../electron/main/runtimeHandlers'

describe('runtimeBootstrap', () => {
  const cloneApp = join(userDataDir, 'source', 'app')
  const cloneMain = join(cloneApp, 'out', 'main', 'index.js')
  const cloneHandlers = join(cloneApp, 'out', 'main', 'runtimeHandlers.js')
  const cloneRenderer = join(cloneApp, 'out', 'renderer', 'index.html')
  const clonePreload = join(cloneApp, 'out', 'preload', 'index.cjs')
  const asarMain = join(process.cwd(), 'app', 'out', 'main', 'index.js')
  const asarRenderer = join(process.cwd(), 'app', 'out', 'renderer', 'index.html')
  const asarPreload = join(process.cwd(), 'app', 'out', 'preload', 'index.cjs')

  beforeEach(() => {
    setRuntimeBootstrapTestHooks(null)
    resetBundledShellPathsForTests()
  })

  afterEach(() => {
    setRuntimeBootstrapTestHooks(null)
    resetBundledShellPathsForTests()
  })

  it('isValidBundledRuntimeMain проверяет размер файла', () => {
    setRuntimeBootstrapTestHooks({
      existsSync: (p) => p === '/big.js' || p === '/small.js',
      statSize: (p) => (p === '/big.js' ? BUNDLED_RUNTIME_MAIN_MIN_BYTES : 10)
    })
    expect(isValidBundledRuntimeMain('/big.js')).toBe(true)
    expect(isValidBundledRuntimeMain('/small.js')).toBe(false)
    expect(isValidBundledRuntimeMain('/missing.js')).toBe(false)
  })

  it('getRuntimeMainPath предпочитает клон при валидном out/main', () => {
    setRuntimeBootstrapTestHooks({
      existsSync: (p) => p === cloneMain || p === asarMain,
      statSize: (p) =>
        p === cloneMain || p === asarMain ? BUNDLED_RUNTIME_MAIN_MIN_BYTES + 100 : 0
    })

    expect(getRuntimeMainPath({ isPackaged: true })).toBe(cloneMain)
  })

  it('getRuntimeMainPath fallback на asar если клон существует но файл слишком мал', () => {
    setRuntimeBootstrapTestHooks({
      existsSync: (p) => p === cloneMain || p === asarMain,
      statSize: (p) =>
        p === cloneMain ? 10 : p === asarMain ? BUNDLED_RUNTIME_MAIN_MIN_BYTES + 100 : 0
    })

    expect(getRuntimeMainPath({ isPackaged: true })).toBe(asarMain)
  })

  it('getRuntimeMainPath fallback на asar если клон невалиден', () => {
    setRuntimeBootstrapTestHooks({
      existsSync: (p) => p === asarMain,
      statSize: (p) => (p === asarMain ? BUNDLED_RUNTIME_MAIN_MIN_BYTES + 100 : 0)
    })

    expect(getRuntimeMainPath({ isPackaged: true })).toBe(asarMain)
  })

  it('getRuntimeMainPath в dev использует out/main из cwd', () => {
    const devMain = join(process.cwd(), 'out', 'main', 'index.js')
    setRuntimeBootstrapTestHooks({
      existsSync: (p) => p === devMain,
      statSize: () => BUNDLED_RUNTIME_MAIN_MIN_BYTES + 100
    })

    expect(getRuntimeMainPath({ isPackaged: false })).toBe(devMain)
  })

  it('getRuntimeHandlersPath рядом с runtime main', () => {
    setRuntimeBootstrapTestHooks({
      existsSync: (p) => p === cloneMain || p === cloneHandlers,
      statSize: () => BUNDLED_RUNTIME_MAIN_MIN_BYTES + 100
    })

    expect(getRuntimeHandlersPath({ isPackaged: true })).toBe(cloneHandlers)
  })

  it('initBundledRuntimeHandlers загружает handlers из клона', async () => {
    const mockFactories = {
      ...asarFactories,
      createProjectToolHandlers: vi.fn(asarFactories.createProjectToolHandlers)
    }

    setRuntimeBootstrapTestHooks({
      existsSync: (p) => p === cloneMain || p === cloneHandlers,
      statSize: () => BUNDLED_RUNTIME_MAIN_MIN_BYTES + 100,
      importModule: async () => mockFactories
    })

    const loaded = await initBundledRuntimeHandlers(true, { isPackaged: true })
    expect(loaded).toBe(true)
    expect(isBundledRuntimeFromClone()).toBe(true)
    expect(resolveAgentHandlerFactories()).toBe(mockFactories)
  })

  it('initBundledRuntimeHandlers fallback при liveRuntimeFromGit=false', async () => {
    setRuntimeBootstrapTestHooks({
      existsSync: () => true,
      statSize: () => BUNDLED_RUNTIME_MAIN_MIN_BYTES + 100,
      importModule: async () => asarFactories
    })

    const loaded = await initBundledRuntimeHandlers(false, { isPackaged: true })
    expect(loaded).toBe(false)
    expect(isBundledRuntimeFromClone()).toBe(false)
    expect(resolveAgentHandlerFactories()).toBe(asarFactories)
  })

  it('getActiveAgentSourceRootPath указывает на клон после initBundledRuntimeHandlers', async () => {
    setRuntimeBootstrapTestHooks({
      existsSync: (p) => p === cloneMain || p === cloneHandlers,
      statSize: () => BUNDLED_RUNTIME_MAIN_MIN_BYTES + 100,
      importModule: async () => asarFactories
    })

    await initBundledRuntimeHandlers(true, { isPackaged: true })
    expect(getActiveAgentSourceRootPath()).toBe(cloneApp)
  })

  it('resolveBundledShellPaths предпочитает renderer/preload из клона', () => {
    setRuntimeBootstrapTestHooks({
      existsSync: (p) =>
        p === cloneMain ||
        p === cloneRenderer ||
        p === clonePreload ||
        p === asarRenderer ||
        p === asarPreload,
      statSize: (p) => {
        if (p === cloneRenderer || p === asarRenderer) return 671
        if ([cloneMain, clonePreload, asarPreload].includes(p))
          return BUNDLED_RUNTIME_MAIN_MIN_BYTES + 100
        return 0
      }
    })

    const paths = resolveBundledShellPaths({ liveRuntimeFromGit: true, isPackaged: true })
    expect(paths.rendererIndex).toBe(cloneRenderer)
    expect(paths.preloadScript).toBe(clonePreload)
    expect(paths.fromClone).toBe(true)
  })

  it('resolveBundledShellPaths fallback на asar без клона', () => {
    setRuntimeBootstrapTestHooks({
      existsSync: (p) => p === asarRenderer || p === asarPreload,
      statSize: (p) =>
        p === asarRenderer || p === asarPreload ? BUNDLED_RUNTIME_MAIN_MIN_BYTES + 100 : 0
    })

    const paths = resolveBundledShellPaths({ liveRuntimeFromGit: true, isPackaged: true })
    expect(paths.rendererIndex).toBe(asarRenderer)
    expect(paths.preloadScript).toBe(asarPreload)
    expect(paths.fromClone).toBe(false)
  })

  it('initBundledShellPaths кэширует пути для getBundledShellPaths', () => {
    setRuntimeBootstrapTestHooks({
      existsSync: (p) =>
        p === cloneMain ||
        p === cloneRenderer ||
        p === clonePreload ||
        p === asarRenderer ||
        p === asarPreload,
      statSize: (p) => {
        if (p === cloneRenderer || p === asarRenderer) return 671
        if ([cloneMain, clonePreload, asarPreload].includes(p))
          return BUNDLED_RUNTIME_MAIN_MIN_BYTES + 100
        return 0
      }
    })

    initBundledShellPaths(true, { isPackaged: true })
    expect(getBundledShellPaths().rendererIndex).toBe(cloneRenderer)
    expect(isBundledShellFromClone()).toBe(true)
  })
})
