import { spawn } from 'child_process'
import { appendFile, mkdir } from 'fs/promises'
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import type { AppUpdater } from 'electron-updater'
import type { WebContents } from 'electron'
import type { UpdateInfo } from '../../shared/updateInfo'
import {
  launchDetachedWindowsInstaller,
  resolveWindowsPendingInstaller
} from '../../shared/updateInstall'
import {
  formatCheckForUpdatesMessage,
  type CheckForUpdatesResult
} from '../../shared/checkForUpdatesResult'
import { getCodeViperSourceRoot } from './codeviperSource'
import { peekBundledSourceUpdate } from './bundledSourceSync'
import {
  isRuntimeUpdatePending,
  relaunchForRuntimeUpdate,
  consumeRuntimeUpdateForShellInstall
} from './runtimeUpdate'
import { runShutdownHooks } from './appShutdown'
import { shutdownEmbeddingWorker } from './embeddingQueue'
import { shutdownLargeFileWorker } from './largeFileQueue'
import { cliSpawnBase } from './windowsGitEnv'

let autoUpdaterPromise: Promise<AppUpdater> | null = null

async function getAutoUpdater(): Promise<AppUpdater> {
  if (!autoUpdaterPromise) {
    autoUpdaterPromise = import('electron-updater').then((pkg) => pkg.default.autoUpdater)
  }
  return autoUpdaterPromise
}

function runGit(
  cwd: string,
  args: string[],
  timeoutMs = 15_000
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, cliSpawnBase(cwd))
    let stdout = ''
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout })
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(1)
    }, timeoutMs)
    child.stdout?.on('data', (c: Buffer) => (stdout += c.toString()))
    child.on('close', (code) => finish(code ?? 1))
    child.on('error', () => finish(1))
  })
}

const GIT_CHECK_INTERVAL_MS = 10 * 60 * 1000
const RELEASE_CHECK_INTERVAL_MS = 30 * 60 * 1000
const UPDATE_CHECK_INITIAL_DELAY_MS = 5_000
let gitTimer: ReturnType<typeof setInterval> | null = null
let releaseTimer: ReturnType<typeof setInterval> | null = null
let releaseChecksStarted = false
let pendingReleaseVersion: string | null = null
let updateDownloadReady = false
let installInProgress = false

async function logUpdate(message: string, extra?: Record<string, unknown>): Promise<void> {
  try {
    const logsDir = join(app.getPath('userData'), 'logs')
    await mkdir(logsDir, { recursive: true })
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'auto-update',
        message,
        ...extra
      }) + '\n'
    await appendFile(join(logsDir, `update-${new Date().toISOString().slice(0, 10)}.ndjson`), line)
  } catch {
    /* ignore */
  }
}

function sendUpdate(webContents: WebContents, info: UpdateInfo): void {
  if (!webContents.isDestroyed()) {
    webContents.send('update-available', info)
  }
}

interface GitSourceProbeResult {
  available: boolean
  commits: number
  error?: string
}

/**
 * Dev/исходники: git fetch и проверка обновлений app/ на origin.
 */
async function probeGitSourceUpdate(webContents: WebContents): Promise<GitSourceProbeResult> {
  const source = getCodeViperSourceRoot()

  const top = await runGit(source, ['rev-parse', '--show-toplevel'])
  if (top.code !== 0) {
    return { available: false, commits: 0, error: 'Не git-репозиторий' }
  }

  const branchRes = await runGit(source, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = branchRes.stdout.trim()
  if (!branch || branch === 'HEAD') {
    return { available: false, commits: 0, error: 'Не удалось определить ветку' }
  }

  const fetch = await runGit(source, ['fetch', 'origin', branch, '--quiet'])
  if (fetch.code !== 0) {
    return { available: false, commits: 0, error: 'git fetch не удался' }
  }

  const local = (await runGit(source, ['rev-parse', 'HEAD'])).stdout.trim()
  const remote = (await runGit(source, ['rev-parse', `origin/${branch}`])).stdout.trim()
  if (!remote || local === remote) {
    return { available: false, commits: 0 }
  }

  const diff = await runGit(source, ['diff', '--quiet', 'HEAD', `origin/${branch}`, '--', '.'])
  if (diff.code === 0) {
    return { available: false, commits: 0 }
  }

  const countRes = await runGit(source, ['rev-list', '--count', `HEAD..origin/${branch}`])
  const commits = parseInt(countRes.stdout.trim(), 10) || 1

  sendUpdate(webContents, { source: 'git', commits })
  return { available: true, commits }
}

async function checkGitSourceUpdate(webContents: WebContents): Promise<void> {
  await probeGitSourceUpdate(webContents)
}

async function checkReleaseUpdate(): Promise<void> {
  if (updateDownloadReady || installInProgress) return
  const autoUpdater = await getAutoUpdater()
  await autoUpdater.checkForUpdates().catch(() => {})
}

async function startReleaseUpdateChecks(
  webContents: WebContents,
  allowPrerelease: boolean
): Promise<void> {
  if (releaseChecksStarted) return
  releaseChecksStarted = true

  const autoUpdater = await getAutoUpdater()
  autoUpdater.allowPrerelease = allowPrerelease
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoRunAppAfterInstall = true

  autoUpdater.on('update-available', (info) => {
    pendingReleaseVersion = info.version
    updateDownloadReady = false
    void logUpdate('update-available', { version: info.version })
    sendUpdate(webContents, {
      source: 'release',
      version: info.version,
      ready: false
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    if (!pendingReleaseVersion) return
    sendUpdate(webContents, {
      source: 'release',
      version: pendingReleaseVersion,
      ready: false,
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    pendingReleaseVersion = info.version
    updateDownloadReady = true
    void logUpdate('update-downloaded', { version: info.version })
    sendUpdate(webContents, {
      source: 'release',
      version: info.version,
      ready: true
    })
  })

  autoUpdater.on('error', (err) => {
    void logUpdate('error', { error: err instanceof Error ? err.message : String(err) })
  })

  if (releaseTimer) return
  setTimeout(() => void checkReleaseUpdate().catch(() => {}), UPDATE_CHECK_INITIAL_DELAY_MS)
  releaseTimer = setInterval(
    () => void checkReleaseUpdate().catch(() => {}),
    RELEASE_CHECK_INTERVAL_MS
  )
}

export async function checkForUpdatesNow(
  webContents: WebContents,
  allowPrerelease = false
): Promise<CheckForUpdatesResult> {
  const currentVersion = app.getVersion()
  const packaged = app.isPackaged

  if (packaged) {
    if (!releaseChecksStarted) {
      await startReleaseUpdateChecks(webContents, allowPrerelease)
    }

    let release: CheckForUpdatesResult['release']
    if (updateDownloadReady && pendingReleaseVersion) {
      release = {
        checked: true,
        status: 'ready',
        version: pendingReleaseVersion
      }
      sendUpdate(webContents, {
        source: 'release',
        version: pendingReleaseVersion,
        ready: true
      })
    } else if (pendingReleaseVersion) {
      release = {
        checked: true,
        status: 'downloading',
        version: pendingReleaseVersion
      }
    } else {
      try {
        const autoUpdater = await getAutoUpdater()
        const result = await autoUpdater.checkForUpdates()
        const version = result?.updateInfo?.version
        if (version) {
          release = { checked: true, status: 'available', version }
        } else {
          release = { checked: true, status: 'upToDate', version: currentVersion }
        }
      } catch (err) {
        release = {
          checked: true,
          status: 'error',
          error: err instanceof Error ? err.message : String(err)
        }
      }
    }

    const peek = await peekBundledSourceUpdate()
    const runtime: CheckForUpdatesResult['runtime'] = peek.error
      ? { checked: true, status: 'error', error: peek.error }
      : peek.available
        ? {
            checked: true,
            status: 'available',
            commitsBehind: peek.commitsBehind,
            localHead: peek.localHead
          }
        : { checked: true, status: 'upToDate', localHead: peek.localHead }

    const result: CheckForUpdatesResult = {
      ok: release.status !== 'error' && runtime.status !== 'error',
      currentVersion,
      packaged,
      release,
      runtime,
      message: ''
    }
    result.message = formatCheckForUpdatesMessage(result)
    return result
  }

  const gitProbe = await probeGitSourceUpdate(webContents)
  const release: CheckForUpdatesResult['release'] = {
    checked: false,
    status: 'skipped'
  }
  const runtime: CheckForUpdatesResult['runtime'] = gitProbe.error
    ? { checked: true, status: 'error', error: gitProbe.error }
    : gitProbe.available
      ? { checked: true, status: 'available', commitsBehind: gitProbe.commits }
      : { checked: true, status: 'upToDate' }

  const result: CheckForUpdatesResult = {
    ok: runtime.status !== 'error',
    currentVersion,
    packaged,
    release,
    runtime,
    message: ''
  }
  result.message = formatCheckForUpdatesMessage(result)
  return result
}

export function startUpdateChecks(webContents: WebContents, allowPrerelease = false): void {
  if (app.isPackaged) {
    void startReleaseUpdateChecks(webContents, allowPrerelease)
    return
  }

  if (gitTimer) return
  setTimeout(
    () => void checkGitSourceUpdate(webContents).catch(() => {}),
    UPDATE_CHECK_INITIAL_DELAY_MS
  )
  gitTimer = setInterval(
    () => void checkGitSourceUpdate(webContents).catch(() => {}),
    GIT_CHECK_INTERVAL_MS
  )
}

export function stopUpdateChecks(): void {
  if (gitTimer) {
    clearInterval(gitTimer)
    gitTimer = null
  }
  if (releaseTimer) {
    clearInterval(releaseTimer)
    releaseTimer = null
  }
}

function runWindowsInstallerFallback(): boolean {
  if (process.platform !== 'win32') return false
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return false
  const installer = resolveWindowsPendingInstaller(localAppData)
  if (!installer) return false

  const launched = launchDetachedWindowsInstaller(installer, spawn, (err) => {
    void logUpdate('windows-installer-fallback-failed', {
      error: err.message
    })
  })
  if (launched) {
    void logUpdate('windows-installer-fallback', { installer })
    app.exit(0)
    return true
  }
  return false
}

async function prepareForInstall(): Promise<void> {
  stopUpdateChecks()
  shutdownEmbeddingWorker()
  shutdownLargeFileWorker()
  await runShutdownHooks()

  for (const win of BrowserWindow.getAllWindows()) {
    win.removeAllListeners('close')
    if (!win.isDestroyed()) win.destroy()
  }
}

function launchQuitAndInstall(): void {
  setTimeout(() => {
    void (async () => {
      try {
        const autoUpdater = await getAutoUpdater()
        autoUpdater.autoRunAppAfterInstall = true
        autoUpdater.quitAndInstall(false, true)
      } catch (err) {
        void logUpdate('quitAndInstall-threw', {
          error: err instanceof Error ? err.message : String(err)
        })
        runWindowsInstallerFallback()
      }
    })()
  }, 0)
}

export function installPendingUpdate(): void {
  if (installInProgress) return

  if (!app.isPackaged) {
    installInProgress = true
    app.relaunch()
    app.exit(0)
    return
  }

  if (updateDownloadReady) {
    installInProgress = true
    if (isRuntimeUpdatePending()) {
      consumeRuntimeUpdateForShellInstall()
    }
    void (async () => {
      await logUpdate('install-start', { version: pendingReleaseVersion })
      await prepareForInstall()
      launchQuitAndInstall()

      setTimeout(() => {
        void logUpdate('install-timeout-fallback')
        runWindowsInstallerFallback()
      }, 12_000).unref()
    })()
    return
  }

  if (isRuntimeUpdatePending()) {
    installInProgress = true
    void relaunchForRuntimeUpdate().catch((err) => {
      installInProgress = false
      void logUpdate('runtime-relaunch-failed', {
        error: err instanceof Error ? err.message : String(err)
      })
    })
    return
  }

  void logUpdate('install-skipped-not-ready')
}

export function installRuntimeUpdateOnly(): void {
  if (installInProgress || !isRuntimeUpdatePending()) return
  installInProgress = true
  void relaunchForRuntimeUpdate().catch((err) => {
    installInProgress = false
    void logUpdate('runtime-only-relaunch-failed', {
      error: err instanceof Error ? err.message : String(err)
    })
  })
}
