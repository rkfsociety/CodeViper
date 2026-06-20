import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentConfirmRequest,
  AgentSettings,
  AgentStreamEvent,
  AppState,
  ChatMessage,
  OllamaPullProgress,
  SavedChat
} from '../../src/types'
import { withTimeout } from '../../shared/withTimeout'

const IPC_TIMEOUT_MS = 30_000

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
    withTimeout(ipcRenderer.invoke('select-project-folder'), IPC_TIMEOUT_MS, 'selectProjectFolder'),

  selectFiles: (): Promise<{ path: string; size: number }[]> =>
    withTimeout(ipcRenderer.invoke('select-files'), IPC_TIMEOUT_MS, 'selectFiles'),

  readAttachment: (
    filePath: string
  ): Promise<{
    ok: boolean
    isImage?: boolean
    content?: string
    dataUrl?: string
    mime?: string
    error?: string
  }> =>
    withTimeout(ipcRenderer.invoke('read-attachment', filePath), IPC_TIMEOUT_MS, 'readAttachment'),

  readFile: (projectPath: string, filePath: string) =>
    withTimeout(ipcRenderer.invoke('read-file', projectPath, filePath), IPC_TIMEOUT_MS, 'readFile'),

  writeFile: (projectPath: string, filePath: string, content: string) =>
    withTimeout(
      ipcRenderer.invoke('write-file', projectPath, filePath, content),
      IPC_TIMEOUT_MS,
      'writeFile'
    ),

  listOllamaModels: (url?: string) =>
    withTimeout(ipcRenderer.invoke('list-ollama-models', url), IPC_TIMEOUT_MS, 'listOllamaModels'),

  listProviderModels: (config: { type: string; baseUrl?: string; apiKey?: string }) =>
    withTimeout(
      ipcRenderer.invoke('list-provider-models', config),
      IPC_TIMEOUT_MS,
      'listProviderModels'
    ),

  checkOllama: (url?: string) =>
    withTimeout(ipcRenderer.invoke('check-ollama', url), IPC_TIMEOUT_MS, 'checkOllama'),
  checkQdrant: (url: string, apiKey?: string) =>
    withTimeout(ipcRenderer.invoke('check-qdrant', url, apiKey), IPC_TIMEOUT_MS, 'checkQdrant'),

  // pullOllamaModel защищён 10-мин таймаутом в useOllamaDownloadQueue
  pullOllamaModel: (url: string, model: string) =>
    ipcRenderer.invoke('pull-ollama-model', url, model),

  deleteOllamaModel: (url: string, model: string) =>
    withTimeout(
      ipcRenderer.invoke('delete-ollama-model', url, model),
      IPC_TIMEOUT_MS,
      'deleteOllamaModel'
    ),

  onOllamaPullProgress: (callback: (progress: OllamaPullProgress) => void) => {
    const handler = (_: unknown, progress: OllamaPullProgress) => callback(progress)
    ipcRenderer.on('ollama-pull-progress', handler)
    return () => ipcRenderer.removeListener('ollama-pull-progress', handler)
  },

  // runAgent защищён 10-мин таймаутом в useMessageQueue
  runAgent: (
    settings: AgentSettings,
    projectPath: string,
    chatId: string,
    messages: ChatMessage[],
    userMessage: string
  ) => ipcRenderer.invoke('run-agent', settings, projectPath, chatId, messages, userMessage),

  getAgentRunState: () =>
    withTimeout(ipcRenderer.invoke('get-agent-run-state'), IPC_TIMEOUT_MS, 'getAgentRunState'),

  stopAgent: (chatId: string) =>
    withTimeout(ipcRenderer.invoke('stop-agent', chatId), IPC_TIMEOUT_MS, 'stopAgent'),

  previewAgentContext: (
    projectPath: string,
    messages: ChatMessage[],
    userMessage: string,
    model: string
  ) =>
    withTimeout(
      ipcRenderer.invoke('preview-agent-context', projectPath, messages, userMessage, model),
      IPC_TIMEOUT_MS,
      'previewAgentContext'
    ),

  summarizeContext: (messages: ChatMessage[], settings: AgentSettings) =>
    withTimeout(
      ipcRenderer.invoke('summarize-context', messages, settings),
      60_000,
      'summarizeContext'
    ),

  checkAgentPrerequisites: (ollamaUrl: string, projectPath: string, skipOllamaCheck = false) =>
    withTimeout(
      ipcRenderer.invoke('check-agent-prerequisites', ollamaUrl, projectPath, skipOllamaCheck),
      IPC_TIMEOUT_MS,
      'checkAgentPrerequisites'
    ),

  loadSettings: () =>
    withTimeout(ipcRenderer.invoke('load-settings'), IPC_TIMEOUT_MS, 'loadSettings'),

  saveSettings: (settings: AgentSettings) =>
    withTimeout(ipcRenderer.invoke('save-settings', settings), IPC_TIMEOUT_MS, 'saveSettings'),

  onAgentStream: (callback: (event: AgentStreamEvent) => void) => {
    ensureAgentStreamBridge()
    agentStreamListeners.add(callback)
    return () => {
      agentStreamListeners.delete(callback)
    }
  },

  runTerminalCommand: (cwd: string, command: string) =>
    withTimeout(
      ipcRenderer.invoke('run-terminal-command', cwd, command),
      IPC_TIMEOUT_MS,
      'runTerminalCommand'
    ),

  listMemories: (projectPath: string) =>
    withTimeout(ipcRenderer.invoke('list-memories', projectPath), IPC_TIMEOUT_MS, 'listMemories'),

  deleteMemory: (projectPath: string, id: string) =>
    withTimeout(
      ipcRenderer.invoke('delete-memory', projectPath, id),
      IPC_TIMEOUT_MS,
      'deleteMemory'
    ),

  listSkills: (projectPath: string) =>
    withTimeout(ipcRenderer.invoke('list-skills', projectPath), IPC_TIMEOUT_MS, 'listSkills'),

  deleteSkill: (projectPath: string, id: string) =>
    withTimeout(ipcRenderer.invoke('delete-skill', projectPath, id), IPC_TIMEOUT_MS, 'deleteSkill'),

  getChatStore: () =>
    withTimeout(ipcRenderer.invoke('get-chat-store'), IPC_TIMEOUT_MS, 'getChatStore'),

  createChat: (folderId?: string | null, mode?: 'chat' | 'code') =>
    withTimeout(
      ipcRenderer.invoke('create-chat', folderId ?? null, mode),
      IPC_TIMEOUT_MS,
      'createChat'
    ),

  updateChat: (
    id: string,
    patch: Partial<
      Pick<
        SavedChat,
        'title' | 'messages' | 'folderId' | 'projectPath' | 'pinned' | 'tags' | 'interruptedDraft'
      >
    >
  ) => withTimeout(ipcRenderer.invoke('update-chat', id, patch), IPC_TIMEOUT_MS, 'updateChat'),

  deleteChat: (id: string) =>
    withTimeout(ipcRenderer.invoke('delete-chat', id), IPC_TIMEOUT_MS, 'deleteChat'),

  createChatFolder: (name: string) =>
    withTimeout(ipcRenderer.invoke('create-chat-folder', name), IPC_TIMEOUT_MS, 'createChatFolder'),

  renameChatFolder: (id: string, name: string) =>
    withTimeout(
      ipcRenderer.invoke('rename-chat-folder', id, name),
      IPC_TIMEOUT_MS,
      'renameChatFolder'
    ),

  updateChatFolder: (id: string, patch: Partial<{ name: string; projectPath: string }>) =>
    withTimeout(
      ipcRenderer.invoke('update-chat-folder', id, patch),
      IPC_TIMEOUT_MS,
      'updateChatFolder'
    ),

  deleteChatFolder: (id: string) =>
    withTimeout(ipcRenderer.invoke('delete-chat-folder', id), IPC_TIMEOUT_MS, 'deleteChatFolder'),

  setActiveChat: (id: string | null) =>
    withTimeout(ipcRenderer.invoke('set-active-chat', id), IPC_TIMEOUT_MS, 'setActiveChat'),

  moveChatToFolder: (chatId: string, folderId: string | null) =>
    withTimeout(
      ipcRenderer.invoke('move-chat-to-folder', chatId, folderId),
      IPC_TIMEOUT_MS,
      'moveChatToFolder'
    ),

  exportChats: () =>
    withTimeout(ipcRenderer.invoke('export-chats'), IPC_TIMEOUT_MS * 3, 'exportChats'),

  importChats: (chats: unknown[]) =>
    withTimeout(ipcRenderer.invoke('import-chats', chats), IPC_TIMEOUT_MS * 3, 'importChats'),

  onAgentConfirm: (callback: (request: AgentConfirmRequest) => void) => {
    const handler = (_: unknown, request: AgentConfirmRequest) => callback(request)
    ipcRenderer.on('agent-confirm', handler)
    return () => ipcRenderer.removeListener('agent-confirm', handler)
  },

  respondAgentConfirm: (id: string, approved: boolean) =>
    ipcRenderer.send('agent-confirm-response', id, approved),

  respondAgentPreview: (id: string, apply: boolean) =>
    ipcRenderer.send('agent-preview-response', id, apply),

  shareAsGist: (token: string, projectPath: string, what: 'memory' | 'skills' | 'both') =>
    withTimeout(
      ipcRenderer.invoke('share-as-gist', token, projectPath, what),
      IPC_TIMEOUT_MS,
      'shareAsGist'
    ),

  onSystemStats: (cb: (stats: { cpu: number; gpu: number | null }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, stats: { cpu: number; gpu: number | null }) =>
      cb(stats)
    ipcRenderer.on('system-stats', handler)
    return () => ipcRenderer.removeListener('system-stats', handler)
  },

  onProgressEvent: (cb: (progress: { label: string; percent: number | null } | null) => void) => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      progress: { label: string; percent: number | null } | null
    ) => cb(progress)
    ipcRenderer.on('progress-event', handler)
    return () => ipcRenderer.removeListener('progress-event', handler)
  },

  listPullRequests: () =>
    withTimeout(ipcRenderer.invoke('list-pull-requests'), 30_000, 'listPullRequests'),

  createIssue: (title: string, body?: string, labels?: string) =>
    withTimeout(
      ipcRenderer.invoke('create-issue', title, body, labels),
      IPC_TIMEOUT_MS,
      'createIssue'
    ),

  createPr: (title?: string, body?: string) =>
    withTimeout(ipcRenderer.invoke('create-pr', title, body), IPC_TIMEOUT_MS, 'createPr'),

  listIssues: () => withTimeout(ipcRenderer.invoke('list-issues'), IPC_TIMEOUT_MS, 'listIssues'),

  openIssue: (number: string) =>
    withTimeout(ipcRenderer.invoke('open-issue', number), IPC_TIMEOUT_MS, 'openIssue'),

  triggerGithubWorkflow: (workflowId: string, ref?: string, fields?: string) =>
    withTimeout(
      ipcRenderer.invoke('trigger-github-workflow', workflowId, ref, fields),
      IPC_TIMEOUT_MS,
      'triggerGithubWorkflow'
    ),

  openExternal: (url: string) => ipcRenderer.send('open-external', url),

  showItemInFolder: (filePath: string) => ipcRenderer.send('show-item-in-folder', filePath),

  onUpdateAvailable: (cb: (info: { commits: number }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { commits: number }) => cb(info)
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },

  restartApp: () => ipcRenderer.send('restart-app'),

  logFrontendError: (message: string, stack?: string) =>
    ipcRenderer.send('log-frontend-error', message, stack),

  saveAppState: (state: AppState | null) => ipcRenderer.send('save-app-state', state),

  getCrashRecovery: (): Promise<AppState | null> =>
    withTimeout(ipcRenderer.invoke('get-crash-recovery'), IPC_TIMEOUT_MS, 'getCrashRecovery')
}

contextBridge.exposeInMainWorld('codeviper', codeviper)
