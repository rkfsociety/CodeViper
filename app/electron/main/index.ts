import { app, BrowserWindow, Menu, session } from 'electron'
import { appendFile, mkdir } from 'fs/promises'
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { setSourceRootOverride } from './codeviperSource'
import { loadSettings } from './settings'
import { ensureDefaultSkills } from './defaultSkills'
import { loadWindowState, trackWindowState, windowOptionsFromState } from './windowState'
import { stopSystemStatsPush } from './systemStats'
import { stopP2pWssStatusPush, startP2pWssStatusPush } from './p2pConnectionPush'
import { syncP2pWssConnection, stopP2pWssConnection } from './p2pClient'
import { startUpdateChecks } from './updateChecker'
import { startRuntimeUpdateNotifier } from './runtimeUpdate'
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
import { appendChatTraceEvent } from './traceStorage'
import { maybeAutoReportAgentTraceOnRunEnd, trackTraceRunStart } from './autoTraceGithubReport'
import { registerAppIpc } from './ipc/registerAppIpc'
import { registerFileIpc } from './ipc/registerFileIpc'
import { registerModelsIpc } from './ipc/registerModelsIpc'
import { registerMemoryIpc } from './ipc/registerMemoryIpc'
import { registerChatsIpc } from './ipc/registerChatsIpc'
import { registerSettingsIpc } from './ipc/registerSettingsIpc'
import { registerGithubIpc } from './ipc/registerGithubIpc'
import { registerMiscIpc } from './ipc/registerMiscIpc'
import { registerAgentIpc } from './ipc/registerAgentIpc'
import { ensureLiveRuntimeExtras } from './runtimeHandlers'
import type { IpcContext } from './ipc/ipcContext'
import type { AgentSettings, AgentStreamPayload } from '../../src/types'
import { IPC } from '../../shared/ipcContracts'
import { healthCheckMcpServers } from './mcpRegistry'
import { runBundledSourceStartupSync } from './bundledSourceSync'
import {
  initBundledRuntimeFromSettings,
  initBundledShellPaths,
  getBundledShellPaths
} from './runtimeBootstrap'
import { isBundledRuntimeFromClone } from './runtimeSourceState'
import {
  getAppWindowTitle,
  refreshAppWindowTitle,
  registerMainWindowForTitle
} from './appWindowTitle'
import { getElectronMainDir } from './electronMainDir'

if (process.env.CODEVIPER_E2E === '1') {
  const e2eUserData = join(tmpdir(), `codeviper-e2e-${process.pid}`)
  mkdirSync(e2eUserData, { recursive: true })
  app.setPath('userData', e2eUserData)
}

let mainWindow: BrowserWindow | null = null
const agentRunStates = new Map<string, { chatId: string; projectPath?: string }>()
const activeAgentAborts = new Map<string, AbortController>()
const pendingConfirms = new Map<string, (approved: boolean) => void>()
const pendingClarifies = new Map<string, (answer: string | null) => void>()
const pendingPlanConfirms = new Map<string, (approved: boolean) => void>()
const pendingPreviews = new Map<string, (apply: boolean) => void>()
const pendingHunkSelections = new Map<string, number[]>()

registerShutdownHook(() => {
  for (const abort of activeAgentAborts.values()) abort.abort()
  activeAgentAborts.clear()
})
registerShutdownHook(() => stopSystemStatsPush())
registerShutdownHook(() => {
  stopP2pWssStatusPush()
  stopP2pWssConnection()
})
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

let sessionCspHooked = false
let recoveringMainWindow = false
let gpuRecoverStreak = 0
let lastGpuRecoverMs = 0

function ensureSessionCsp(): void {
  if (sessionCspHooked) return
  sessionCspHooked = true
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP]
      }
    })
  })
}

function loadMainWindowContent(win: BrowserWindow): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadFile(getBundledShellPaths().rendererIndex)
  }
}

/** Пересоздать окно после GPU/рендер-крэша — reload() оставляет sandbox без startupData (пустой экран). */
async function recoverMainWindow(): Promise<void> {
  if (recoveringMainWindow || isAppQuitting()) return

  const now = Date.now()
  if (now - lastGpuRecoverMs < 8000) {
    gpuRecoverStreak++
  } else {
    gpuRecoverStreak = 1
  }
  lastGpuRecoverMs = now
  if (gpuRecoverStreak > 2) {
    console.warn('[window] восстановление окна пропущено — слишком частые GPU-сбои')
    return
  }

  recoveringMainWindow = true
  try {
    const stale = mainWindow
    mainWindow = null
    if (stale && !stale.isDestroyed()) stale.destroy()
    await createWindow()
  } finally {
    recoveringMainWindow = false
  }
}

async function createWindow(): Promise<void> {
  ensureSessionCsp()

  const icon = appIconPath()
  const windowState = await loadWindowState()
  const shell = getBundledShellPaths()
  mainWindow = new BrowserWindow({
    ...windowOptionsFromState(windowState),
    title: getAppWindowTitle(),
    backgroundColor: '#0d1117',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: resolve(shell.preloadScript),
      contextIsolation: true,
      nodeIntegration: false,
      // В CI (xvfb/macOS headless) sandbox ломает тяжёлый preload; в E2E отключаем.
      sandbox: process.env.CODEVIPER_E2E !== '1'
    }
  })

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show()
  })

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  trackWindowState(mainWindow)
  registerMainWindowForTitle(mainWindow)

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault()
    refreshAppWindowTitle()
  })

  mainWindow.on('closed', () => {
    registerMainWindowForTitle(null)
  })

  mainWindow.on('close', (event) => {
    if (mainWindow) handleMainWindowClose(event, minimizeToTrayEnabled, mainWindow)
  })

  createTray(() => mainWindow)

  // Пересоздание окна при падении рендерера (GPU crash, OOM и т.п.).
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit') void recoverMainWindow()
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

  mainWindow.webContents.on('context-menu', (_e, params) => {
    const menuItems: Electron.MenuItemConstructorOptions[] = []
    const selectionText = params.selectionText

    if (selectionText) {
      menuItems.push({ label: 'Копировать', role: 'copy' })
    }
    if (params.isEditable && selectionText) {
      menuItems.push({ label: 'Вырезать', role: 'cut' })
    }
    if (params.isEditable) {
      menuItems.push({ label: 'Вставить', role: 'paste' })
      menuItems.push({ type: 'separator' })
      menuItems.push({ label: 'Выбрать всё', role: 'selectAll' })
    }

    if (menuItems.length > 0) {
      Menu.buildFromTemplate(menuItems).popup({ window: mainWindow! })
    }
  })

  loadMainWindowContent(mainWindow)
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
  if (event.type === 'trace' && event.traceEvent) {
    void appendChatTraceEvent(chatId, event.traceEvent).then(async () => {
      trackTraceRunStart(chatId, event.traceEvent!)
      const run = agentRunStates.get(chatId)
      await maybeAutoReportAgentTraceOnRunEnd(chatId, event.traceEvent!, run?.projectPath, stream)
    })
  }
  mainWindow?.webContents.send('agent-stream', { chatId, ...event })
}

// На части систем Windows дисковый GPU-кэш недоступен (0x5 Access denied) → пустой/чёрный экран.
// Отключаем только дисковый кэш шейдеров/GPU — аппаратное ускорение сохраняется.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-gpu-cache')

if (!app.isPackaged) {
  app.commandLine.appendSwitch('disable-gpu-process-crash-limit')
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

function broadcastMcpHealthStatus(
  results: Awaited<ReturnType<typeof healthCheckMcpServers>>
): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(IPC.MCP_HEALTH_STATUS, { results })
}

function scheduleMcpHealthCheck(settings: AgentSettings): void {
  const servers = settings.mcpServers ?? []
  if (servers.length === 0 || process.env.CODEVIPER_E2E) return

  void healthCheckMcpServers(servers)
    .then((results) => {
      for (const result of results) {
        if (!result.ok) {
          console.warn(`[mcp-health] ${result.url}: ${result.error ?? 'недоступен'}`)
        }
      }
      broadcastMcpHealthStatus(results)
    })
    .catch((err) => {
      console.warn(
        '[mcp-health] проверка не удалась:',
        err instanceof Error ? err.message : String(err)
      )
    })
}

const ipcContext: IpcContext = {
  getWindow: () => mainWindow,
  stream,
  agentRunStates,
  activeAgentAborts,
  pendingConfirms,
  pendingClarifies,
  pendingPlanConfirms,
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
ensureLiveRuntimeExtras()

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

  await runBundledSourceStartupSync(settings.liveRuntimeFromGit ?? false)
  await initBundledRuntimeFromSettings(settings)
  if (isBundledRuntimeFromClone()) {
    void import('./runtimeUpdateState').then(async ({ recordRuntimeAppliedHead }) => {
      const { getRuntimeBuildHead } = await import('./bundledSourceBuild')
      const head = getRuntimeBuildHead()
      if (head) await recordRuntimeAppliedHead(head)
    })
  }
  initBundledShellPaths(settings.liveRuntimeFromGit !== false, {
    isPackaged: app.isPackaged,
    mainDir: getElectronMainDir()
  })

  if (settings.gitSyncOnStartup && !process.env.CODEVIPER_E2E) {
    pullCollectiveMemoryFromRemote(settings.collectiveMemoryBranch).catch(() => {})
    pullCollectiveSkillsFromRemote(settings.collectiveMemoryBranch).catch(() => {})
  }

  await createWindow()

  syncP2pWssConnection(settings)
  scheduleMcpHealthCheck(settings)

  void ensureDefaultSkills().catch((err) => {
    console.warn('[startup] ensureDefaultSkills:', err instanceof Error ? err.message : String(err))
  })

  if (!app.isPackaged && !process.env.CODEVIPER_E2E) {
    void installReactDevTools()
  }

  if (mainWindow) {
    startUpdateChecks(mainWindow.webContents)
    startRuntimeUpdateNotifier(mainWindow.webContents)
    startP2pWssStatusPush(mainWindow.webContents)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU') void recoverMainWindow()
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
