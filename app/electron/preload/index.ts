import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentSettings,
  AgentStreamEvent,
  ChatMessage,
  OllamaPullProgress,
  SavedChat
} from '../../src/types'

const agentStreamListeners = new Set<(event: AgentStreamEvent) => void>()
let agentStreamBridgeReady = false

function ensureAgentStreamBridge(): void {
  if (agentStreamBridgeReady) return
  ipcRenderer.on('agent-stream', (_event, payload: AgentStreamEvent) => {
    for (const listener of agentStreamListeners) {
      listener(payload)
    }
  })
  agentStreamBridgeReady = true
}

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

  runAgent: (
    settings: AgentSettings,
    projectPath: string,
    chatId: string,
    messages: ChatMessage[],
    userMessage: string
  ) => ipcRenderer.invoke('run-agent', settings, projectPath, chatId, messages, userMessage),

  getAgentRunState: () => ipcRenderer.invoke('get-agent-run-state'),

  stopAgent: () => ipcRenderer.invoke('stop-agent'),

  loadSettings: () => ipcRenderer.invoke('load-settings'),

  saveSettings: (settings: AgentSettings) => ipcRenderer.invoke('save-settings', settings),

  onAgentStream: (callback: (event: AgentStreamEvent) => void) => {
    ensureAgentStreamBridge()
    agentStreamListeners.add(callback)
    return () => {
      agentStreamListeners.delete(callback)
    }
  },

  runTerminalCommand: (cwd: string, command: string) =>
    ipcRenderer.invoke('run-terminal-command', cwd, command),

  listMemories: (projectPath: string) => ipcRenderer.invoke('list-memories', projectPath),

  deleteMemory: (projectPath: string, id: string) =>
    ipcRenderer.invoke('delete-memory', projectPath, id),

  listSkills: (projectPath: string) => ipcRenderer.invoke('list-skills', projectPath),

  deleteSkill: (projectPath: string, id: string) =>
    ipcRenderer.invoke('delete-skill', projectPath, id),

  getChatStore: () => ipcRenderer.invoke('get-chat-store'),

  createChat: (folderId?: string | null) =>
    ipcRenderer.invoke('create-chat', folderId ?? null),

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
