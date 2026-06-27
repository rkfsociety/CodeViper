import { appendFile, mkdir } from 'fs/promises'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import {
  BUNDLED_SOURCE_APP_DIR_NAME,
  BUNDLED_SOURCE_BUILD_TIMEOUT_SEC
} from '../../shared/constants'
import { runCommandInAppRoot } from './codeviperSource'
import {
  getBundledSourceRoot,
  type BundledSourceSyncResult,
  runBundledGit
} from './bundledSourceSync'

export interface BundledSourceBuildResult {
  built: boolean
  skipped?: boolean
  reason?: string
  error?: string
}

const RUNTIME_MAIN_REL = join('out', 'main', 'index.js')
const SOURCE_SCAN_DIRS = ['electron', 'src', 'shared'] as const
const ROOT_SOURCE_FILES = ['package.json', 'package-lock.json', 'electron.vite.config.ts'] as const
const SKIP_DIR_NAMES = new Set(['node_modules', 'out', 'dist-electron', 'release', '.git'])

const BUILD_TIMEOUT_MS = BUNDLED_SOURCE_BUILD_TIMEOUT_SEC * 1000

type CommandRunner = (
  appRoot: string,
  command: string,
  timeoutMs?: number
) => Promise<{ stdout: string; stderr: string; exitCode: number | null }>

let commandRunnerOverride: CommandRunner | null = null

/** Только для unit-тестов — подмена npm-команд. */
export function setBundledSourceCommandRunnerForTests(runner: CommandRunner | null): void {
  commandRunnerOverride = runner
}

function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

async function logBundledSourceBuild(
  message: string,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    const dir = logsDir()
    await mkdir(dir, { recursive: true })
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'bundled-source-build',
        message,
        ...extra
      }) + '\n'
    await appendFile(join(dir, `bundled-source-${dateStamp()}.ndjson`), line, 'utf8')
  } catch {
    /* лог необязатен */
  }
}

function runBundledAppCommand(appRoot: string, command: string, timeoutMs = BUILD_TIMEOUT_MS) {
  if (commandRunnerOverride) return commandRunnerOverride(appRoot, command, timeoutMs)
  return runCommandInAppRoot(appRoot, command, timeoutMs)
}

/** %APPDATA%/CodeViper/source/app */
export function getBundledSourceAppRoot(): string {
  return join(getBundledSourceRoot(), BUNDLED_SOURCE_APP_DIR_NAME)
}

export function getBundledRuntimeMainPath(): string {
  return join(getBundledSourceAppRoot(), RUNTIME_MAIN_REL)
}

function maxMtimeInTree(dir: string): number {
  if (!existsSync(dir)) return 0

  let max = 0
  const stack = [dir]

  while (stack.length > 0) {
    const current = stack.pop()!
    let names: string[]
    try {
      names = readdirSync(current)
    } catch {
      continue
    }

    for (const name of names) {
      if (SKIP_DIR_NAMES.has(name)) continue
      const full = join(current, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!/\.(ts|tsx|json|mts|cts)$/.test(name)) continue
      max = Math.max(max, st.mtimeMs)
    }
  }

  return max
}

/** true если out/main/index.js отсутствует или старее исходников app/. */
export function isBundledRuntimeMainStale(appRoot = getBundledSourceAppRoot()): boolean {
  const mainOut = join(appRoot, RUNTIME_MAIN_REL)
  if (!existsSync(mainOut)) return true

  const outMtime = statSync(mainOut).mtimeMs
  let sourceMtime = 0

  for (const rel of ROOT_SOURCE_FILES) {
    const file = join(appRoot, rel)
    if (existsSync(file)) sourceMtime = Math.max(sourceMtime, statSync(file).mtimeMs)
  }
  for (const rel of SOURCE_SCAN_DIRS) {
    sourceMtime = Math.max(sourceMtime, maxMtimeInTree(join(appRoot, rel)))
  }

  return sourceMtime > outMtime
}

/** npm install если нет node_modules или package-lock.json новее. */
export function needsBundledSourceNpmInstall(appRoot = getBundledSourceAppRoot()): boolean {
  const nodeModules = join(appRoot, 'node_modules')
  if (!existsSync(nodeModules)) return true

  const lock = join(appRoot, 'package-lock.json')
  if (!existsSync(lock)) return false

  return statSync(lock).mtimeMs > statSync(nodeModules).mtimeMs
}

export function shouldBuildBundledSourceAfterSync(
  syncResult: BundledSourceSyncResult,
  appRoot = getBundledSourceAppRoot()
): boolean {
  if (!existsSync(join(appRoot, 'package.json'))) return false
  if (syncResult.cloneCreated) return true
  if (syncResult.appDirChanged) return true
  return isBundledRuntimeMainStale(appRoot)
}

/** npm install (при необходимости) + npm run build в source/app. */
export async function buildBundledSourceRuntime(
  appRoot = getBundledSourceAppRoot()
): Promise<BundledSourceBuildResult> {
  if (!existsSync(join(appRoot, 'package.json'))) {
    await logBundledSourceBuild('skip: no app/package.json', { appRoot })
    return { built: false, skipped: true, reason: 'no-app-dir' }
  }

  if (needsBundledSourceNpmInstall(appRoot)) {
    await logBundledSourceBuild('npm install', { appRoot })
    const install = await runBundledAppCommand(appRoot, 'npm install')
    if (install.exitCode !== 0) {
      const error = (install.stderr || install.stdout || 'npm install failed').trim()
      await logBundledSourceBuild('npm install failed', { appRoot, error })
      return { built: false, error }
    }
  }

  await logBundledSourceBuild('npm run build', { appRoot })
  const build = await runBundledAppCommand(appRoot, 'npm run build')
  if (build.exitCode !== 0) {
    const error = (build.stderr || build.stdout || 'npm run build failed').trim()
    await logBundledSourceBuild('build failed', { appRoot, error })
    return { built: false, error }
  }

  const mainOut = join(appRoot, RUNTIME_MAIN_REL)
  if (!existsSync(mainOut)) {
    const error = `build finished but ${RUNTIME_MAIN_REL} missing`
    await logBundledSourceBuild('build incomplete', { appRoot, error })
    return { built: false, error }
  }

  await logBundledSourceBuild('build complete', { appRoot, mainOut })
  return { built: true }
}

/** Фоновая сборка после pull, если изменился app/ или stale out/main. */
export async function maybeBuildBundledSourceAfterSync(
  syncResult: BundledSourceSyncResult
): Promise<BundledSourceBuildResult | null> {
  if (!shouldBuildBundledSourceAfterSync(syncResult)) {
    await logBundledSourceBuild('skip: runtime up to date', {
      updated: syncResult.updated,
      appDirChanged: syncResult.appDirChanged
    })
    return null
  }

  return buildBundledSourceRuntime().then(async (result) => {
    if (result.built) {
      void import('./runtimeUpdate').then(({ markRuntimeUpdateReady }) =>
        markRuntimeUpdateReady(syncResult.localHead)
      )
      // Подхватить IPC из свежего runtimeHandlers.js без обязательного relaunch
      try {
        const { loadSettings } = await import('./settings')
        const { initBundledRuntimeFromSettings } = await import('./runtimeBootstrap')
        await initBundledRuntimeFromSettings(await loadSettings())
      } catch {
        /* fallback: пользователь перезапустит по баннеру */
      }
    }
    return result
  })
}

/** Проверка изменений app/ между двумя коммитами (тесты / диагностика). */
export async function bundledSourceAppChangedBetween(
  cloneRoot: string,
  fromRef: string,
  toRef: string
): Promise<boolean> {
  const diff = await runBundledGit(cloneRoot, ['diff', '--name-only', fromRef, toRef, '--', 'app/'])
  return diff.stdout.trim().length > 0
}
