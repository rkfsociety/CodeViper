import { appendFile, mkdir } from 'fs/promises'
import { app, BrowserWindow, type WebContents } from 'electron'
import { join } from 'path'
import { IPC } from '../../shared/ipcContracts'
import type { UpdateInfo } from '../../shared/updateInfo'
import { runShutdownHooks } from './appShutdown'
import { shutdownEmbeddingWorker } from './embeddingQueue'
import { shutdownLargeFileWorker } from './largeFileQueue'

let pendingRuntimeUpdate = false
let pendingLocalHead: string | undefined
let targetWebContents: WebContents | null = null

function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

async function logRuntimeUpdate(message: string, extra?: Record<string, unknown>): Promise<void> {
  try {
    const dir = logsDir()
    await mkdir(dir, { recursive: true })
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'runtime-update',
        message,
        ...extra
      }) + '\n'
    await appendFile(join(dir, `bundled-source-${dateStamp()}.ndjson`), line, 'utf8')
  } catch {
    /* лог необязателен */
  }
}

export function isRuntimeUpdatePending(): boolean {
  return pendingRuntimeUpdate
}

export function clearRuntimeUpdatePending(): void {
  pendingRuntimeUpdate = false
  pendingLocalHead = undefined
}

export function buildRuntimeUpdateInfo(localHead?: string): UpdateInfo {
  return {
    source: 'runtime',
    ready: true,
    ...(localHead ? { localHead } : {})
  }
}

export function notifyRuntimeUpdateReady(webContents: WebContents, localHead?: string): void {
  if (webContents.isDestroyed()) return
  const info = buildRuntimeUpdateInfo(localHead)
  webContents.send(IPC.RUNTIME_UPDATE_READY, info)
  webContents.send(IPC.UPDATE_AVAILABLE, info)
}

/** После успешного pull+build в клоне — показать баннер перезапуска. */
export function markRuntimeUpdateReady(localHead?: string): void {
  if (process.env.CODEVIPER_E2E === '1') return
  if (!app.isPackaged) return

  pendingRuntimeUpdate = true
  pendingLocalHead = localHead
  void logRuntimeUpdate('runtime update ready', { localHead })

  if (targetWebContents && !targetWebContents.isDestroyed()) {
    notifyRuntimeUpdateReady(targetWebContents, localHead)
  }
}

export function startRuntimeUpdateNotifier(webContents: WebContents): void {
  targetWebContents = webContents
  if (pendingRuntimeUpdate && !webContents.isDestroyed()) {
    notifyRuntimeUpdateReady(webContents, pendingLocalHead)
  }
}

export function stopRuntimeUpdateNotifier(): void {
  targetWebContents = null
}

export function dismissRuntimeUpdate(): void {
  clearRuntimeUpdatePending()
  void logRuntimeUpdate('runtime update dismissed')
}

async function prepareForRuntimeRelaunch(): Promise<void> {
  shutdownEmbeddingWorker()
  shutdownLargeFileWorker()
  await runShutdownHooks()

  for (const win of BrowserWindow.getAllWindows()) {
    win.removeAllListeners('close')
    if (!win.isDestroyed()) win.destroy()
  }
}

/** Перезапуск .exe — при старте initBundledRuntimeHandlers загрузит runtime из клона. */
export async function relaunchForRuntimeUpdate(): Promise<void> {
  await logRuntimeUpdate('relaunch for runtime update', { localHead: pendingLocalHead })
  clearRuntimeUpdatePending()
  await prepareForRuntimeRelaunch()
  app.relaunch()
  app.exit(0)
}
