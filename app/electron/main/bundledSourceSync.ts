import { spawn } from 'child_process'
import { appendFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { BUNDLED_SOURCE_DIR_NAME, BUNDLED_SOURCE_STARTUP_WAIT_MS } from '../../shared/constants'

export interface BundledSourceSyncResult {
  updated: boolean
  localHead?: string
  error?: string
  /** В pull изменились файлы под app/ */
  appDirChanged?: boolean
}

export interface GitRunResult {
  code: number
  stdout: string
  stderr: string
}

type GitRunner = (cwd: string, args: string[]) => Promise<GitRunResult>

const GIT_TIMEOUT_MS = 60_000

let gitRunnerOverride: GitRunner | null = null

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

function defaultRunGit(cwd: string, args: string[]): Promise<GitRunResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, windowsHide: true })
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
    }, GIT_TIMEOUT_MS)

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

function runGit(cwd: string, args: string[]): Promise<GitRunResult> {
  if (gitRunnerOverride) return gitRunnerOverride(cwd, args)
  return defaultRunGit(cwd, args)
}

/** Git в клоне bundled source (тесты — setGitRunnerForTests). */
export function runBundledGit(cwd: string, args: string[]): Promise<GitRunResult> {
  return runGit(cwd, args)
}

/** Абсолютный путь к клону: %APPDATA%/CodeViper/source */
export function getBundledSourceRoot(): string {
  return join(app.getPath('userData'), BUNDLED_SOURCE_DIR_NAME)
}

/** git pull --ff-only в клоне; без pull если нет .git */
export async function syncBundledSource(): Promise<BundledSourceSyncResult> {
  const root = getBundledSourceRoot()

  if (!existsSync(join(root, '.git'))) {
    await logBundledSourceSync('skip: no git clone', { root })
    return { updated: false }
  }

  const before = await runGit(root, ['rev-parse', 'HEAD'])
  const headBefore = before.stdout.trim()

  const pull = await runGit(root, ['pull', '--ff-only'])
  if (pull.code !== 0) {
    const error = (pull.stderr || pull.stdout || 'git pull --ff-only failed').trim()
    await logBundledSourceSync('pull failed', { root, error, code: pull.code })
    return {
      updated: false,
      localHead: headBefore || undefined,
      error
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

  await logBundledSourceSync('sync complete', { root, updated, localHead, appDirChanged })
  return {
    updated,
    localHead: localHead || undefined,
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
}

export function shouldRunBundledSourceStartupSync(options: {
  isPackaged: boolean
  liveRuntimeFromGit: boolean
}): boolean {
  if (process.env.CODEVIPER_E2E === '1') return false
  return options.isPackaged && options.liveRuntimeFromGit
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

  const waitMs = options?.startupWaitMs ?? BUNDLED_SOURCE_STARTUP_WAIT_MS

  const syncPromise = syncBundledSource()
    .then(async (result) => {
      if (result.error) {
        await logBundledSourceSync('startup sync failed — fallback to asar', {
          error: result.error,
          localHead: result.localHead
        })
      } else {
        void import('./bundledSourceBuild')
          .then(({ maybeBuildBundledSourceAfterSync }) => maybeBuildBundledSourceAfterSync(result))
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
