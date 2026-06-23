import { spawn } from 'child_process'
import { appendFile, mkdir } from 'fs/promises'
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import type { AppUpdater } from 'electron-updater'
import type { WebContents } from 'electron'
import type { UpdateInfo } from '../../shared/updateInfo'
import { resolveWindowsPendingInstaller } from '../../shared/updateInstall'
import { getCodeViperSourceRoot } from './codeviperSource'
import { runShutdownHooks } from './appShutdown'
import { shutdownEmbeddingWorker } from './embeddingQueue'
import { shutdownLargeFileWorker } from './largeFileQueue'

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
    const child = spawn('git', args, { cwd, windowsHide: true })
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
let gitTimer: ReturnType<typeof setInterval> | null = null
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

/**
 * Dev/исходники: git fetch и проверка обновлений app/ на origin.
 */
async function checkGitSourceUpdate(webContents: WebContents): Promise<void> {
  const source = getCodeViperSourceRoot()

  const top = await runGit(source, ['rev-parse', '--show-toplevel'])
  if (top.code !== 0) return

  const branchRes = await runGit(source, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = branchRes.stdout.trim()
  if (!branch || branch === 'HEAD') return

  const fetch = await runGit(source, ['fetch', 'origin', branch, '--quiet'])
  if (fetch.code !== 0) return

  const local = (await runGit(source, ['rev-parse', 'HEAD'])).stdout.trim()
  const remote = (await runGit(source, ['rev-parse', `origin/${branch}`])).stdout.trim()
  if (!remote || local === remote) return

  const diff = await runGit(source, ['diff', '--quiet', 'HEAD', `origin/${branch}`, '--', '.'])
  if (diff.code === 0) return

  const countRes = await runGit(source, ['rev-list', '--count', `HEAD..origin/${branch}`])
  const commits = parseInt(countRes.stdout.trim(), 10) || 1

  sendUpdate(webContents, { source: 'git', commits })
}

async function startReleaseUpdateChecks(webContents: WebContents): Promise<void> {
  if (releaseChecksStarted) return
  releaseChecksStarted = true

  const autoUpdater = await getAutoUpdater()
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

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => {})
  }, 5_000)
}

export function startUpdateChecks(webContents: WebContents): void {
  if (app.isPackaged) {
    void startReleaseUpdateChecks(webContents)
    return
  }

  if (gitTimer) return
  setTimeout(() => void checkGitSourceUpdate(webContents).catch(() => {}), 5_000)
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
}

function runWindowsInstallerFallback(): boolean {
  if (process.platform !== 'win32') return false
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return false
  const installer = resolveWindowsPendingInstaller(localAppData)
  if (!installer) return false

  try {
    const child = spawn(installer, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })
    child.unref()
    void logUpdate('windows-installer-fallback', { installer })
    app.exit(0)
    return true
  } catch (err) {
    void logUpdate('windows-installer-fallback-failed', {
      error: err instanceof Error ? err.message : String(err)
    })
    return false
  }
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
  installInProgress = true

  if (!app.isPackaged) {
    app.relaunch()
    app.exit(0)
    return
  }

  if (!updateDownloadReady) {
    void logUpdate('install-skipped-not-ready')
    installInProgress = false
    return
  }

  void (async () => {
    await logUpdate('install-start', { version: pendingReleaseVersion })
    await prepareForInstall()
    launchQuitAndInstall()

    // Если quitAndInstall не завершил процесс — запускаем установщик вручную (Windows).
    setTimeout(() => {
      void logUpdate('install-timeout-fallback')
      runWindowsInstallerFallback()
    }, 12_000).unref()
  })()
}
