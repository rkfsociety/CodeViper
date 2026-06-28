import { app, BrowserWindow, ipcMain, shell, Notification } from 'electron'
import { appendFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { IPC, parseIpcArgs, Contracts } from '../../../shared/ipcContracts'
import { readAppState, writeAppState, clearAppState } from '../appState'
import { installPendingUpdate, checkForUpdatesNow } from '../updateChecker'
import { dismissRuntimeUpdate } from '../runtimeUpdate'
import { forceSyncBundledSource } from '../bundledSourceSync'
import { getPluginsDirectory } from '../pluginLoader'
import { loadUiLayout, saveUiLayout } from '../uiLayout'
import type { AppState } from '../../../src/types'
import type { IpcContext } from './ipcContext'

export function registerAppIpc(ctx: IpcContext): void {
  const { getWindow } = ctx

  ipcMain.on(IPC.SAVE_APP_STATE, (_e, state: AppState | null) => {
    if (!state) {
      clearAppState().catch(() => {})
    } else {
      writeAppState(state).catch(() => {})
    }
  })

  ipcMain.handle(IPC.LOAD_UI_LAYOUT, async () => loadUiLayout())

  ipcMain.handle(IPC.SAVE_UI_LAYOUT, async (_e, ...a) => {
    const [layout] = parseIpcArgs(Contracts[IPC.SAVE_UI_LAYOUT].args, a)
    return saveUiLayout(layout)
  })

  ipcMain.handle(IPC.GET_CRASH_RECOVERY, async () => {
    if (process.env.CODEVIPER_E2E) return null
    const state = await readAppState()
    if (state) await clearAppState()
    return state
  })

  ipcMain.on(IPC.LOG_FRONTEND_ERROR, (_e, message: string, stack?: string) => {
    const logsDir = join(app.getPath('userData'), 'logs')
    const date = new Date().toISOString().slice(0, 10)
    const filePath = join(logsDir, `frontend-${date}.ndjson`)
    const line = JSON.stringify({ ts: new Date().toISOString(), message, stack }) + '\n'
    mkdir(logsDir, { recursive: true })
      .then(() => appendFile(filePath, line, 'utf8'))
      .catch(() => {})
  })

  ipcMain.handle(IPC.SHOW_AGENT_DONE_NOTIFICATION, async (_e, ...a) => {
    const [payload] = parseIpcArgs(Contracts[IPC.SHOW_AGENT_DONE_NOTIFICATION].args, a)
    if (!Notification.isSupported()) return false
    const notification = new Notification({
      title: payload.title,
      body: payload.body,
      silent: true
    })
    notification.on('click', () => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      win?.show()
      win?.focus()
    })
    notification.show()
    return true
  })

  ipcMain.on(IPC.OPEN_DEVTOOLS, () => {
    getWindow()?.webContents.openDevTools({ mode: 'detach' })
  })

  ipcMain.on(IPC.RESTART_APP, () => {
    installPendingUpdate()
  })

  ipcMain.on(IPC.INSTALL_UPDATE, () => {
    installPendingUpdate()
  })

  ipcMain.on(IPC.DISMISS_RUNTIME_UPDATE, () => {
    dismissRuntimeUpdate()
  })

  ipcMain.handle(IPC.FORCE_SYNC_BUNDLED_RUNTIME, async (_e, ...a) => {
    parseIpcArgs(Contracts[IPC.FORCE_SYNC_BUNDLED_RUNTIME].args, a)
    return forceSyncBundledSource()
  })

  ipcMain.handle(IPC.CHECK_FOR_UPDATES, async (_e, ...a) => {
    parseIpcArgs(Contracts[IPC.CHECK_FOR_UPDATES].args, a)
    const win = getWindow()
    if (!win || win.isDestroyed()) {
      return {
        ok: false,
        currentVersion: app.getVersion(),
        packaged: app.isPackaged,
        release: { checked: false, status: 'skipped' as const },
        runtime: { checked: false, status: 'skipped' as const },
        message: 'Окно приложения недоступно'
      }
    }
    return checkForUpdatesNow(win.webContents)
  })

  ipcMain.on(IPC.OPEN_EXTERNAL, (_e, url: string) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
  })

  ipcMain.on(IPC.SHOW_ITEM_IN_FOLDER, (_e, filePath: string) => {
    if (typeof filePath === 'string' && filePath.trim()) {
      shell.showItemInFolder(filePath)
    }
  })

  ipcMain.handle('open-plugins-folder', async () => {
    const dir = getPluginsDirectory()
    await shell.openPath(dir)
    return dir
  })
}
