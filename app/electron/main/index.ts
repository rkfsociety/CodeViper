import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron'
import { existsSync } from 'fs'
import { appendFile, mkdir } from 'fs/promises'
import { join } from 'path'
import {
  AgentRunner,
  deleteOllamaModel,
  fetchOllamaModels,
  fetchOllamaModelsWithDetails,
  pingOllama,
  pullOllamaModel
} from './agent'
import { checkAgentPrerequisites } from './agentPrerequisites'
import { formatPrerequisitesMessage } from '../../shared/agentPrerequisites'
import { filterToolCallingModels } from '../../shared/recommendedModels'
import { buildAgentContextPreview, summarizeChatHistory } from './agentContext'
import { formatModelSwitchMessage, prepareOllamaModel, ModelRuntime } from './modelRuntime'
import {
  selectModelForTask,
  shouldUseAutoModel,
  resolveSummarizeModel
} from '../../shared/modelRouter'
import { safeReadFile, safeWriteFile, runCommand } from './services'
import { deleteMemory, listMemories } from './memory'
import { deleteSkill, listSkills } from './skills'
import { ensureDefaultSkills } from './defaultSkills'
import {
  createChat,
  createFolder,
  deleteChat,
  deleteFolder,
  exportChats,
  getChatStore,
  importChats,
  moveChatToFolder,
  renameFolder,
  updateFolder,
  setActiveChat,
  updateChat
} from './chats'
import { loadSettings, saveSettings } from './settings'
import { buildVectorStoreConfig } from './vectorStore'
import { createGist, formatMemoriesAsMarkdown, formatSkillsAsMarkdown } from './gist'
import { makeId } from '../../shared/makeId'
import { loadWindowState, trackWindowState, windowOptionsFromState } from './windowState'
import { readAppState, writeAppState, clearAppState } from './appState'
import { startSystemStatsPush, stopSystemStatsPush, getSystemCapabilities } from './systemStats'
import { enrichModelCapabilities } from './modelSelection'
import { setProgressTarget, clearProgress } from './progress'
import { listPullRequests } from './githubPr'
import { createIssue, createPr, listIssues, openIssue, triggerGithubWorkflow } from './githubTools'
import { startUpdateChecks } from './updateChecker'
import type {
  AgentSettings,
  AgentStreamEvent,
  AgentStreamPayload,
  AppState,
  ChatMessage,
  SavedChat
} from '../../src/types'

let mainWindow: BrowserWindow | null = null
const agentRunStates = new Map<string, { chatId: string }>()
const activeAgentAborts = new Map<string, AbortController>()
const pendingConfirms = new Map<string, (approved: boolean) => void>()
const pendingPreviews = new Map<string, (apply: boolean) => void>()

// Батчинг IPC: token/thinking события накапливаем и шлём не чаще раз в 50 мс.
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
  // Удаляем записи старше часа.
  const cutoff = now - HOUR_MS
  while (runTimestamps.length > 0 && runTimestamps[0] < cutoff) runTimestamps.shift()
}

function appIconPath(): string | undefined {
  const candidates = [
    join(__dirname, '../../resources/icon.png'),
    join(process.cwd(), 'resources/icon.png')
  ]
  return candidates.find((path) => existsSync(path))
}

const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http: https: ws: wss:; font-src 'self' data:; worker-src 'self' blob:;"

async function createWindow(): Promise<void> {
  // Устанавливаем CSP через заголовок ответа (перекрывает заголовки Vite dev-сервера)
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

  if (windowState.isMaximized) {
    mainWindow.maximize()
  }

  trackWindowState(mainWindow)

  // Автоперезагрузка при падении рендерера (GPU crash, OOM и т.п.).
  // appState уже сохранён на диске → CrashRecoveryDialog восстановит сессию.
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload()
    }
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
  const payload: AgentStreamEvent = { chatId, ...event }
  mainWindow?.webContents.send('agent-stream', payload)
}

// Флаги устойчивости GPU: снижают вероятность краша при смене DPI/монитора.
// --disable-gpu-process-crash-limit: не отключать GPU после серии крашей (дефолт — 3 краша/мин).
// --in-process-gpu: GPU работает в процессе рендерера; нет отдельного процесса, которому не с чего упасть.
app.commandLine.appendSwitch('disable-gpu-process-crash-limit')
app.commandLine.appendSwitch('in-process-gpu')

app.whenReady().then(async () => {
  // Устанавливаем React DevTools для отладки дерева компонентов
  try {
    const { default: installExtension, REACT_DEVELOPER_TOOLS } =
      await import('electron-devtools-installer')
    await installExtension(REACT_DEVELOPER_TOOLS, {
      loadExtensionOptions: { allowFileAccess: true }
    })
  } catch {
    // DevTools недоступны (нет сети или уже установлены) — не критично
  }

  await ensureDefaultSkills()
  await createWindow()

  if (mainWindow) startUpdateChecks(mainWindow.webContents)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

// Если рендерер упал (краш GPU → renderer reload), перезагружаем страницу.
// appState сохраняется каждые 30 с — после reload CrashRecoveryDialog восстановит сессию.
app.on('child-process-gone', (_event, details) => {
  if (details.type === 'GPU' && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reload()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// При нормальном завершении удаляем файл состояния — при следующем запуске
// его отсутствие означает штатный выход (не краш).
app.on('before-quit', () => {
  clearAppState().catch(() => {})
})

// Рендерер сохраняет состояние каждые 30 с; fire-and-forget.
ipcMain.on('save-app-state', (_e, state: AppState | null) => {
  if (!state) {
    clearAppState().catch(() => {})
  } else {
    writeAppState(state).catch(() => {})
  }
})

// Рендерер при старте проверяет наличие краш-файла.
// После прочтения удаляем — чтобы следующий запуск был чистым.
ipcMain.handle('get-crash-recovery', async () => {
  const state = await readAppState()
  if (state) await clearAppState()
  return state
})

ipcMain.on('log-frontend-error', (_e, message: string, stack?: string) => {
  const logsDir = join(app.getPath('userData'), 'logs')
  const date = new Date().toISOString().slice(0, 10)
  const filePath = join(logsDir, `frontend-${date}.ndjson`)
  const line = JSON.stringify({ ts: new Date().toISOString(), message, stack }) + '\n'
  mkdir(logsDir, { recursive: true })
    .then(() => appendFile(filePath, line, 'utf8'))
    .catch(() => {})
})

ipcMain.handle('select-project-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
})

ipcMain.handle('select-files', async () => {
  const { stat } = await import('fs/promises')
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections']
  })
  if (result.canceled) return []
  return Promise.all(
    result.filePaths.map(async (p) => {
      const info = await stat(p)
      return { path: p, size: info.size }
    })
  )
})

const ATTACHMENT_SIZE_LIMIT = 200 * 1024 // 200 КБ

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml'
}

ipcMain.handle('read-attachment', async (_e, filePath: string) => {
  const { stat, readFile } = await import('fs/promises')
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const isImage = IMAGE_EXTENSIONS.has(ext)

  const info = await stat(filePath)
  if (info.size > ATTACHMENT_SIZE_LIMIT) {
    return {
      ok: false,
      error: `Файл слишком большой (${(info.size / 1024).toFixed(0)} КБ, лимит 200 КБ)`
    }
  }

  if (isImage) {
    const buf = await readFile(filePath)
    const mime = IMAGE_MIME[ext] ?? 'image/png'
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
    return { ok: true, isImage: true, dataUrl, mime }
  }

  const content = await readFile(filePath, 'utf-8')
  return { ok: true, isImage: false, content }
})

ipcMain.handle('read-file', async (_e, projectPath: string, filePath: string) =>
  safeReadFile(projectPath, filePath)
)

ipcMain.handle('write-file', async (_e, projectPath: string, filePath: string, content: string) =>
  safeWriteFile(projectPath, filePath, content)
)

ipcMain.handle('check-ollama', async (_e, url = 'http://127.0.0.1:11434') => pingOllama(url))

ipcMain.handle('check-qdrant', async (_e, url: string, apiKey?: string) => {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['api-key'] = apiKey
    const res = await fetch(`${url.replace(/\/$/, '')}/collections`, {
      headers,
      signal: AbortSignal.timeout(5000)
    })
    return res.ok
  } catch {
    return false
  }
})

ipcMain.handle('check-milvus', async (_e, url: string, apiKey?: string) => {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const res = await fetch(`${url.replace(/\/$/, '')}/v2/vectordb/collections/list`, {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(5000)
    })
    return res.ok
  } catch {
    return false
  }
})

ipcMain.handle('list-ollama-models', async (_e, url = 'http://127.0.0.1:11434') => {
  const models = await fetchOllamaModelsWithDetails(url)
  const systemCaps = await getSystemCapabilities()
  // Обогащаем модели информацией о совместимости
  return enrichModelCapabilities(models, systemCaps)
})

ipcMain.handle(
  'list-provider-models',
  async (_e, config: { type: string; baseUrl?: string; apiKey?: string }) => {
    const runtime = new ModelRuntime(config)
    return runtime.listModels()
  }
)

ipcMain.handle('pull-ollama-model', async (_e, url: string, model: string) => {
  await pullOllamaModel(url, model, (progress) => {
    mainWindow?.webContents.send('ollama-pull-progress', progress)
  })
})

ipcMain.handle('delete-ollama-model', async (_e, url: string, model: string) => {
  await deleteOllamaModel(url, model)
})

ipcMain.handle(
  'check-agent-prerequisites',
  async (_e, ollamaUrl: string, projectPath: string, skipOllamaCheck = false) =>
    checkAgentPrerequisites(ollamaUrl, projectPath, skipOllamaCheck)
)

ipcMain.handle('run-terminal-command', async (_e, cwd: string, command: string) =>
  runCommand(cwd, command)
)

ipcMain.handle('list-memories', async (_e, projectPath: string) => listMemories(projectPath))

ipcMain.handle('delete-memory', async (_e, projectPath: string, id: string) =>
  deleteMemory(projectPath, id)
)

ipcMain.handle('list-skills', async (_e, projectPath: string) => listSkills(projectPath))

ipcMain.handle('delete-skill', async (_e, projectPath: string, id: string) =>
  deleteSkill(projectPath, id)
)

ipcMain.handle(
  'share-as-gist',
  async (_e, token: string, projectPath: string, what: 'memory' | 'skills' | 'both') => {
    const files: Record<string, string> = {}
    const parts: string[] = []

    if (what === 'memory' || what === 'both') {
      const entries = await listMemories(projectPath)
      files['codeviper-memory.md'] = formatMemoriesAsMarkdown(entries)
      parts.push('память')
    }
    if (what === 'skills' || what === 'both') {
      const skills = await listSkills(projectPath)
      files['codeviper-skills.md'] = formatSkillsAsMarkdown(skills)
      parts.push('навыки')
    }

    const description = `CodeViper: ${parts.join(' + ')}`
    return createGist(token, files, description)
  }
)

ipcMain.handle('get-chat-store', async () => getChatStore())

ipcMain.handle('create-chat', async (_e, folderId?: string | null, mode?: 'chat' | 'code') =>
  createChat(folderId ?? null, mode)
)

ipcMain.handle(
  'update-chat',
  async (
    _e,
    id: string,
    patch: Partial<
      Pick<SavedChat, 'title' | 'messages' | 'folderId' | 'projectPath' | 'pinned' | 'tags'>
    >
  ) => {
    // Получаем параметры для RAG индексирования из settings
    const settings = await loadSettings()
    const ollamaUrl = settings.ollamaUrl || 'http://127.0.0.1:11434'
    const projectPath = patch.projectPath || ''

    return updateChat(
      id,
      patch,
      projectPath && ollamaUrl
        ? {
            ollamaUrl,
            storeConfig: buildVectorStoreConfig(settings, projectPath)
          }
        : undefined
    )
  }
)

ipcMain.handle('delete-chat', async (_e, id: string, projectPath?: string) => {
  const settings = await loadSettings()
  return deleteChat(id, projectPath, buildVectorStoreConfig(settings, projectPath))
})

ipcMain.handle('create-chat-folder', async (_e, name: string) => createFolder(name))

ipcMain.handle('rename-chat-folder', async (_e, id: string, name: string) => renameFolder(id, name))

ipcMain.handle(
  'update-chat-folder',
  async (_e, id: string, patch: Partial<{ name: string; projectPath: string }>) =>
    updateFolder(id, patch)
)

ipcMain.handle('delete-chat-folder', async (_e, id: string) => deleteFolder(id))

ipcMain.handle('set-active-chat', async (_e, id: string | null) => setActiveChat(id))

ipcMain.handle('move-chat-to-folder', async (_e, chatId: string, folderId: string | null) =>
  moveChatToFolder(chatId, folderId)
)

ipcMain.handle('export-chats', async () => exportChats())

ipcMain.handle('import-chats', async (_e, chats: SavedChat[]) => importChats(chats))

ipcMain.handle('get-agent-run-state', async () => Array.from(agentRunStates.keys()))

ipcMain.handle('stop-agent', async (_e, chatId: string) => {
  const abort = activeAgentAborts.get(chatId)
  if (!abort) return false
  abort.abort()
  return true
})

ipcMain.on('agent-confirm-response', (_e, id: string, approved: boolean) => {
  const resolve = pendingConfirms.get(id)
  if (resolve) {
    pendingConfirms.delete(id)
    resolve(approved)
  }
})

ipcMain.on('agent-preview-response', (_e, id: string, apply: boolean) => {
  const resolve = pendingPreviews.get(id)
  if (resolve) {
    pendingPreviews.delete(id)
    resolve(apply)
  }
})

function makePreviewFn(signal: AbortSignal): (previewId: string) => Promise<boolean> {
  return (previewId) =>
    new Promise<boolean>((resolve) => {
      const settle = (apply: boolean) => {
        pendingPreviews.delete(previewId)
        resolve(apply)
      }
      pendingPreviews.set(previewId, settle)
      // previewId доставляется через stream-событие 'preview' — отдельный IPC не нужен.
      signal.addEventListener('abort', () => settle(false), { once: true })
    })
}

function makeConfirmFn(
  signal: AbortSignal
): (toolName: string, toolInput: string) => Promise<boolean> {
  return (toolName, toolInput) =>
    new Promise<boolean>((resolve) => {
      const id = makeId()
      const settle = (approved: boolean) => {
        pendingConfirms.delete(id)
        resolve(approved)
      }
      pendingConfirms.set(id, settle)
      // Прерывание агента во время ожидания = отказ (инструмент не выполняется).
      signal.addEventListener('abort', () => settle(false), { once: true })
      mainWindow?.webContents.send('agent-confirm', { id, toolName, toolInput })
    })
}

ipcMain.handle(
  'preview-agent-context',
  async (_e, projectPath: string, history: ChatMessage[], userMessage: string, model: string) =>
    buildAgentContextPreview(projectPath, history, userMessage, model)
)

ipcMain.handle(
  'summarize-context',
  async (_e, chatMessages: ChatMessage[], settings: AgentSettings) =>
    summarizeChatHistory(chatMessages, settings)
)

ipcMain.handle('list-pull-requests', async () => listPullRequests())

ipcMain.handle('create-issue', async (_e, title: string, body?: string, labels?: string) =>
  createIssue(title, body, labels)
)

ipcMain.handle('create-pr', async (_e, title?: string, body?: string) => createPr(title, body))

ipcMain.handle('list-issues', async () => listIssues())

ipcMain.handle('open-issue', async (_e, number: string) => openIssue(number))

ipcMain.handle(
  'trigger-github-workflow',
  async (_e, workflowId: string, ref?: string, fields?: string) =>
    triggerGithubWorkflow(workflowId, ref, fields)
)

ipcMain.on('open-devtools', () => {
  mainWindow?.webContents.openDevTools({ mode: 'detach' })
})

ipcMain.on('restart-app', () => {
  // Перезапуск: лаунчер start-dev.ps1 при старте подтянет origin и пересоберёт.
  app.relaunch()
  app.exit(0)
})

ipcMain.on('open-external', (_e, url: string) => {
  // Открываем только http(s)-ссылки во внешнем браузере.
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    void shell.openExternal(url)
  }
})

ipcMain.on('show-item-in-folder', (_e, filePath: string) => {
  if (typeof filePath === 'string' && filePath.trim()) {
    shell.showItemInFolder(filePath)
  }
})

ipcMain.handle('load-settings', async () => loadSettings())

ipcMain.handle('save-settings', async (_e, settings: AgentSettings) => saveSettings(settings))

ipcMain.handle(
  'run-agent',
  async (
    _e,
    settings: AgentSettings,
    projectPath: string,
    chatId: string,
    history: ChatMessage[],
    userMessage: string
  ) => {
    if (agentRunStates.has(chatId)) {
      throw new Error('Агент уже выполняет задачу в этом чате. Дождитесь завершения.')
    }

    recordRun()

    const abortCtrl = new AbortController()
    agentRunStates.set(chatId, { chatId })
    activeAgentAborts.set(chatId, abortCtrl)
    if (!settings.disableSystemStats) startSystemStatsPush(_e.sender)
    setProgressTarget(_e.sender)

    const skipOllama = (settings.modelProvider ?? 'ollama') !== 'ollama'
    const prerequisites = await checkAgentPrerequisites(settings.ollamaUrl, projectPath, skipOllama)
    if (!prerequisites.ok) {
      stream(chatId, {
        type: 'error',
        content: formatPrerequisitesMessage(prerequisites.issues)
      })
      stream(chatId, { type: 'done' })
      return
    }

    let effectiveSettings = settings

    try {
      const isCloudProvider = (settings.modelProvider ?? 'ollama') !== 'ollama'

      let installed: Awaited<ReturnType<typeof fetchOllamaModels>> = []
      if (!isCloudProvider) {
        installed = await fetchOllamaModels(settings.ollamaUrl)
        const toolInstalled = filterToolCallingModels(installed)
        const useAuto = shouldUseAutoModel(settings.autoModel, toolInstalled.length)

        if (useAuto) {
          const selection = selectModelForTask(userMessage, toolInstalled, settings.model)
          if (selection) {
            const { unloaded } = await prepareOllamaModel(settings.ollamaUrl, selection.model)
            effectiveSettings = { ...settings, model: selection.model }
            stream(chatId, {
              type: 'model_selected',
              selectedModel: selection.model,
              modelReason: selection.reason,
              content: formatModelSwitchMessage(selection.model, selection.reason, unloaded)
            })
          } else if (!settings.model.trim() && toolInstalled[0]) {
            effectiveSettings = { ...settings, model: toolInstalled[0].name }
          }
        } else if (!effectiveSettings.model.trim() && toolInstalled[0]) {
          effectiveSettings = { ...settings, model: toolInstalled[0].name }
        }
      }

      if (!effectiveSettings.model.trim()) {
        throw new Error('Модель не выбрана. Скачайте модель в настройках или включите Ollama.')
      }

      const summarizeModel = resolveSummarizeModel(
        installed,
        effectiveSettings.model,
        settings.summarizeModel
      )

      const runner = new AgentRunner(
        effectiveSettings,
        projectPath,
        (event) => stream(chatId, event),
        abortCtrl.signal,
        makeConfirmFn(abortCtrl.signal),
        summarizeModel,
        makePreviewFn(abortCtrl.signal),
        chatId
      )

      await runner.run(history, userMessage)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        stream(chatId, {
          type: 'error',
          content: error instanceof Error ? error.message : String(error)
        })
        stream(chatId, { type: 'done' })
      }
    } finally {
      stopSystemStatsPush()
      clearProgress()
      setProgressTarget(null)
      activeAgentAborts.delete(chatId)
      agentRunStates.delete(chatId)
    }
  }
)
