import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { AgentRunner, deleteOllamaModel, fetchOllamaModels, pingOllama, pullOllamaModel } from './agent'
import { filterToolCallingModels } from '../../shared/recommendedModels'
import { buildAgentContextPreview } from './agentContext'
import { formatModelSwitchMessage, prepareOllamaModel } from './ollamaRuntime'
import { selectModelForTask, shouldUseAutoModel } from '../../shared/modelRouter'
import { buildFileTree, safeReadFile, safeWriteFile, runCommand } from './services'
import { deleteMemory, listMemories } from './memory'
import { deleteSkill, listSkills } from './skills'
import { ensureDefaultSkills } from './defaultSkills'
import {
  createChat,
  createFolder,
  deleteChat,
  deleteFolder,
  getChatStore,
  moveChatToFolder,
  renameFolder,
  setActiveChat,
  updateChat
} from './chats'
import { loadSettings, saveSettings } from './settings'
import {
  loadWindowState,
  trackWindowState,
  windowOptionsFromState
} from './windowState'
import type {
  AgentSettings,
  AgentStreamEvent,
  AgentStreamPayload,
  ChatMessage,
  SavedChat
} from '../../src/types'

let mainWindow: BrowserWindow | null = null
let agentRunState: { chatId: string } | null = null
let activeAgentAbort: AbortController | null = null

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
      sandbox: false
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('select-project-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0] ?? null
})

ipcMain.handle('list-directory', async (_e, dirPath: string) => buildFileTree(dirPath))

ipcMain.handle('read-file', async (_e, projectPath: string, filePath: string) =>
  safeReadFile(projectPath, filePath)
)

ipcMain.handle('write-file', async (_e, projectPath: string, filePath: string, content: string) =>
  safeWriteFile(projectPath, filePath, content)
)

ipcMain.handle('check-ollama', async (_e, url = 'http://127.0.0.1:11434') =>
  pingOllama(url)
)

ipcMain.handle('list-ollama-models', async (_e, url = 'http://127.0.0.1:11434') =>
  fetchOllamaModels(url)
)

ipcMain.handle('pull-ollama-model', async (_e, url: string, model: string) => {
  await pullOllamaModel(url, model, (progress) => {
    mainWindow?.webContents.send('ollama-pull-progress', progress)
  })
})

ipcMain.handle('delete-ollama-model', async (_e, url: string, model: string) => {
  await deleteOllamaModel(url, model)
})

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

ipcMain.handle('get-chat-store', async () => getChatStore())

ipcMain.handle('create-chat', async (_e, folderId?: string | null) =>
  createChat(folderId ?? null)
)

ipcMain.handle(
  'update-chat',
  async (
    _e,
    id: string,
    patch: Partial<Pick<SavedChat, 'title' | 'messages' | 'folderId' | 'projectPath'>>
  ) => updateChat(id, patch)
)

ipcMain.handle('delete-chat', async (_e, id: string) => deleteChat(id))

ipcMain.handle('create-chat-folder', async (_e, name: string) => createFolder(name))

ipcMain.handle('rename-chat-folder', async (_e, id: string, name: string) => renameFolder(id, name))

ipcMain.handle('delete-chat-folder', async (_e, id: string) => deleteFolder(id))

ipcMain.handle('set-active-chat', async (_e, id: string | null) => setActiveChat(id))

ipcMain.handle('move-chat-to-folder', async (_e, chatId: string, folderId: string | null) =>
  moveChatToFolder(chatId, folderId)
)

ipcMain.handle('get-agent-run-state', async () => agentRunState)

ipcMain.handle('stop-agent', async () => {
  if (!activeAgentAbort) return false
  activeAgentAbort.abort()
  return true
})

ipcMain.handle(
  'preview-agent-context',
  async (
    _e,
    projectPath: string,
    history: ChatMessage[],
    userMessage: string,
    model: string
  ) => buildAgentContextPreview(projectPath, history, userMessage, model)
)

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

    agentRunState = { chatId }
    activeAgentAbort = new AbortController()

    let effectiveSettings = settings

    try {
      const installed = await fetchOllamaModels(settings.ollamaUrl)
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

      if (!effectiveSettings.model.trim()) {
        throw new Error('Модель не выбрана. Скачайте модель в настройках или включите Ollama.')
      }

      const runner = new AgentRunner(
        effectiveSettings,
        projectPath,
        (event) => stream(chatId, event),
        activeAgentAbort.signal
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
      activeAgentAbort = null
      agentRunState = null
    }
  }
)
