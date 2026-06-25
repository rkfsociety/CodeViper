import { app, BrowserWindow, session } from 'electron'
import { appendFile, mkdir } from 'fs/promises'
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setSourceRootOverride } from './codeviperSource'
import { loadSettings } from './settings'
import { ensureDefaultSkills } from './defaultSkills'
import { loadWindowState, trackWindowState, windowOptionsFromState } from './windowState'
import { stopSystemStatsPush } from './systemStats'
import { startUpdateChecks } from './updateChecker'
import { registerShutdownHook } from './appShutdown'
import { unloadModel } from './nodeLlama'
import { resolveAppIconPath } from './appIcon'
import {
  createTray,
  destroyTray,
  handleMainWindowClose,
  isAppQuitting,
  updateTrayAgentActivity
} from './tray'
import {
  pullCollectiveMemoryFromRemote,
  pullCollectiveSkillsFromRemote
} from './collectiveMemorySync'
import { clearAppState } from './appState'
import type { AgentSettings, AgentStreamPayload } from '../../src/types'
import { registerAppIpc } from './ipc/registerAppIpc'
import { registerFileIpc } from './ipc/registerFileIpc'
import { registerModelsIpc } from './ipc/registerModelsIpc'
import { registerMemoryIpc } from './ipc/registerMemoryIpc'
import { registerChatsIpc } from './ipc/registerChatsIpc'
import { registerSettingsIpc } from './ipc/registerSettingsIpc'
import { registerGithubIpc } from './ipc/registerGithubIpc'
import { registerMiscIpc } from './ipc/registerMiscIpc'
import { registerAgentIpc } from './ipc/registerAgentIpc'
import type { IpcContext } from './ipc/ipcContext'

// На части систем Windows GPU-процесс падает при создании кэша (0x5 Access denied),
// что вызывает чёрный экран. --in-process-gpu запускает GPU в основном процессе,
// обходя проблему с изолированным кэшем, и сохраняет аппаратное ускорение.
app.commandLine.appendSwitch('in-process-gpu')

if (process.env.CODEVIPER_E2E === '1') {
  const e2eUserData = join(tmpdir(), `codeviper-e2e-${process.pid}`)
  mkdirSync(e2eUserData, { recursive: true })
  app.setPath('userData', e2eUserData)
}

let mainWindow: BrowserWindow | null = null
const agentRunStates = new Map<string, { chatId: string }>()
const activeAgentAborts = new Map<string, AbortController>()
const pendingConfirms = new Map<string, (approved: boolean) => void>()
const pendingPreviews = new Map<string, (apply: boolean) => void>()
const pendingHunkSelections = new Map<string, number[]>()

registerShutdownHook(() => {
  for (const abort of activeAgentAborts.values()) abort.abort()
  activeAgentAborts.clear()
})
registerShutdownHook(() => stopSystemStatsPush())
registerShutdownHook(async () => {
  await unloadModel().catch(() => {})
})
registerShutdownHook(() => destroyTray())

let minimizeToTrayEnabled = true

function syncTrayAgentBadge(): void {
  updateTrayAgentActivity(agentRunStates.size)
}

function applyTraySettings(settings: AgentSettings): void {
  minimizeToTrayEnabled = settings.minimizeToTray !== false
}

// webContents.send на каждый чанк имеет накладные расходы на сериализацию и IPC.
const pendingTokenBuf = new Map<string, { token: string; thinking: string }>()
let tokenFlushTimer: ReturnType<typeof setTimeout> | null = null

function flushTokenBatch(): void {
  tokenFlushTimer = null
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingTokenBuf.clear()
    return
  }
  for (const [chatId, buf] of pendingTokenBuf) {
    if (buf.token)
      mainWindow.webContents.send('agent-stream', { chatId, type: 'token', content: buf.token })
    if (buf.thinking)
      mainWindow.webContents.send('agent-stream', {
        chatId,
        type: 'thinking',
        content: buf.thinking
      })
  }
  pendingTokenBuf.clear()
}

function flushChatTokens(chatId: string): void {
  const buf = pendingTokenBuf.get(chatId)
  if (!buf) return
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingTokenBuf.delete(chatId)
    return
  }
  if (buf.token)
    mainWindow.webContents.send('agent-stream', { chatId, type: 'token', content: buf.token })
  if (buf.thinking)
    mainWindow.webContents.send('agent-stream', {
      chatId,
      type: 'thinking',
      content: buf.thinking
    })
  pendingTokenBuf.delete(chatId)
  if (pendingTokenBuf.size === 0 && tokenFlushTimer) {
    clearTimeout(tokenFlushTimer)
    tokenFlushTimer = null
  }
}

// Скользящее окно прогонов: хранит timestamp начала каждого прогона за последний час.
const runTimestamps: number[] = []
const HOUR_MS = 60 * 60 * 1000

function recordRun(): void {
  const now = Date.now()
  runTimestamps.push(now)
  const cutoff = now - HOUR_MS
  while (runTimestamps.length > 0 && runTimestamps[0] < cutoff) runTimestamps.shift()
}

function appIconPath(): string | undefined {
  return resolveAppIconPath()
}

const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https: ws: wss:; font-src 'self' data:; worker-src 'self' blob:;"

async function createWindow(): Promise<void> {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP]
      }
    })
  })

  const icon = appIconPath()
  const windowState = await loadWindowState()
  mainWindow = new BrowserWindow({
    ...windowOptionsFromState(windowState),
    title: 'CodeViper',
    backgroundColor: '#0d1117',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  trackWindowState(mainWindow)

  mainWindow.on('close', (event) => {
    if (mainWindow) handleMainWindowClose(event, minimizeToTrayEnabled, mainWindow)
  })

  createTray(() => mainWindow)

  // Автоперезагрузка при падении рендерера (GPU crash, OOM и т.п.).
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload()
    }
  })

  const logsDir = join(app.getPath('userData'), 'logs')
  const rendererLogPath = join(logsDir, `renderer-${new Date().toISOString().slice(0, 10)}.ndjson`)
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) {
      const entry =
        JSON.stringify({ ts: new Date().toISOString(), level, message, line, sourceId }) + '\n'
      mkdir(logsDir, { recursive: true })
        .then(() => appendFile(rendererLogPath, entry, 'utf8'))
        .catch(() => {})
    }
  })
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    const entry =
      JSON.stringify({ ts: new Date().toISOString(), type: 'fail-load', code, desc, url }) + '\n'
    mkdir(logsDir, { recursive: true })
      .then(() => appendFile(rendererLogPath, entry, 'utf8'))
      .catch(() => {})
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function stream(chatId: string, event: AgentStreamPayload): void {
  if (event.type === 'token' || event.type === 'thinking') {
    let buf = pendingTokenBuf.get(chatId)
    if (!buf) {
      buf = { token: '', thinking: '' }
      pendingTokenBuf.set(chatId, buf)
    }
    if (event.type === 'token') buf.token += event.content ?? ''
    else buf.thinking += event.content ?? ''
    if (!tokenFlushTimer) tokenFlushTimer = setTimeout(flushTokenBatch, 50)
    return
  }
  // Перед любым нетокенным событием сбрасываем накопленные токены этого чата.
  flushChatTokens(chatId)
  mainWindow?.webContents.send('agent-stream', { chatId, ...event })
}

// Флаги устойчивости GPU — только в dev; in-process-gpu ломает окно на части систем.
if (!app.isPackaged) {
  app.commandLine.appendSwitch('disable-gpu-process-crash-limit')
  app.commandLine.appendSwitch('in-process-gpu')
}

async function installReactDevTools(): Promise<void> {
  try {
    const { default: installExtension, REACT_DEVELOPER_TOOLS } =
      await import('electron-devtools-installer')
    await installExtension(REACT_DEVELOPER_TOOLS, {
      loadExtensionOptions: { allowFileAccess: true }
    })
  } catch {
    // DevTools недоступны — не критично
  }
}

// Контекст с общим состоянием, передаваемый IPC-регистраторам.
const ipcContext: IpcContext = {
  getWindow: () => mainWindow,
  stream,
  agentRunStates,
  activeAgentAborts,
  pendingConfirms,
  pendingPreviews,
  pendingHunkSelections,
  syncTrayAgentBadge,
  applyTraySettings,
  recordRun
}

registerAppIpc(ipcContext)
registerFileIpc(ipcContext)
registerModelsIpc(ipcContext)
registerMemoryIpc()
registerChatsIpc()
registerSettingsIpc(ipcContext)
registerGithubIpc()
registerMiscIpc()
registerAgentIpc(ipcContext)

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.codeviper.app')
  }

  const settings = await loadSettings()
  applyTraySettings(settings)
  if (process.env.CODEVIPER_E2E) {
    minimizeToTrayEnabled = false
  }
  if (settings.sourceRootOverride) {
    setSourceRootOverride(settings.sourceRootOverride)
  }

  if (settings.gitSyncOnStartup && !process.env.CODEVIPER_E2E) {
    pullCollectiveMemoryFromRemote(settings.selfImproveBranch).catch(() => {})
    pullCollectiveSkillsFromRemote(settings.selfImproveBranch).catch(() => {})
  }

  await createWindow()

  void ensureDefaultSkills().catch((err) => {
    console.warn('[startup] ensureDefaultSkills:', err instanceof Error ? err.message : String(err))
  })

  if (!app.isPackaged) {
    void installReactDevTools()
  }

  if (mainWindow) startUpdateChecks(mainWindow.webContents, settings.updateChannel === 'beta')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU' && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reload()
  }
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return
  if (isAppQuitting()) {
    app.quit()
    return
  }
  if (minimizeToTrayEnabled && mainWindow && !mainWindow.isDestroyed()) return
  app.quit()
})

app.on('before-quit', () => {
  clearAppState().catch(() => {})
})
