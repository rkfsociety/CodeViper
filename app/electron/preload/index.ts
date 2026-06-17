import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentConfirmRequest,
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

  readFile: (projectPath: string, filePath: string) =>
    ipcRenderer.invoke('read-file', projectPath, filePath),

  writeFile: (projectPath: string, filePath: string, content: string) =>
    ipcRenderer.invoke('write-file', projectPath, filePath, content),

  listOllamaModels: (url?: string) => ipcRenderer.invoke('list-ollama-models', url),

  checkOllama: (url?: string) => ipcRenderer.invoke('check-ollama', url),

  pullOllamaModel: (url: string, model: string) =>
    ipcRenderer.invoke('pull-ollama-model', url, model),

  deleteOllamaModel: (url: string, model: string) =>
    ipcRenderer.invoke('delete-ollama-model', url, model),

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

  previewAgentContext: (
    projectPath: string,
    messages: ChatMessage[],
    userMessage: string,
    model: string
  ) => ipcRenderer.invoke('preview-agent-context', projectPath, messages, userMessage, model),

  checkAgentPrerequisites: (ollamaUrl: string, projectPath: string) =>
    ipcRenderer.invoke('check-agent-prerequisites', ollamaUrl, projectPath),

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
    patch: Partial<Pick<SavedChat, 'title' | 'messages' | 'folderId' | 'projectPath' | 'pinned' | 'tags'>>
  ) => ipcRenderer.invoke('update-chat', id, patch),

  deleteChat: (id: string) => ipcRenderer.invoke('delete-chat', id),

  createChatFolder: (name: string) => ipcRenderer.invoke('create-chat-folder', name),

  renameChatFolder: (id: string, name: string) =>
    ipcRenderer.invoke('rename-chat-folder', id, name),

  updateChatFolder: (id: string, patch: Partial<{ name: string; projectPath: string }>) =>
    ipcRenderer.invoke('update-chat-folder', id, patch),

  deleteChatFolder: (id: string) => ipcRenderer.invoke('delete-chat-folder', id),

  setActiveChat: (id: string | null) => ipcRenderer.invoke('set-active-chat', id),

  moveChatToFolder: (chatId: string, folderId: string | null) =>
    ipcRenderer.invoke('move-chat-to-folder', chatId, folderId),

  onAgentConfirm: (callback: (request: AgentConfirmRequest) => void) => {
    const handler = (_: unknown, request: AgentConfirmRequest) => callback(request)
    ipcRenderer.on('agent-confirm', handler)
    return () => ipcRenderer.removeListener('agent-confirm', handler)
  },

  respondAgentConfirm: (id: string, approved: boolean) =>
    ipcRenderer.send('agent-confirm-response', id, approved)
}

contextBridge.exposeInMainWorld('codeviper', codeviper)
