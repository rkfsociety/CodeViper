import { contextBridge, ipcRenderer } from 'electron'
import type {
  AgentConfirmRequest,
  AgentClarifyRequest,
  AgentSettings,
  AgentStreamEvent,
  AppState,
  ChatMessage,
  OllamaPullProgress,
  SavedChat
} from '../../src/types'
import { withTimeout } from '../../shared/withTimeout'
import { IPC } from '../../shared/ipcContracts'

const IPC_TIMEOUT_MS = 30_000

const agentStreamListeners = new Set<(event: AgentStreamEvent) => void>()
let agentStreamBridgeReady = false

function ensureAgentStreamBridge(): void {
  if (agentStreamBridgeReady) return
  ipcRenderer.on(IPC.AGENT_STREAM, (_event, payload: AgentStreamEvent) => {
    for (const listener of agentStreamListeners) {
      listener(payload)
    }
  })
  agentStreamBridgeReady = true
}

const codeviper = {
  isE2e: process.env.CODEVIPER_E2E === '1',

  selectProjectFolder: (): Promise<string | null> =>
    withTimeout(
      ipcRenderer.invoke(IPC.SELECT_PROJECT_FOLDER),
      IPC_TIMEOUT_MS,
      'selectProjectFolder'
    ),

  selectFolder: (): Promise<string | null> =>
    withTimeout(ipcRenderer.invoke(IPC.SELECT_PROJECT_FOLDER), IPC_TIMEOUT_MS, 'selectFolder'),

  selectFiles: (): Promise<{ path: string; size: number }[]> =>
    withTimeout(ipcRenderer.invoke(IPC.SELECT_FILES), IPC_TIMEOUT_MS, 'selectFiles'),

  selectGgufFile: (): Promise<string | null> =>
    withTimeout(ipcRenderer.invoke(IPC.SELECT_GGUF_FILE), IPC_TIMEOUT_MS, 'selectGgufFile'),

  downloadGguf: (): Promise<string> =>
    withTimeout(ipcRenderer.invoke(IPC.DOWNLOAD_GGUF), 60 * 60 * 1000, 'downloadGguf'),

  cancelGgufDownload: (): void => {
    ipcRenderer.send(IPC.CANCEL_GGUF_DOWNLOAD)
  },

  deleteGgufFile: (filePath: string): Promise<void> =>
    withTimeout(
      ipcRenderer.invoke(IPC.DELETE_GGUF_FILE, filePath),
      IPC_TIMEOUT_MS,
      'deleteGgufFile'
    ),

  onGgufDownloadProgress: (
    cb: (progress: { downloaded: number; total: number } | null) => void
  ) => {
    const handler = (_: unknown, p: { downloaded: number; total: number } | null) => cb(p)
    ipcRenderer.on(IPC.GGUF_DOWNLOAD_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.GGUF_DOWNLOAD_PROGRESS, handler)
  },

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
    withTimeout(
      ipcRenderer.invoke(IPC.READ_ATTACHMENT, filePath),
      IPC_TIMEOUT_MS,
      'readAttachment'
    ),

  readFile: (projectPath: string, filePath: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.READ_FILE, projectPath, filePath),
      IPC_TIMEOUT_MS,
      'readFile'
    ),

  writeFile: (projectPath: string, filePath: string, content: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.WRITE_FILE, projectPath, filePath, content),
      IPC_TIMEOUT_MS,
      'writeFile'
    ),

  listOllamaModels: (url?: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.LIST_OLLAMA_MODELS, url),
      IPC_TIMEOUT_MS,
      'listOllamaModels'
    ),

  listProviderModels: (config: { type: string; baseUrl?: string; apiKey?: string }) =>
    withTimeout(
      ipcRenderer.invoke(IPC.LIST_PROVIDER_MODELS, config),
      IPC_TIMEOUT_MS,
      'listProviderModels'
    ),

  checkOllama: (url?: string) =>
    withTimeout(ipcRenderer.invoke(IPC.CHECK_OLLAMA, url), IPC_TIMEOUT_MS, 'checkOllama'),
  checkQdrant: (url: string, apiKey?: string) =>
    withTimeout(ipcRenderer.invoke(IPC.CHECK_QDRANT, url, apiKey), IPC_TIMEOUT_MS, 'checkQdrant'),
  checkMilvus: (url: string, apiKey?: string) =>
    withTimeout(ipcRenderer.invoke(IPC.CHECK_MILVUS, url, apiKey), IPC_TIMEOUT_MS, 'checkMilvus'),

  // pullOllamaModel защищён 10-мин таймаутом в useOllamaDownloadQueue
  pullOllamaModel: (url: string, model: string) =>
    ipcRenderer.invoke(IPC.PULL_OLLAMA_MODEL, url, model),

  deleteOllamaModel: (url: string, model: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.DELETE_OLLAMA_MODEL, url, model),
      IPC_TIMEOUT_MS,
      'deleteOllamaModel'
    ),

  onOllamaPullProgress: (callback: (progress: OllamaPullProgress) => void) => {
    const handler = (_: unknown, progress: OllamaPullProgress) => callback(progress)
    ipcRenderer.on(IPC.OLLAMA_PULL_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.OLLAMA_PULL_PROGRESS, handler)
  },

  // runAgent защищён 10-мин таймаутом в useMessageQueue
  runAgent: (
    settings: AgentSettings,
    projectPath: string,
    chatId: string,
    messages: ChatMessage[],
    userMessage: string,
    incognito?: boolean,
    userImages?: { name: string; dataUrl: string }[]
  ) =>
    ipcRenderer.invoke(
      IPC.RUN_AGENT,
      settings,
      projectPath,
      chatId,
      messages,
      userMessage,
      incognito,
      userImages
    ),

  getAgentRunState: () =>
    withTimeout(ipcRenderer.invoke(IPC.GET_AGENT_RUN_STATE), IPC_TIMEOUT_MS, 'getAgentRunState'),

  stopAgent: (chatId: string) =>
    withTimeout(ipcRenderer.invoke(IPC.STOP_AGENT, chatId), IPC_TIMEOUT_MS, 'stopAgent'),

  getRunCheckpoint: (chatId: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.GET_RUN_CHECKPOINT, chatId),
      IPC_TIMEOUT_MS,
      'getRunCheckpoint'
    ),

  rollbackRun: (chatId: string) =>
    withTimeout(ipcRenderer.invoke(IPC.ROLLBACK_RUN, chatId), IPC_TIMEOUT_MS, 'rollbackRun'),

  getProjectTree: (projectPath: string, maxDepth?: number) =>
    withTimeout(
      ipcRenderer.invoke(IPC.GET_PROJECT_TREE, projectPath, maxDepth),
      IPC_TIMEOUT_MS,
      'getProjectTree'
    ),

  showAgentDoneNotification: (payload: { title: string; body: string }) =>
    withTimeout(
      ipcRenderer.invoke(IPC.SHOW_AGENT_DONE_NOTIFICATION, payload),
      IPC_TIMEOUT_MS,
      'showAgentDoneNotification'
    ),

  previewAgentContext: (
    projectPath: string,
    messages: ChatMessage[],
    userMessage: string,
    model: string
  ) =>
    withTimeout(
      ipcRenderer.invoke(IPC.PREVIEW_AGENT_CONTEXT, projectPath, messages, userMessage, model),
      IPC_TIMEOUT_MS,
      'previewAgentContext'
    ),

  summarizeContext: (messages: ChatMessage[], settings: AgentSettings) =>
    withTimeout(
      ipcRenderer.invoke(IPC.SUMMARIZE_CONTEXT, messages, settings),
      60_000,
      'summarizeContext'
    ),

  checkAgentPrerequisites: (ollamaUrl: string, projectPath: string, skipOllamaCheck = false) =>
    withTimeout(
      ipcRenderer.invoke(IPC.CHECK_AGENT_PREREQUISITES, ollamaUrl, projectPath, skipOllamaCheck),
      IPC_TIMEOUT_MS,
      'checkAgentPrerequisites'
    ),

  loadSettings: () =>
    withTimeout(ipcRenderer.invoke(IPC.LOAD_SETTINGS), IPC_TIMEOUT_MS, 'loadSettings'),

  saveSettings: (settings: AgentSettings) =>
    withTimeout(ipcRenderer.invoke(IPC.SAVE_SETTINGS, settings), IPC_TIMEOUT_MS, 'saveSettings'),

  addMcpServer: (settings: AgentSettings, serverUrl: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.ADD_MCP_SERVER, settings, serverUrl),
      IPC_TIMEOUT_MS,
      'addMcpServer'
    ),

  removeMcpServer: (settings: AgentSettings, serverUrl: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.REMOVE_MCP_SERVER, settings, serverUrl),
      IPC_TIMEOUT_MS,
      'removeMcpServer'
    ),

  onAgentStream: (callback: (event: AgentStreamEvent) => void) => {
    ensureAgentStreamBridge()
    agentStreamListeners.add(callback)
    return () => {
      agentStreamListeners.delete(callback)
    }
  },

  runTerminalCommand: (cwd: string, command: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.RUN_TERMINAL_COMMAND, cwd, command),
      IPC_TIMEOUT_MS,
      'runTerminalCommand'
    ),

  listMemories: (projectPath: string) =>
    withTimeout(ipcRenderer.invoke(IPC.LIST_MEMORIES, projectPath), IPC_TIMEOUT_MS, 'listMemories'),

  deleteMemory: (projectPath: string, id: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.DELETE_MEMORY, projectPath, id),
      IPC_TIMEOUT_MS,
      'deleteMemory'
    ),

  voteMemory: (entryId: string, delta: 1 | -1) =>
    withTimeout(ipcRenderer.invoke(IPC.VOTE_MEMORY, entryId, delta), IPC_TIMEOUT_MS, 'voteMemory'),

  listSkills: (projectPath: string) =>
    withTimeout(ipcRenderer.invoke(IPC.LIST_SKILLS, projectPath), IPC_TIMEOUT_MS, 'listSkills'),

  createSkill: (
    projectPath: string,
    input: { name: string; description: string; instructions: string; triggers?: string[] }
  ) =>
    withTimeout(
      ipcRenderer.invoke(IPC.CREATE_SKILL, projectPath, input),
      IPC_TIMEOUT_MS,
      'createSkill'
    ),

  deleteSkill: (projectPath: string, id: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.DELETE_SKILL, projectPath, id),
      IPC_TIMEOUT_MS,
      'deleteSkill'
    ),

  getChatStore: () =>
    withTimeout(ipcRenderer.invoke(IPC.GET_CHAT_STORE), IPC_TIMEOUT_MS, 'getChatStore'),

  createChat: (folderId?: string | null, mode?: 'chat' | 'code') =>
    withTimeout(
      ipcRenderer.invoke(IPC.CREATE_CHAT, folderId ?? null, mode),
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
  ) => withTimeout(ipcRenderer.invoke(IPC.UPDATE_CHAT, id, patch), IPC_TIMEOUT_MS, 'updateChat'),

  deleteChat: (id: string) =>
    withTimeout(ipcRenderer.invoke(IPC.DELETE_CHAT, id), IPC_TIMEOUT_MS, 'deleteChat'),

  createChatFolder: (name: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.CREATE_CHAT_FOLDER, name),
      IPC_TIMEOUT_MS,
      'createChatFolder'
    ),

  renameChatFolder: (id: string, name: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.RENAME_CHAT_FOLDER, id, name),
      IPC_TIMEOUT_MS,
      'renameChatFolder'
    ),

  updateChatFolder: (id: string, patch: Partial<{ name: string; projectPath: string }>) =>
    withTimeout(
      ipcRenderer.invoke(IPC.UPDATE_CHAT_FOLDER, id, patch),
      IPC_TIMEOUT_MS,
      'updateChatFolder'
    ),

  deleteChatFolder: (id: string) =>
    withTimeout(ipcRenderer.invoke(IPC.DELETE_CHAT_FOLDER, id), IPC_TIMEOUT_MS, 'deleteChatFolder'),

  setActiveChat: (id: string | null) =>
    withTimeout(ipcRenderer.invoke(IPC.SET_ACTIVE_CHAT, id), IPC_TIMEOUT_MS, 'setActiveChat'),

  moveChatToFolder: (chatId: string, folderId: string | null) =>
    withTimeout(
      ipcRenderer.invoke(IPC.MOVE_CHAT_TO_FOLDER, chatId, folderId),
      IPC_TIMEOUT_MS,
      'moveChatToFolder'
    ),

  exportChats: () =>
    withTimeout(ipcRenderer.invoke(IPC.EXPORT_CHATS), IPC_TIMEOUT_MS * 3, 'exportChats'),

  importChats: (chats: unknown[]) =>
    withTimeout(ipcRenderer.invoke(IPC.IMPORT_CHATS, chats), IPC_TIMEOUT_MS * 3, 'importChats'),

  exportTrace: (projectPath: string, chatId: string, events: unknown[]) =>
    withTimeout(
      ipcRenderer.invoke(IPC.EXPORT_TRACE, projectPath, chatId, events),
      IPC_TIMEOUT_MS,
      'exportTrace'
    ),

  onAgentConfirm: (callback: (request: AgentConfirmRequest) => void) => {
    const handler = (_: unknown, request: AgentConfirmRequest) => callback(request)
    ipcRenderer.on(IPC.AGENT_CONFIRM, handler)
    return () => ipcRenderer.removeListener(IPC.AGENT_CONFIRM, handler)
  },

  respondAgentConfirm: (id: string, approved: boolean) =>
    ipcRenderer.send(IPC.AGENT_CONFIRM_RESPONSE, id, approved),

  onAgentClarify: (callback: (request: AgentClarifyRequest) => void) => {
    const handler = (_: unknown, request: AgentClarifyRequest) => callback(request)
    ipcRenderer.on(IPC.AGENT_CLARIFY, handler)
    return () => ipcRenderer.removeListener(IPC.AGENT_CLARIFY, handler)
  },

  respondAgentClarify: (id: string, answer: string | null) =>
    ipcRenderer.send(IPC.AGENT_CLARIFY_RESPONSE, id, answer),

  respondAgentPreview: (id: string, apply: boolean) =>
    ipcRenderer.send(IPC.AGENT_PREVIEW_RESPONSE, id, apply),

  respondAgentPreviewHunkSelection: (id: string, selectedIndices: number[]) =>
    ipcRenderer.send(IPC.AGENT_PREVIEW_HUNK_SELECTION, id, selectedIndices),

  shareAsGist: (token: string, projectPath: string, what: 'memory' | 'skills' | 'both') =>
    withTimeout(
      ipcRenderer.invoke(IPC.SHARE_AS_GIST, token, projectPath, what),
      IPC_TIMEOUT_MS,
      'shareAsGist'
    ),

  onSystemStats: (cb: (stats: { cpu: number; gpu: number | null }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, stats: { cpu: number; gpu: number | null }) =>
      cb(stats)
    ipcRenderer.on(IPC.SYSTEM_STATS, handler)
    return () => ipcRenderer.removeListener(IPC.SYSTEM_STATS, handler)
  },

  onProgressEvent: (cb: (progress: { label: string; percent: number | null } | null) => void) => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      progress: { label: string; percent: number | null } | null
    ) => cb(progress)
    ipcRenderer.on(IPC.PROGRESS_EVENT, handler)
    return () => ipcRenderer.removeListener(IPC.PROGRESS_EVENT, handler)
  },

  listPullRequests: () =>
    withTimeout(ipcRenderer.invoke(IPC.LIST_PULL_REQUESTS), 30_000, 'listPullRequests'),

  createIssue: (title: string, body?: string, labels?: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.CREATE_ISSUE, title, body, labels),
      IPC_TIMEOUT_MS,
      'createIssue'
    ),

  createPr: (title?: string, body?: string) =>
    withTimeout(ipcRenderer.invoke(IPC.CREATE_PR, title, body), IPC_TIMEOUT_MS, 'createPr'),

  listIssues: () => withTimeout(ipcRenderer.invoke(IPC.LIST_ISSUES), IPC_TIMEOUT_MS, 'listIssues'),

  openIssue: (number: string) =>
    withTimeout(ipcRenderer.invoke(IPC.OPEN_ISSUE, number), IPC_TIMEOUT_MS, 'openIssue'),

  triggerGithubWorkflow: (workflowId: string, ref?: string, fields?: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.TRIGGER_GITHUB_WORKFLOW, workflowId, ref, fields),
      IPC_TIMEOUT_MS,
      'triggerGithubWorkflow'
    ),

  readFileHistory: (projectPath: string, filePath: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.READ_FILE_HISTORY, projectPath, filePath),
      IPC_TIMEOUT_MS,
      'readFileHistory'
    ),

  openExternal: (url: string) => ipcRenderer.send(IPC.OPEN_EXTERNAL, url),

  showItemInFolder: (filePath: string) => ipcRenderer.send(IPC.SHOW_ITEM_IN_FOLDER, filePath),

  getCollectiveSyncStatus: () =>
    withTimeout(
      ipcRenderer.invoke(IPC.GET_COLLECTIVE_SYNC_STATUS),
      IPC_TIMEOUT_MS,
      'getCollectiveSyncStatus'
    ) as Promise<{ branch: string; pendingCount: number }>,

  flushCollectiveMemory: (summary: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.FLUSH_COLLECTIVE_MEMORY, summary),
      30_000,
      'flushCollectiveMemory'
    ) as Promise<{ ok: boolean; message: string; branch?: string; syncedCount: number }>,

  onUpdateAvailable: (cb: (info: import('../../shared/updateInfo').UpdateInfo) => void) => {
    const handler = (
      _e: Electron.IpcRendererEvent,
      info: import('../../shared/updateInfo').UpdateInfo
    ) => cb(info)
    ipcRenderer.on(IPC.UPDATE_AVAILABLE, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_AVAILABLE, handler)
  },

  restartApp: () => ipcRenderer.send(IPC.RESTART_APP),
  installUpdate: () => ipcRenderer.send(IPC.INSTALL_UPDATE),

  openDevTools: () => ipcRenderer.send(IPC.OPEN_DEVTOOLS),

  logFrontendError: (message: string, stack?: string) =>
    ipcRenderer.send(IPC.LOG_FRONTEND_ERROR, message, stack),

  saveAppState: (state: AppState | null) => ipcRenderer.send(IPC.SAVE_APP_STATE, state),

  getCrashRecovery: (): Promise<AppState | null> =>
    withTimeout(ipcRenderer.invoke(IPC.GET_CRASH_RECOVERY), IPC_TIMEOUT_MS, 'getCrashRecovery'),

  benchmarkModel: (ollamaUrl: string, model: string) =>
    withTimeout(
      ipcRenderer.invoke(IPC.BENCHMARK_MODEL, ollamaUrl, model),
      120_000,
      'benchmarkModel'
    ),

  listRoadmapItems: () =>
    withTimeout(ipcRenderer.invoke(IPC.LIST_ROADMAP_ITEMS), IPC_TIMEOUT_MS, 'listRoadmapItems'),

  autoIndexProject: (
    projectPath: string,
    ollamaUrl: string,
    qdrantUrl: string,
    qdrantApiKey?: string
  ) =>
    withTimeout(
      ipcRenderer.invoke(IPC.AUTO_INDEX_PROJECT, projectPath, ollamaUrl, qdrantUrl, qdrantApiKey),
      10_000,
      'autoIndexProject'
    ),

  registerP2pNode: (settings: import('../../src/types').AgentSettings) =>
    withTimeout(ipcRenderer.invoke(IPC.REGISTER_P2P_NODE, settings), 15_000, 'registerP2pNode'),
  getP2pCredits: (settings: import('../../src/types').AgentSettings) =>
    withTimeout(ipcRenderer.invoke(IPC.GET_P2P_CREDITS, settings), 10_000, 'getP2pCredits'),

  getAgentMetrics: (days?: number) =>
    withTimeout(ipcRenderer.invoke(IPC.GET_AGENT_METRICS, days), IPC_TIMEOUT_MS, 'getAgentMetrics')
}

contextBridge.exposeInMainWorld('codeviper', codeviper)
