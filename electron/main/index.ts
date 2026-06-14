import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { AgentRunner, fetchOllamaModels, pingOllama, pullOllamaModel } from './agent'
import { buildFileTree, safeReadFile, safeWriteFile, runCommand } from './services'
import { deleteMemory, listMemories } from './memory'
import { getRebuildStatus, runRebuild } from './rebuild'
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
import type { AgentSettings, AgentStreamEvent, ChatMessage, SavedChat } from '../../src/types'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'CodeViper',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function stream(event: AgentStreamEvent): void {
  mainWindow?.webContents.send('agent-stream', event)
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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

ipcMain.handle('run-terminal-command', async (_e, cwd: string, command: string) =>
  runCommand(cwd, command)
)

ipcMain.handle('list-memories', async (_e, projectPath: string) => listMemories(projectPath))

ipcMain.handle('delete-memory', async (_e, projectPath: string, id: string) =>
  deleteMemory(projectPath, id)
)

ipcMain.handle('get-rebuild-status', async () => getRebuildStatus())

ipcMain.handle('rebuild-app', async () =>
  runRebuild((event) => {
    mainWindow?.webContents.send('rebuild-progress', event)
  })
)

ipcMain.handle('get-chat-store', async () => getChatStore())

ipcMain.handle('create-chat', async (_e, projectPath: string, folderId?: string | null) =>
  createChat(projectPath, folderId ?? null)
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

ipcMain.handle(
  'run-agent',
  async (_e, settings: AgentSettings, history: ChatMessage[], userMessage: string) => {
    const runner = new AgentRunner(settings, stream)
    try {
      await runner.run(history, userMessage)
    } catch (error) {
      stream({
        type: 'error',
        content: error instanceof Error ? error.message : String(error)
      })
      stream({ type: 'done' })
    }
  }
)
