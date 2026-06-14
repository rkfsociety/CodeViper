import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentSettings,
  AgentStreamEvent,
  ChatMessage,
  OllamaPullProgress,
  RebuildProgressEvent,
  SavedChat
} from '../../src/types'

const codeviper = {
  selectProjectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('select-project-folder'),

  listDirectory: (dirPath: string) => ipcRenderer.invoke('list-directory', dirPath),

  readFile: (projectPath: string, filePath: string) =>
    ipcRenderer.invoke('read-file', projectPath, filePath),

  writeFile: (projectPath: string, filePath: string, content: string) =>
    ipcRenderer.invoke('write-file', projectPath, filePath, content),

  listOllamaModels: (url?: string) => ipcRenderer.invoke('list-ollama-models', url),

  checkOllama: (url?: string) => ipcRenderer.invoke('check-ollama', url),

  pullOllamaModel: (url: string, model: string) =>
    ipcRenderer.invoke('pull-ollama-model', url, model),

  onOllamaPullProgress: (callback: (progress: OllamaPullProgress) => void) => {
    const handler = (_: unknown, progress: OllamaPullProgress) => callback(progress)
    ipcRenderer.on('ollama-pull-progress', handler)
    return () => ipcRenderer.removeListener('ollama-pull-progress', handler)
  },

  runAgent: (settings: AgentSettings, messages: ChatMessage[], userMessage: string) =>
    ipcRenderer.invoke('run-agent', settings, messages, userMessage),

  onAgentStream: (callback: (event: AgentStreamEvent) => void) => {
    const handler = (_: unknown, event: AgentStreamEvent) => callback(event)
    ipcRenderer.on('agent-stream', handler)
    return () => ipcRenderer.removeListener('agent-stream', handler)
  },

  runTerminalCommand: (cwd: string, command: string) =>
    ipcRenderer.invoke('run-terminal-command', cwd, command),

  listMemories: (projectPath: string) => ipcRenderer.invoke('list-memories', projectPath),

  deleteMemory: (projectPath: string, id: string) =>
    ipcRenderer.invoke('delete-memory', projectPath, id),

  getRebuildStatus: () => ipcRenderer.invoke('get-rebuild-status'),

  rebuildApp: () => ipcRenderer.invoke('rebuild-app'),

  onRebuildProgress: (callback: (event: RebuildProgressEvent) => void) => {
    const handler = (_: unknown, event: RebuildProgressEvent) => callback(event)
    ipcRenderer.on('rebuild-progress', handler)
    return () => ipcRenderer.removeListener('rebuild-progress', handler)
  },

  getChatStore: () => ipcRenderer.invoke('get-chat-store'),

  createChat: (projectPath: string, folderId?: string | null) =>
    ipcRenderer.invoke('create-chat', projectPath, folderId ?? null),

  updateChat: (
    id: string,
    patch: Partial<Pick<SavedChat, 'title' | 'messages' | 'folderId' | 'projectPath'>>
  ) => ipcRenderer.invoke('update-chat', id, patch),

  deleteChat: (id: string) => ipcRenderer.invoke('delete-chat', id),

  createChatFolder: (name: string) => ipcRenderer.invoke('create-chat-folder', name),

  renameChatFolder: (id: string, name: string) =>
    ipcRenderer.invoke('rename-chat-folder', id, name),

  deleteChatFolder: (id: string) => ipcRenderer.invoke('delete-chat-folder', id),

  setActiveChat: (id: string | null) => ipcRenderer.invoke('set-active-chat', id),

  moveChatToFolder: (chatId: string, folderId: string | null) =>
    ipcRenderer.invoke('move-chat-to-folder', chatId, folderId)
}

contextBridge.exposeInMainWorld('codeviper', codeviper)
