import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { existsSync } from 'fs'
import { appendFile, mkdir } from 'fs/promises'
import { join } from 'path'
import {
  AgentRunner,
  deleteOllamaModel,
  fetchOllamaModels,
  pingOllama,
  pullOllamaModel
} from './agent'
import { checkAgentPrerequisites } from './agentPrerequisites'
import { formatPrerequisitesMessage } from '../../shared/agentPrerequisites'
import { filterToolCallingModels } from '../../shared/recommendedModels'
import { buildAgentContextPreview } from './agentContext'
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
import { createGist, formatMemoriesAsMarkdown, formatSkillsAsMarkdown } from './gist'
import { makeId } from '../../shared/makeId'
import { loadWindowState, trackWindowState, windowOptionsFromState } from './windowState'
import { readAppState, writeAppState, clearAppState } from './appState'
import { startSystemStatsPush, stopSystemStatsPush } from './systemStats'
import { setProgressTarget, clearProgress } from './progress'
import { listPullRequests } from './githubPr'
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
let agentRunState: { chatId: string } | null = null
let activeAgentAbort: AbortController | null = null
const pendingConfirms = new Map<string, (approved: boolean) => void>()

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

function runsInLastHour(): number {
  const cutoff = Date.now() - HOUR_MS
  return runTimestamps.filter((t) => t >= cutoff).length
}

function appIconPath(): string | undefined {
  const candidates = [
    join(__dirname, '../../resources/icon.png'),
    join(process.cwd(), 'resources/icon.png')
  ]
  return candidates.find((path) => existsSync(path))
}

async function createWindow(): Promise<void> {
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

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function stream(chatId: string, event: AgentStreamPayload): void {
  const payload: AgentStreamEvent = { chatId, ...event }
  mainWindow?.webContents.send('agent-stream', payload)
}

app.whenReady().then(async () => {
  await ensureDefaultSkills()
  await createWindow()

  if (mainWindow) startUpdateChecks(mainWindow.webContents)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
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

ipcMain.handle('read-file', async (_e, projectPath: string, filePath: string) =>
  safeReadFile(projectPath, filePath)
)

ipcMain.handle('write-file', async (_e, projectPath: string, filePath: string, content: string) =>
  safeWriteFile(projectPath, filePath, content)
)

ipcMain.handle('check-ollama', async (_e, url = 'http://127.0.0.1:11434') => pingOllama(url))

ipcMain.handle('list-ollama-models', async (_e, url = 'http://127.0.0.1:11434') =>
  fetchOllamaModels(url)
)

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

ipcMain.handle('create-chat', async (_e, folderId?: string | null) => createChat(folderId ?? null))

ipcMain.handle(
  'update-chat',
  async (
    _e,
    id: string,
    patch: Partial<
      Pick<SavedChat, 'title' | 'messages' | 'folderId' | 'projectPath' | 'pinned' | 'tags'>
    >
  ) => updateChat(id, patch)
)

ipcMain.handle('delete-chat', async (_e, id: string) => deleteChat(id))

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

ipcMain.handle('get-agent-run-state', async () => agentRunState)

ipcMain.handle('stop-agent', async () => {
  if (!activeAgentAbort) return false
  activeAgentAbort.abort()
  return true
})

ipcMain.on('agent-confirm-response', (_e, id: string, approved: boolean) => {
  const resolve = pendingConfirms.get(id)
  if (resolve) {
    pendingConfirms.delete(id)
    resolve(approved)
  }
})

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

ipcMain.handle('list-pull-requests', async () => listPullRequests())

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
    if (agentRunState) {
      throw new Error('Агент уже выполняет задачу. Дождитесь завершения текущего запроса.')
    }

    const maxRuns = settings.maxRunsPerHour ?? 20
    const currentRuns = runsInLastHour()
    if (currentRuns >= maxRuns) {
      stream(chatId, {
        type: 'error',
        content: `Достигнут лимит прогонов агента: ${maxRuns} за последний час (сейчас: ${currentRuns}). Подождите или увеличьте лимит в настройках.`
      })
      stream(chatId, { type: 'done' })
      return
    }
    recordRun()

    agentRunState = { chatId }
    activeAgentAbort = new AbortController()
    startSystemStatsPush(_e.sender)
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
        activeAgentAbort.signal,
        makeConfirmFn(activeAgentAbort.signal),
        summarizeModel
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
      activeAgentAbort = null
      agentRunState = null
    }
  }
)
