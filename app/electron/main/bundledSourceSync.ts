import { spawn } from 'child_process'
import { appendFile, mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { pathToFileURL } from 'url'
import { app } from 'electron'
import { Mutex } from 'async-mutex'
import {
  BUNDLED_SOURCE_DIR_NAME,
  BUNDLED_SOURCE_FIRST_CLONE_WAIT_MS,
  BUNDLED_SOURCE_STARTUP_WAIT_MS,
  CODEVIPER_GITHUB_CLONE_URL,
  CODEVIPER_RUNTIME_SYNC_BRANCH
} from '../../shared/constants'
import { loadSettings, saveSettings } from './settings'
import { cliSpawnBase, resolveGitExecutable } from './windowsGitEnv'
import { getRuntimeHandlersPath } from './runtimeBootstrap'
import type { BundledSourceBuildResult } from './bundledSourceBuild'

export interface BundledSourceSyncResult {
  updated: boolean
  localHead?: string
  error?: string
  /** В pull изменились файлы под app/ */
  appDirChanged?: boolean
  /** Только что создан git clone (нужна сборка runtime) */
  cloneCreated?: boolean
}

export interface ForceBundledSourceSyncResult {
  ok: boolean
  updated: boolean
  localHead?: string
  built: boolean
  restartNeeded: boolean
  error?: string
  message?: string
}

export interface GitRunResult {
  code: number
  stdout: string
  stderr: string
}

type GitRunner = (cwd: string, args: string[]) => Promise<GitRunResult>

const GIT_TIMEOUT_MS = 60_000
/** Первый clone репозитория может занять больше минуты на медленной сети */
const GIT_CLONE_TIMEOUT_MS = 300_000

let gitRunnerOverride: GitRunner | null = null
const ensureCloneMutex = new Mutex()
/** Не повторять git clone чаще раза в 5 минут после неудачи */
const CLONE_RETRY_COOLDOWN_MS = 5 * 60 * 1000
let lastCloneFailureAt = 0

/** Только для unit-тестов — сброс cooldown после неудачного clone. */
export function resetBundledSourceCloneStateForTests(): void {
  lastCloneFailureAt = 0
}

/** Только для unit-тестов — подмена вызовов git. */
export function setGitRunnerForTests(runner: GitRunner | null): void {
  gitRunnerOverride = runner
}

function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

async function logBundledSourceSync(
  message: string,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    const dir = logsDir()
    await mkdir(dir, { recursive: true })
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'bundled-source-sync',
        message,
        ...extra
      }) + '\n'
    await appendFile(join(dir, `bundled-source-${dateStamp()}.ndjson`), line, 'utf8')
  } catch {
    /* лог необязателен */
  }
}

function defaultRunGit(
  cwd: string,
  args: string[],
  timeoutMs = GIT_TIMEOUT_MS
): Promise<GitRunResult> {
  return new Promise((resolve) => {
    const child = spawn(resolveGitExecutable(), args, cliSpawnBase(cwd))
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (code: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    }

    const timer = setTimeout(() => {
      child.kill()
      finish(1)
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => finish(code ?? 1))
    child.on('error', () => finish(1))
  })
}

function runGit(cwd: string, args: string[], timeoutMs = GIT_TIMEOUT_MS): Promise<GitRunResult> {
  if (gitRunnerOverride) return gitRunnerOverride(cwd, args)
  return defaultRunGit(cwd, args, timeoutMs)
}

/** Git в клоне bundled source (тесты — setGitRunnerForTests). */
export function runBundledGit(cwd: string, args: string[]): Promise<GitRunResult> {
  return runGit(cwd, args)
}

/** Абсолютный путь к клону: %APPDATA%/CodeViper/source */
export function getBundledSourceRoot(): string {
  return join(app.getPath('userData'), BUNDLED_SOURCE_DIR_NAME)
}

async function persistGitRepoRootIfUnset(root: string): Promise<void> {
  try {
    const settings = await loadSettings()
    if (settings.gitRepoRoot?.trim()) return
    await saveSettings({ ...settings, gitRepoRoot: root })
  } catch {
    /* настройки недоступны — клон всё равно на диске */
  }
}

async function isDirectoryEmpty(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir)
    return entries.length === 0
  } catch {
    return true
  }
}

/**
 * Клонирует https://github.com/rkfsociety/CodeViper в %APPDATA%/CodeViper/source,
 * если клона ещё нет. Нужен git в PATH (и сеть). При успехе прописывает gitRepoRoot в настройки.
 */
export async function ensureBundledSourceClone(): Promise<string | null> {
  return ensureCloneMutex.runExclusive(async () => {
    const root = getBundledSourceRoot()
    if (existsSync(join(root, '.git'))) return root

    if (Date.now() - lastCloneFailureAt < CLONE_RETRY_COOLDOWN_MS) {
      return null
    }

    const gitVersion = await runGit(process.cwd(), ['--version'])
    if (gitVersion.code !== 0) {
      await logBundledSourceSync('clone skip: git not in PATH')
      return null
    }

    if (existsSync(root) && !(await isDirectoryEmpty(root))) {
      await logBundledSourceSync('clone skip: source dir exists without .git', { root })
      return null
    }

    const parent = dirname(root)
    await mkdir(parent, { recursive: true })

    await logBundledSourceSync('clone start', { root, url: CODEVIPER_GITHUB_CLONE_URL })
    const clone = await runGit(
      parent,
      [
        'clone',
        '--depth',
        '1',
        '--branch',
        CODEVIPER_RUNTIME_SYNC_BRANCH,
        CODEVIPER_GITHUB_CLONE_URL,
        BUNDLED_SOURCE_DIR_NAME
      ],
      GIT_CLONE_TIMEOUT_MS
    )

    if (clone.code !== 0 || !existsSync(join(root, '.git'))) {
      const error = (clone.stderr || clone.stdout || 'git clone failed').trim()
      lastCloneFailureAt = Date.now()
      await logBundledSourceSync('clone failed', { root, error, code: clone.code })
      return null
    }

    await logBundledSourceSync('clone ok', { root })
    await persistGitRepoRootIfUnset(root)
    return root
  })
}

/**
 * Клон в userData — кэш runtime с master, не рабочая копия самоулучшения.
 * После agent/* checkout и локальных правок — fetch + принудительный master.
 */
async function prepareBundledSourceForRuntimeSync(
  root: string
): Promise<{ ok: boolean; error?: string }> {
  const remoteRef = `origin/${CODEVIPER_RUNTIME_SYNC_BRANCH}`

  const fetch = await runGit(root, ['fetch', 'origin', CODEVIPER_RUNTIME_SYNC_BRANCH, '--quiet'])
  if (fetch.code !== 0) {
    return {
      ok: false,
      error: (fetch.stderr || fetch.stdout || 'git fetch failed').trim()
    }
  }

  const checkout = await runGit(root, [
    'checkout',
    '-f',
    '-B',
    CODEVIPER_RUNTIME_SYNC_BRANCH,
    remoteRef
  ])
  if (checkout.code !== 0) {
    return {
      ok: false,
      error: (checkout.stderr || checkout.stdout || 'git checkout failed').trim()
    }
  }

  return { ok: true }
}

export interface BundledSourcePeekResult {
  available: boolean
  commitsBehind: number
  localHead?: string
  remoteHead?: string
  error?: string
}

/** Только fetch + сравнение с origin/master, без checkout и pull. */
export async function peekBundledSourceUpdate(): Promise<BundledSourcePeekResult> {
  if (!app.isPackaged) {
    return { available: false, commitsBehind: 0, error: 'Только для установленной версии' }
  }

  const root = getBundledSourceRoot()
  if (!existsSync(join(root, '.git'))) {
    return { available: false, commitsBehind: 0, error: 'Клон runtime не найден' }
  }

  const remoteRef = `origin/${CODEVIPER_RUNTIME_SYNC_BRANCH}`
  const fetch = await runGit(root, ['fetch', 'origin', CODEVIPER_RUNTIME_SYNC_BRANCH, '--quiet'])
  if (fetch.code !== 0) {
    return {
      available: false,
      commitsBehind: 0,
      error: (fetch.stderr || fetch.stdout || 'git fetch failed').trim()
    }
  }

  const localRes = await runGit(root, ['rev-parse', 'HEAD'])
  const remoteRes = await runGit(root, ['rev-parse', remoteRef])
  const localHead = localRes.stdout.trim()
  const remoteHead = remoteRes.stdout.trim()

  if (!localHead || !remoteHead || localHead === remoteHead) {
    return { available: false, commitsBehind: 0, localHead, remoteHead }
  }

  const countRes = await runGit(root, ['rev-list', '--count', `${localHead}..${remoteHead}`])
  const commitsBehind = parseInt(countRes.stdout.trim(), 10) || 1

  return { available: true, commitsBehind, localHead, remoteHead }
}

/** Синхронизация клона с origin/master; при отсутствии клона — git clone. */
export async function syncBundledSource(): Promise<BundledSourceSyncResult> {
  const root = getBundledSourceRoot()
  let cloneCreated = false

  if (!existsSync(join(root, '.git'))) {
    const ensured = await ensureBundledSourceClone()
    if (!ensured) {
      await logBundledSourceSync('skip: no git clone', { root })
      return { updated: false }
    }
    cloneCreated = true
  }

  const before = await runGit(root, ['rev-parse', 'HEAD'])
  const headBefore = before.stdout.trim()

  const prepared = await prepareBundledSourceForRuntimeSync(root)
  if (!prepared.ok) {
    await logBundledSourceSync('sync failed', { root, error: prepared.error })
    return {
      updated: false,
      localHead: headBefore || undefined,
      error: prepared.error
    }
  }

  const after = await runGit(root, ['rev-parse', 'HEAD'])
  const localHead = after.stdout.trim()
  const updated = Boolean(localHead && headBefore && localHead !== headBefore)

  let appDirChanged = false
  if (updated && headBefore && localHead) {
    const diff = await runGit(root, ['diff', '--name-only', headBefore, localHead, '--', 'app/'])
    appDirChanged = diff.stdout.trim().length > 0
  }

  await logBundledSourceSync('sync complete', {
    root,
    updated,
    localHead,
    appDirChanged,
    cloneCreated
  })
  return {
    updated,
    localHead: localHead || undefined,
    ...(cloneCreated ? { cloneCreated: true } : {}),
    ...(updated ? { appDirChanged } : {})
  }
}

/** Не вызывает sync при liveRuntimeFromGit === false. */
export async function syncBundledSourceIfEnabled(
  liveRuntimeFromGit: boolean
): Promise<BundledSourceSyncResult | null> {
  if (!liveRuntimeFromGit) return null
  return syncBundledSource()
}

export interface BundledSourceStartupOptions {
  isPackaged?: boolean
  /** Переопределение лимита ожидания (только тесты). */
  startupWaitMs?: number
  /** Переопределение ожидания первого clone (только тесты). */
  firstCloneWaitMs?: number
}

export function shouldRunBundledSourceStartupSync(options: {
  isPackaged: boolean
  liveRuntimeFromGit: boolean
}): boolean {
  if (process.env.CODEVIPER_E2E === '1') return false
  return options.isPackaged && options.liveRuntimeFromGit
}

type MaybeBuildAfterSyncFn = (
  syncResult: BundledSourceSyncResult
) => Promise<BundledSourceBuildResult | null>

/** asar fallback; при готовом клоне — maybeBuild из свежего runtimeHandlers.js. */
export async function resolveMaybeBuildAfterSync(): Promise<MaybeBuildAfterSyncFn> {
  const handlersPath = getRuntimeHandlersPath()
  if (handlersPath) {
    try {
      const mod = (await import(pathToFileURL(handlersPath).href)) as {
        maybeBuildBundledSourceAfterSync?: MaybeBuildAfterSyncFn
      }
      if (typeof mod.maybeBuildBundledSourceAfterSync === 'function') {
        await logBundledSourceSync('build delegate: clone runtimeHandlers', { handlersPath })
        return mod.maybeBuildBundledSourceAfterSync
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await logBundledSourceSync('build delegate failed — fallback to asar', {
        error,
        handlersPath
      })
    }
  }

  const { maybeBuildBundledSourceAfterSync } = await import('./bundledSourceBuild')
  return maybeBuildBundledSourceAfterSync
}

/**
 * Pull при старте packaged-приложения. Ждёт не дольше BUNDLED_SOURCE_STARTUP_WAIT_MS;
 * дольше — sync продолжается в фоне. Ошибки только в лог, fallback на asar.
 */
export async function runBundledSourceStartupSync(
  liveRuntimeFromGit: boolean,
  options?: BundledSourceStartupOptions
): Promise<void> {
  const isPackaged = options?.isPackaged ?? app.isPackaged
  if (!shouldRunBundledSourceStartupSync({ isPackaged, liveRuntimeFromGit })) return

  const root = getBundledSourceRoot()
  const firstClone = !existsSync(join(root, '.git'))
  const waitMs = firstClone
    ? (options?.firstCloneWaitMs ?? BUNDLED_SOURCE_FIRST_CLONE_WAIT_MS)
    : (options?.startupWaitMs ?? BUNDLED_SOURCE_STARTUP_WAIT_MS)

  const syncPromise = syncBundledSource()
    .then(async (result) => {
      if (result.error) {
        await logBundledSourceSync('startup sync failed — fallback to asar', {
          error: result.error,
          localHead: result.localHead
        })
      } else {
        void resolveMaybeBuildAfterSync()
          .then((maybeBuild) => maybeBuild(result))
          .catch(async (err) => {
            const error = err instanceof Error ? err.message : String(err)
            await logBundledSourceSync('startup build error — fallback to asar', { error })
          })
      }
      return result
    })
    .catch(async (err) => {
      const error = err instanceof Error ? err.message : String(err)
      await logBundledSourceSync('startup sync error — fallback to asar', { error })
    })

  await Promise.race([syncPromise, new Promise<void>((resolve) => setTimeout(resolve, waitMs))])
}

/**
 * Ручная синхронизация клона с GitHub + пересборка runtime (Настройки → Поведение).
 * Работает только в packaged .exe; не зависит от liveRuntimeFromGit.
 */
export async function forceSyncBundledSource(): Promise<ForceBundledSourceSyncResult> {
  if (process.env.CODEVIPER_E2E === '1') {
    return {
      ok: false,
      updated: false,
      built: false,
      restartNeeded: false,
      error: 'Недоступно в тестовом режиме'
    }
  }

  if (!app.isPackaged) {
    return {
      ok: false,
      updated: false,
      built: false,
      restartNeeded: false,
      error: 'Доступно только в установленной версии (CodeViper.exe)'
    }
  }

  await logBundledSourceSync('force sync start')

  const syncResult = await syncBundledSource()
  if (syncResult.error) {
    await logBundledSourceSync('force sync failed', { error: syncResult.error })
    return {
      ok: false,
      updated: syncResult.updated,
      localHead: syncResult.localHead,
      built: false,
      restartNeeded: false,
      error: syncResult.error
    }
  }

  const { maybeBuildBundledSourceAfterSync } = await import('./bundledSourceBuild')
  const buildResult = await maybeBuildBundledSourceAfterSync(syncResult, { force: true })

  if (buildResult?.error) {
    await logBundledSourceSync('force build failed', { error: buildResult.error })
    return {
      ok: false,
      updated: syncResult.updated,
      localHead: syncResult.localHead,
      built: false,
      restartNeeded: false,
      error: buildResult.error
    }
  }

  const built = buildResult?.built === true
  const { isRuntimeUpdatePending } = await import('./runtimeUpdate')
  const restartNeeded = isRuntimeUpdatePending()
  const headShort = syncResult.localHead?.slice(0, 7)

  let message: string
  if (restartNeeded) {
    message = headShort
      ? `Обновлено до ${headShort}. Перезапустите приложение для применения.`
      : 'Обновление готово. Перезапустите приложение для применения.'
  } else if (built) {
    message = headShort
      ? syncResult.updated
        ? `Обновлено до ${headShort}, runtime пересобран.`
        : `Уже актуальная версия (${headShort}), runtime пересобран.`
      : 'Runtime пересобран.'
  } else if (syncResult.updated) {
    message = headShort ? `Обновлено до ${headShort}.` : 'Синхронизация завершена.'
  } else {
    message = headShort ? `Уже актуальная версия (${headShort}).` : 'Уже актуальная версия.'
  }

  await logBundledSourceSync('force sync complete', {
    updated: syncResult.updated,
    localHead: syncResult.localHead,
    built,
    restartNeeded
  })

  return {
    ok: true,
    updated: syncResult.updated,
    localHead: syncResult.localHead,
    built,
    restartNeeded,
    message
  }
}
