import { appendFile, mkdir } from 'fs/promises'
import { existsSync, statSync } from 'fs'
import { join } from 'path'
import { app, type BrowserWindow } from 'electron'
import {
  BUNDLED_RUNTIME_MAIN_MIN_BYTES,
  BUNDLED_SHELL_RENDERER_MIN_BYTES
} from '../../shared/constants'
import { getBundledSourceAppRoot } from './bundledSourceBuild'

export interface LiveShellPaths {
  rendererIndex: string
  preloadScript: string
}

function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

async function logLiveShell(message: string, extra?: Record<string, unknown>): Promise<void> {
  try {
    const dir = logsDir()
    await mkdir(dir, { recursive: true })
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'live-shell',
        message,
        ...extra
      }) + '\n'
    await appendFile(join(dir, `bundled-source-${dateStamp()}.ndjson`), line, 'utf8')
  } catch {
    /* лог необязателен */
  }
}

/** Packaged: валидный out/renderer+preload в git-клоне (index.html может быть <1 KB). */
export function resolveLiveShellPathsFromClone(): LiveShellPaths | null {
  if (!app.isPackaged || process.env.CODEVIPER_E2E === '1') return null

  const root = getBundledSourceAppRoot()
  const renderer = join(root, 'out/renderer/index.html')
  const preload = join(root, 'out/preload/index.js')
  const main = join(root, 'out/main/index.js')

  if (!existsSync(main) || statSync(main).size < BUNDLED_RUNTIME_MAIN_MIN_BYTES) return null
  if (!existsSync(renderer) || statSync(renderer).size < BUNDLED_SHELL_RENDERER_MIN_BYTES)
    return null
  if (!existsSync(preload) || statSync(preload).size < BUNDLED_RUNTIME_MAIN_MIN_BYTES) return null

  return { rendererIndex: renderer, preloadScript: preload }
}

function rendererUrlPointsToClone(url: string, rendererIndex: string): boolean {
  const normalizedPath = rendererIndex.replace(/\\/g, '/').toLowerCase()
  const normalizedUrl = decodeURIComponent(url).replace(/\\/g, '/').toLowerCase()
  return normalizedUrl.includes('out/renderer/index.html') && normalizedUrl.includes(normalizedPath)
}

async function reloadWindowRendererFromClone(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) return false

  const paths = resolveLiveShellPathsFromClone()
  if (!paths) return false

  const currentUrl = win.webContents.getURL()
  if (currentUrl && rendererUrlPointsToClone(currentUrl, paths.rendererIndex)) return false

  await win.loadFile(paths.rendererIndex)
  await logLiveShell('reloaded renderer from clone', { rendererIndex: paths.rendererIndex })
  return true
}

/** Перезагрузить renderer существующих окон из клона (preload без relaunch .exe не меняется). */
export async function reloadAllWindowsRendererFromClone(): Promise<boolean> {
  const { BrowserWindow } = await import('electron')
  let reloaded = false
  for (const win of BrowserWindow.getAllWindows()) {
    if (await reloadWindowRendererFromClone(win)) reloaded = true
  }
  return reloaded
}

/**
 * Для packaged 0.3.x: asar initBundledShellPaths отвергает index.html <1 KB.
 * Этот хук подгружается из клона через runtimeHandlers.js и перезагружает UI после старта.
 */
export function installLiveShellRendererReload(): void {
  if (!app.isPackaged || process.env.CODEVIPER_E2E === '1') return

  app.on('browser-window-created', (_event, win) => {
    win.webContents.once('did-finish-load', () => {
      void reloadWindowRendererFromClone(win).catch((err) => {
        void logLiveShell('renderer reload failed', {
          error: err instanceof Error ? err.message : String(err)
        })
      })
    })
  })
}
