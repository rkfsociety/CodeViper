import { spawn } from 'child_process'
import { app } from 'electron'
import pkg from 'electron-updater'
const { autoUpdater } = pkg
import type { WebContents } from 'electron'
import type { UpdateInfo } from '../../shared/updateInfo'
import { getCodeViperSourceRoot } from './codeviperSource'

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

function startReleaseUpdateChecks(webContents: WebContents): void {
  if (releaseChecksStarted) return
  releaseChecksStarted = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    pendingReleaseVersion = info.version
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
    sendUpdate(webContents, {
      source: 'release',
      version: info.version,
      ready: true
    })
  })

  autoUpdater.on('error', () => {
    /* офлайн / нет релиза — тихо */
  })

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => {})
  }, 5_000)
}

export function startUpdateChecks(webContents: WebContents): void {
  if (app.isPackaged) {
    startReleaseUpdateChecks(webContents)
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

export function installPendingUpdate(): void {
  if (app.isPackaged) {
    autoUpdater.quitAndInstall()
    return
  }
  app.relaunch()
  app.exit(0)
}
