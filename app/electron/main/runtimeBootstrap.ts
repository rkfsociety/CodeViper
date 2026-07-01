import { appendFile, mkdir } from 'fs/promises'
import { existsSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { app } from 'electron'
import {
  BUNDLED_RUNTIME_MAIN_MIN_BYTES,
  BUNDLED_SHELL_RENDERER_MIN_BYTES
} from '../../shared/constants'
import { getCodeViperSourceRoot, setSourceRootOverride } from './codeviperSource'
import { getBundledSourceAppRoot } from './bundledSourcePaths'
import type { AgentSettings } from '../../src/types'
import type { ToolHandlers } from './agentTools'
import * as asarHandlerFactories from './runtimeHandlers'
import {
  isBundledRuntimeFromClone as readBundledRuntimeFromClone,
  setBundledRuntimeFromClone
} from './runtimeSourceState'

const RUNTIME_MAIN_FILE = join('out', 'main', 'index.js')
const RUNTIME_HANDLERS_FILE = join('out', 'main', 'runtimeHandlers.js')
const RUNTIME_RENDERER_FILE = join('out', 'renderer', 'index.html')
const RUNTIME_PRELOAD_FILE = join('out', 'preload', 'index.cjs')

export interface BundledShellPaths {
  rendererIndex: string
  preloadScript: string
  fromClone: boolean
}

interface ProjectToolHandlerFactories {
  handlers: Partial<ToolHandlers>
  clearEditSnapshots?: () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnsafeHandlerFactory<T> = (...args: any[]) => T

export interface AgentHandlerFactories {
  createProjectToolHandlers: UnsafeHandlerFactory<ProjectToolHandlerFactories>
  createGitHubToolHandlers: UnsafeHandlerFactory<Partial<ToolHandlers>>
  createGitLabToolHandlers: UnsafeHandlerFactory<Partial<ToolHandlers>>
  createJiraToolHandlers: UnsafeHandlerFactory<Partial<ToolHandlers>>
  createLinearToolHandlers: UnsafeHandlerFactory<Partial<ToolHandlers>>
  createMemoryToolHandlers: UnsafeHandlerFactory<Partial<ToolHandlers>>
  createSkillsToolHandlers: UnsafeHandlerFactory<Partial<ToolHandlers>>
  createTodoToolHandlers: UnsafeHandlerFactory<Partial<ToolHandlers>>
  createWebToolHandlers: UnsafeHandlerFactory<Partial<ToolHandlers>>
  createMcpToolHandlers: UnsafeHandlerFactory<Partial<ToolHandlers>>
}

type HandlerModuleLoader = (
  path: string
) => Promise<AgentHandlerFactories & LiveRuntimeHandlerExtras>

type LiveRuntimeHandlerExtras = {
  ensureLiveRuntimeExtras?: () => void
}

let cachedCloneFactories: (AgentHandlerFactories & LiveRuntimeHandlerExtras) | null = null
let cachedAsarFactories: AgentHandlerFactories | null = null
let handlerModuleLoaderOverride: HandlerModuleLoader | null = null
let pathExistsOverride: ((path: string) => boolean) | null = null
let statSizeOverride: ((path: string) => number) | null = null

/** Только для unit-тестов. */
export function setRuntimeBootstrapTestHooks(
  hooks: {
    existsSync?: (path: string) => boolean
    statSize?: (path: string) => number
    importModule?: HandlerModuleLoader
  } | null
): void {
  pathExistsOverride = hooks?.existsSync ?? null
  statSizeOverride = hooks?.statSize ?? null
  handlerModuleLoaderOverride = hooks?.importModule ?? null
}

function pathExists(path: string): boolean {
  if (pathExistsOverride) return pathExistsOverride(path)
  return existsSync(path)
}

function fileSize(path: string): number {
  if (statSizeOverride) return statSizeOverride(path)
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

async function logRuntimeBootstrap(
  message: string,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    const dir = logsDir()
    await mkdir(dir, { recursive: true })
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'runtime-bootstrap',
        message,
        ...extra
      }) + '\n'
    await appendFile(join(dir, `bundled-source-${dateStamp()}.ndjson`), line, 'utf8')
  } catch {
    /* лог необязателен */
  }
}

export function isValidBundledRuntimeMain(mainPath: string): boolean {
  if (!pathExists(mainPath)) return false
  return fileSize(mainPath) >= BUNDLED_RUNTIME_MAIN_MIN_BYTES
}

function asarShellPaths(): BundledShellPaths {
  return {
    rendererIndex: resolve(app.getAppPath(), 'out', 'renderer', 'index.html'),
    preloadScript: resolve(app.getAppPath(), 'out', 'preload', 'index.cjs'),
    fromClone: false
  }
}

function devShellPaths(mainDir: string): BundledShellPaths {
  return {
    rendererIndex: resolve(mainDir, '../renderer/index.html'),
    preloadScript: resolve(mainDir, '../preload/index.cjs'),
    fromClone: false
  }
}

function isValidBundledRendererIndex(rendererPath: string): boolean {
  if (!pathExists(rendererPath)) return false
  return fileSize(rendererPath) >= BUNDLED_SHELL_RENDERER_MIN_BYTES
}

function isValidBundledPreloadScript(preloadPath: string): boolean {
  if (!pathExists(preloadPath)) return false
  return fileSize(preloadPath) >= BUNDLED_RUNTIME_MAIN_MIN_BYTES
}

/**
 * Packaged: при liveRuntimeFromGit и валидном out/ в клоне — UI из source/app/out,
 * иначе asar. Dev — относительно out/main.
 */
export function resolveBundledShellPaths(options?: {
  liveRuntimeFromGit?: boolean
  isPackaged?: boolean
  mainDir?: string
}): BundledShellPaths {
  const isPackaged = options?.isPackaged ?? app.isPackaged
  const mainDir = options?.mainDir ?? __dirname

  if (!isPackaged) {
    return devShellPaths(mainDir)
  }

  const liveRuntime = options?.liveRuntimeFromGit !== false
  if (liveRuntime) {
    const cloneRoot = getBundledSourceAppRoot()
    const cloneMain = join(cloneRoot, RUNTIME_MAIN_FILE)
    const cloneRenderer = join(cloneRoot, RUNTIME_RENDERER_FILE)
    const clonePreload = join(cloneRoot, RUNTIME_PRELOAD_FILE)

    if (
      isValidBundledRuntimeMain(cloneMain) &&
      isValidBundledRendererIndex(cloneRenderer) &&
      isValidBundledPreloadScript(clonePreload)
    ) {
      return {
        rendererIndex: resolve(cloneRenderer),
        preloadScript: resolve(clonePreload),
        fromClone: true
      }
    }

    void logRuntimeBootstrap('shell fallback to asar', {
      cloneRenderer,
      rendererBytes: fileSize(cloneRenderer),
      clonePreload,
      preloadBytes: fileSize(clonePreload),
      mainValid: isValidBundledRuntimeMain(cloneMain)
    })
  }

  return asarShellPaths()
}

let cachedShellPaths: BundledShellPaths | null = null

export function initBundledShellPaths(
  liveRuntimeFromGit: boolean,
  options?: { isPackaged?: boolean; mainDir?: string }
): BundledShellPaths {
  cachedShellPaths = resolveBundledShellPaths({
    liveRuntimeFromGit,
    isPackaged: options?.isPackaged,
    mainDir: options?.mainDir
  })
  if (cachedShellPaths.fromClone) {
    void logRuntimeBootstrap('loaded shell from clone', {
      rendererIndex: cachedShellPaths.rendererIndex,
      preloadScript: cachedShellPaths.preloadScript
    })
  }
  return cachedShellPaths
}

export function getBundledShellPaths(): BundledShellPaths {
  if (!cachedShellPaths) {
    cachedShellPaths = resolveBundledShellPaths({
      liveRuntimeFromGit: false,
      isPackaged: app.isPackaged,
      mainDir: __dirname
    })
  }
  return cachedShellPaths
}

export function isBundledShellFromClone(): boolean {
  return cachedShellPaths?.fromClone === true
}

export function isBundledRuntimeFromClone(): boolean {
  return readBundledRuntimeFromClone()
}

/** Только для unit-тестов. */
export function resetBundledShellPathsForTests(): void {
  cachedShellPaths = null
}

function asarRuntimeMainPath(): string {
  return join(app.getAppPath(), RUNTIME_MAIN_FILE)
}

function cloneRuntimeMainPath(): string {
  return join(getBundledSourceAppRoot(), RUNTIME_MAIN_FILE)
}

/**
 * Путь к out/main/index.js: для packaged — клон при валидном out/, иначе asar.
 * В dev — out/main текущей сборки (если есть).
 */
export function getRuntimeMainPath(options?: { isPackaged?: boolean }): string | null {
  const isPackaged = options?.isPackaged ?? app.isPackaged

  if (isPackaged) {
    const cloneMain = cloneRuntimeMainPath()
    if (isValidBundledRuntimeMain(cloneMain)) return cloneMain
    const asarMain = asarRuntimeMainPath()
    if (isValidBundledRuntimeMain(asarMain)) return asarMain
    return null
  }

  const devMain = join(process.cwd(), RUNTIME_MAIN_FILE)
  if (isValidBundledRuntimeMain(devMain)) return devMain
  const devAppMain = join(process.cwd(), 'app', RUNTIME_MAIN_FILE)
  if (isValidBundledRuntimeMain(devAppMain)) return devAppMain
  return null
}

export function getRuntimeHandlersPath(options?: { isPackaged?: boolean }): string | null {
  const mainPath = getRuntimeMainPath(options)
  if (!mainPath) return null
  const handlersPath = join(dirname(mainPath), 'runtimeHandlers.js')
  return pathExists(handlersPath) ? handlersPath : null
}

/** Корень app/ для подсказок агента и self-edit (клон или asar/dev). */
export function getActiveAgentSourceRootPath(): string {
  if (readBundledRuntimeFromClone()) return getBundledSourceAppRoot()
  return getCodeViperSourceRoot()
}

async function importHandlerModule(
  handlersPath: string
): Promise<AgentHandlerFactories & LiveRuntimeHandlerExtras> {
  if (handlerModuleLoaderOverride) return handlerModuleLoaderOverride(handlersPath)
  const mod = (await import(pathToFileURL(handlersPath).href)) as AgentHandlerFactories &
    LiveRuntimeHandlerExtras
  if (typeof mod.createProjectToolHandlers !== 'function') {
    throw new Error('runtimeHandlers.js: missing createProjectToolHandlers export')
  }
  return mod
}

function resetRuntimeState(): void {
  cachedCloneFactories = null
  setBundledRuntimeFromClone(false)
}

/** Фабрики handlers: клон (dynamic import) или asar (static). */
export function resolveAgentHandlerFactories(): AgentHandlerFactories {
  return cachedCloneFactories ?? loadAsarHandlerFactories()
}

/**
 * Dynamic import runtimeHandlers.js из клона (packaged + liveRuntimeFromGit).
 * Fallback — static asar exports через resolveAgentHandlerFactories().
 */
export async function initBundledRuntimeHandlers(
  liveRuntimeFromGit: boolean,
  options?: { isPackaged?: boolean }
): Promise<boolean> {
  resetRuntimeState()

  if (process.env.CODEVIPER_E2E === '1') return false

  const isPackaged = options?.isPackaged ?? app.isPackaged
  if (!isPackaged || !liveRuntimeFromGit) return false

  const cloneMain = cloneRuntimeMainPath()
  const cloneHandlers = join(getBundledSourceAppRoot(), RUNTIME_HANDLERS_FILE)

  if (!isValidBundledRuntimeMain(cloneMain) || !pathExists(cloneHandlers)) {
    await logRuntimeBootstrap('skip: clone runtime not ready', {
      cloneMain,
      cloneHandlers,
      mainValid: isValidBundledRuntimeMain(cloneMain),
      handlersExists: pathExists(cloneHandlers)
    })
    return false
  }

  try {
    cachedCloneFactories = await importHandlerModule(cloneHandlers)
    if (typeof cachedCloneFactories.ensureLiveRuntimeExtras === 'function') {
      cachedCloneFactories.ensureLiveRuntimeExtras()
    }
    setBundledRuntimeFromClone(true)
    setSourceRootOverride(getBundledSourceAppRoot())
    await logRuntimeBootstrap('loaded runtime from clone', {
      cloneHandlers,
      cloneMain
    })
    return true
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await logRuntimeBootstrap('clone import failed — fallback to asar', { error, cloneHandlers })
    resetRuntimeState()
    return false
  }
}

export async function initBundledRuntimeFromSettings(settings: AgentSettings): Promise<boolean> {
  return initBundledRuntimeHandlers(settings.liveRuntimeFromGit !== false)
}
function loadAsarHandlerFactories(): AgentHandlerFactories {
  if (cachedAsarFactories) return cachedAsarFactories
  cachedAsarFactories = asarHandlerFactories
  return cachedAsarFactories
}
