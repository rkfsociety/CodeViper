/**
 * IPC Contracts — Zod-схемы и константы имён для всех IPC-каналов.
 *
 * Использование в main (ipcMain.handle):
 *   import { IPC, parseIpcArgs, Contracts } from '../../shared/ipcContracts'
 *   ipcMain.handle(IPC.WRITE_FILE, async (_e, ...a) => {
 *     const [projectPath, filePath, content] = parseIpcArgs(Contracts[IPC.WRITE_FILE].args, a)
 *     ...
 *   })
 *
 * Использование в preload (ipcRenderer.invoke):
 *   import { IPC } from '../../shared/ipcContracts'
 *   ipcRenderer.invoke(IPC.LOAD_SETTINGS)
 */
import { z } from 'zod'
import { UpdateInfoSchema } from './updateInfo'

// ─── Примитивные схемы ────────────────────────────────────────────────────

export const AgentRoleSchema = z.enum(['user', 'assistant', 'tool', 'system'])
export const PermissionModeSchema = z.enum(['ask', 'acceptEdits', 'bypass'])
export const GitSyncStrategySchema = z.enum(['stash', 'rebase', 'ff-only'])
export const ModelProviderSchema = z.enum([
  'ollama',
  'deepseek',
  'openai',
  'openrouter',
  'gemini',
  'anthropic',
  'groq',
  'together'
])
export const MemoryCategorySchema = z.enum(['pattern', 'mistake', 'preference', 'project', 'skill'])
export const MemoryScopeSchema = z.enum(['global', 'project'])
export const CiStatusSchema = z.enum(['success', 'failure', 'pending', 'none'])

// ─── Схемы данных ─────────────────────────────────────────────────────────

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: AgentRoleSchema,
  content: z.string(),
  toolName: z.string().optional(),
  toolOutput: z.string().optional(),
  thinking: z.string().optional(),
  timestamp: z.number(),
  durationMs: z.number().optional(),
  previewId: z.string().optional(),
  previewPath: z.string().optional(),
  previewDiff: z.string().optional(),
  previewStatus: z.enum(['pending', 'applied', 'cancelled']).optional(),
  images: z.array(z.object({ name: z.string(), dataUrl: z.string() })).optional()
})

export const InterruptedDraftSchema = z.object({
  partial: z.string(),
  userMessage: z.string(),
  reason: z.enum(['timeout', 'error']),
  timestamp: z.number()
})

export const ChatFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  projectPath: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const SavedChatSchema = z.object({
  id: z.string(),
  title: z.string(),
  folderId: z.string().nullable(),
  projectPath: z.string(),
  messages: z.array(ChatMessageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  interruptedDraft: InterruptedDraftSchema.nullable().optional(),
  mode: z.enum(['chat', 'code']).optional()
})

export const ChatStoreSchema = z.object({
  version: z.literal(2),
  folders: z.array(ChatFolderSchema),
  chats: z.array(SavedChatSchema),
  activeChatId: z.string().nullable()
})

export const ImportResultSchema = z.object({
  added: z.number(),
  skipped: z.number()
})

export const AgentTraceEventSchema = z.object({
  ts: z.number(),
  kind: z.enum(['run_start', 'llm_request', 'llm_response', 'tool_call', 'tool_result', 'run_end']),
  label: z.string(),
  data: z.record(z.string(), z.unknown())
})

export const FileNodeSchema: z.ZodType<{
  name: string
  path: string
  isDirectory: boolean
  children?: Array<{
    name: string
    path: string
    isDirectory: boolean
    children?: unknown[]
  }>
}> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(),
    isDirectory: z.boolean(),
    children: z.array(FileNodeSchema).optional()
  })
)

export const OllamaModelSchema = z.object({
  name: z.string(),
  size: z.number(),
  modifiedAt: z.string(),
  sizeGB: z.number().optional(),
  contextLength: z.number().optional(),
  parameterSize: z.string().optional(),
  isSupported: z.boolean().optional(),
  supportsTools: z.boolean().optional(),
  reason: z.string().optional(),
  recommendedFor: z.string().optional()
})

export const OllamaPullProgressSchema = z.object({
  status: z.string(),
  digest: z.string().optional(),
  total: z.number().optional(),
  completed: z.number().optional()
})

const McpHealthResultSchema = z.object({
  url: z.string(),
  ok: z.boolean(),
  error: z.string().optional()
})

export const AgentSettingsSchema = z.object({
  ollamaUrl: z.string(),
  model: z.string(),
  selfLearning: z.boolean().optional(),
  autoModel: z.boolean().optional(),
  permissionMode: PermissionModeSchema.optional(),
  clarifyMode: z.boolean().optional(),
  deepReasoning: z.boolean().optional(),
  autoPushSelfEdits: z.boolean().optional(),
  selfImproveBranch: z.string().optional(),
  syncCollectiveMemory: z.boolean().optional(),
  summarizeModel: z.string().optional(),
  modelProvider: ModelProviderSchema.optional(),
  providerApiKey: z.string().optional(),
  deepseekApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  openrouterApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  geminiRpm: z.number().optional(),
  geminiTier: z.enum(['free', 'paid']).optional(),
  openrouterTier: z.enum(['free', 'paid']).optional(),
  claudeApiKey: z.string().optional(),
  groqApiKey: z.string().optional(),
  togetherApiKey: z.string().optional(),
  commandTimeoutSec: z.number().optional(),
  commandBlocklist: z.array(z.string()).optional(),
  readonlyMode: z.boolean().optional(),
  soundNotifications: z.boolean().optional(),
  minimizeToTray: z.boolean().optional(),
  gitSyncOnStartup: z.boolean().optional(),
  gitSyncStrategy: GitSyncStrategySchema.optional(),
  liveRuntimeFromGit: z.boolean().optional(),
  githubToken: z.string().optional(),
  excludeThinkingFromHistory: z.boolean().optional(),
  modelContextLength: z.number().optional(),
  contextSummarizeThreshold: z.number().optional(),
  aggressiveCompression: z.boolean().optional(),
  powerSaveMode: z.boolean().optional(),
  disableSystemStats: z.boolean().optional(),
  ollamaNumGpu: z.number().optional(),
  prManualRefresh: z.boolean().optional(),
  cloudEnabled: z.boolean().optional(),
  cloudProvider: z.enum(['deepseek', 'openai', 'openrouter', 'gemini']).optional(),
  cloudBaseUrl: z.string().optional(),
  cloudModel: z.string().optional(),
  qdrantUrl: z.string().optional(),
  qdrantApiKey: z.string().optional(),
  milvusUrl: z.string().optional(),
  milvusApiKey: z.string().optional(),
  ragProvider: z.enum(['local', 'qdrant', 'milvus']).optional(),
  chatMode: z.boolean().optional(),
  customSystemPrompt: z.string().optional(),
  gitlabToken: z.string().optional(),
  gitlabUrl: z.string().optional(),
  disabledTools: z.array(z.string()).optional(),
  mcpServers: z
    .array(
      z.object({
        url: z.string(),
        tools: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
            parameters: z.record(z.string(), z.unknown())
          })
        )
      })
    )
    .optional(),
  orchestratorModelPath: z.string().optional(),
  orchestratorBackend: z.enum(['gguf', 'ollama']).optional(),
  orchestratorOllamaModel: z.string().optional(),
  orchestratorEnabled: z.boolean().optional(),
  orchestratorMinMessageLength: z.number().optional(),
  autoCollectivePr: z.boolean().optional()
})

export const MemoryEntrySchema = z.object({
  id: z.string(),
  content: z.string(),
  category: MemoryCategorySchema,
  tags: z.array(z.string()),
  scope: MemoryScopeSchema,
  source: z.string().optional(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
  useCount: z.number(),
  score: z.number().optional()
})

export const AgentSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  triggers: z.array(z.string()),
  scope: MemoryScopeSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  useCount: z.number()
})

export const AppStateSchema = z.object({
  activeChatId: z.string(),
  projectPath: z.string(),
  pendingMessages: z.array(z.object({ id: z.string(), text: z.string() })),
  crashedAt: z.string()
})

export const TerminalResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().nullable()
})

export const SystemStatsSchema = z.object({
  cpu: z.number(),
  gpu: z.number().nullable()
})

export const ProgressInfoSchema = z.object({
  label: z.string(),
  percent: z.number().nullable()
})

export const PullRequestInfoSchema = z.object({
  number: z.number(),
  title: z.string(),
  headRefName: z.string(),
  url: z.string(),
  isDraft: z.boolean(),
  ciStatus: CiStatusSchema
})

export const PullRequestListResultSchema = z.object({
  ok: z.boolean(),
  prs: z.array(PullRequestInfoSchema).optional(),
  error: z.string().optional()
})

export const AgentConfirmRequestSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  toolInput: z.string()
})

export const AgentPreviewRequestSchema = z.object({
  id: z.string(),
  path: z.string(),
  diff: z.string()
})

export const AgentContextSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  content: z.string(),
  charCount: z.number()
})

export const AgentContextMessagePreviewSchema = z.object({
  role: AgentRoleSchema,
  label: z.string(),
  content: z.string(),
  charCount: z.number()
})

export const AdaptiveLimitsSchema = z.object({
  maxToolMessageChars: z.number(),
  maxHistoryMessages: z.number()
})

export const AgentContextPreviewSchema = z.object({
  model: z.string(),
  generatedAt: z.string(),
  totalChars: z.number(),
  estimatedTokens: z.number(),
  contextUsagePercent: z.number(),
  contextLimitTokens: z.number(),
  historyTruncated: z.boolean(),
  historySummarized: z.boolean(),
  droppedMessageCount: z.number(),
  toolCount: z.number(),
  sections: z.array(AgentContextSectionSchema),
  messages: z.array(AgentContextMessagePreviewSchema),
  adaptiveLimits: AdaptiveLimitsSchema.optional()
})

export { UpdateInfoSchema }

export const ReadAttachmentResultSchema = z.object({
  ok: z.boolean(),
  isImage: z.boolean().optional(),
  content: z.string().optional(),
  dataUrl: z.string().optional(),
  mime: z.string().optional(),
  error: z.string().optional()
})

export const ListProviderModelsConfigSchema = z.object({
  type: z.string(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional()
})

export const ProviderModelSchema = z.object({
  name: z.string(),
  size: z.number().optional(),
  contextLength: z.number().optional()
})

export const SummarizeContextResultSchema = z.object({
  droppedChatIds: z.array(z.string()),
  summary: z.string().nullable(),
  summarized: z.boolean(),
  truncated: z.boolean()
})

export const BenchmarkRunSchema = z.object({
  latencyMs: z.number(),
  tokens: z.number(),
  tps: z.number()
})

export const BenchmarkResultSchema = z.object({
  model: z.string(),
  runs: z.array(BenchmarkRunSchema),
  avgLatencyMs: z.number(),
  avgTps: z.number(),
  toolCallOk: z.boolean(),
  error: z.string().optional()
})

const RoadmapItemSchema = z.object({
  num: z.number().int(),
  size: z.enum(['S', 'M', 'L', 'XL']),
  title: z.string(),
  priority: z.string(),
  chain: z.string()
})

// ─── Имена IPC-каналов ────────────────────────────────────────────────────

/**
 * Константы всех IPC-каналов. Используй вместо строковых литералов везде —
 * в ipcMain.handle, ipcRenderer.invoke, webContents.send и on().
 */
export const IPC = {
  // ── Handle-каналы (request/response) ─────────────────────────────────
  GET_CRASH_RECOVERY: 'get-crash-recovery',
  SELECT_PROJECT_FOLDER: 'select-project-folder',
  SELECT_FILES: 'select-files',
  READ_ATTACHMENT: 'read-attachment',
  READ_FILE: 'read-file',
  WRITE_FILE: 'write-file',
  CHECK_OLLAMA: 'check-ollama',
  CHECK_QDRANT: 'check-qdrant',
  CHECK_MILVUS: 'check-milvus',
  LIST_OLLAMA_MODELS: 'list-ollama-models',
  LIST_PROVIDER_MODELS: 'list-provider-models',
  PULL_OLLAMA_MODEL: 'pull-ollama-model',
  DELETE_OLLAMA_MODEL: 'delete-ollama-model',
  CHECK_AGENT_PREREQUISITES: 'check-agent-prerequisites',
  RUN_TERMINAL_COMMAND: 'run-terminal-command',
  LIST_MEMORIES: 'list-memories',
  DELETE_MEMORY: 'delete-memory',
  LIST_SKILLS: 'list-skills',
  CREATE_SKILL: 'create-skill',
  DELETE_SKILL: 'delete-skill',
  SHARE_AS_GIST: 'share-as-gist',
  GET_CHAT_STORE: 'get-chat-store',
  CREATE_CHAT: 'create-chat',
  UPDATE_CHAT: 'update-chat',
  DELETE_CHAT: 'delete-chat',
  CREATE_CHAT_FOLDER: 'create-chat-folder',
  RENAME_CHAT_FOLDER: 'rename-chat-folder',
  UPDATE_CHAT_FOLDER: 'update-chat-folder',
  DELETE_CHAT_FOLDER: 'delete-chat-folder',
  SET_ACTIVE_CHAT: 'set-active-chat',
  MOVE_CHAT_TO_FOLDER: 'move-chat-to-folder',
  EXPORT_CHATS: 'export-chats',
  IMPORT_CHATS: 'import-chats',
  EXPORT_TRACE: 'export-trace',
  REPORT_TRACE_TO_GITHUB: 'report-trace-to-github',
  GET_AGENT_RUN_STATE: 'get-agent-run-state',
  STOP_AGENT: 'stop-agent',
  GET_RUN_CHECKPOINT: 'get-run-checkpoint',
  ROLLBACK_RUN: 'rollback-run',
  GET_PROJECT_TREE: 'get-project-tree',
  PREVIEW_AGENT_CONTEXT: 'preview-agent-context',
  SUMMARIZE_CONTEXT: 'summarize-context',
  LOAD_SETTINGS: 'load-settings',
  SAVE_SETTINGS: 'save-settings',
  RUN_AGENT: 'run-agent',
  LIST_PULL_REQUESTS: 'list-pull-requests',
  CREATE_ISSUE: 'create-issue',
  CREATE_PR: 'create-pr',
  LIST_ISSUES: 'list-issues',
  OPEN_ISSUE: 'open-issue',
  TRIGGER_GITHUB_WORKFLOW: 'trigger-github-workflow',
  READ_FILE_HISTORY: 'read-file-history',
  ADD_MCP_SERVER: 'add-mcp-server',
  REMOVE_MCP_SERVER: 'remove-mcp-server',
  CHECK_MCP_HEALTH: 'check-mcp-health',
  BENCHMARK_MODEL: 'benchmark-model',
  AUTO_INDEX_PROJECT: 'auto-index-project',
  LIST_ROADMAP_ITEMS: 'list-roadmap-items',
  CHECK_GITHUB_AUTH: 'check-github-auth',
  SELECT_GGUF_FILE: 'select-gguf-file',
  DOWNLOAD_GGUF: 'download-gguf',
  DELETE_GGUF_FILE: 'delete-gguf-file',
  VOTE_MEMORY: 'vote-memory',
  REGISTER_P2P_NODE: 'register-p2p-node',
  GET_P2P_CREDITS: 'get-p2p-credits',
  SHOW_AGENT_DONE_NOTIFICATION: 'show-agent-done-notification',
  GET_AGENT_METRICS: 'get-agent-metrics',

  // ── One-way (renderer → main) ─────────────────────────────────────────
  CANCEL_GGUF_DOWNLOAD: 'cancel-gguf-download',
  SAVE_APP_STATE: 'save-app-state',
  LOG_FRONTEND_ERROR: 'log-frontend-error',
  AGENT_CONFIRM_RESPONSE: 'agent-confirm-response',
  AGENT_CLARIFY_RESPONSE: 'agent-clarify-response',
  AGENT_PREVIEW_RESPONSE: 'agent-preview-response',
  AGENT_PREVIEW_HUNK_SELECTION: 'agent-preview-hunk-selection',
  OPEN_DEVTOOLS: 'open-devtools',
  RESTART_APP: 'restart-app',
  INSTALL_UPDATE: 'install-update',
  OPEN_EXTERNAL: 'open-external',
  SHOW_ITEM_IN_FOLDER: 'show-item-in-folder',
  GET_COLLECTIVE_SYNC_STATUS: 'get-collective-sync-status',
  FLUSH_COLLECTIVE_MEMORY: 'flush-collective-memory',

  // ── Broadcast (main → renderer) ───────────────────────────────────────
  AGENT_STREAM: 'agent-stream',
  OLLAMA_PULL_PROGRESS: 'ollama-pull-progress',
  GGUF_DOWNLOAD_PROGRESS: 'gguf-download-progress',
  AGENT_CONFIRM: 'agent-confirm',
  AGENT_CLARIFY: 'agent-clarify',
  SYSTEM_STATS: 'system-stats',
  PROGRESS_EVENT: 'progress-event',
  UPDATE_AVAILABLE: 'update-available',
  RUNTIME_UPDATE_READY: 'runtime-update-ready',
  DISMISS_RUNTIME_UPDATE: 'dismiss-runtime-update',
  MCP_HEALTH_STATUS: 'mcp-health-status'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

// ─── Контракты каналов (args + result) ───────────────────────────────────

/**
 * Схемы аргументов для каждого handle-канала.
 * args — кортеж аргументов после _event.
 * result — схема возвращаемого значения (для документации; валидация на усмотрение).
 */
export const Contracts = {
  [IPC.GET_CRASH_RECOVERY]: {
    args: z.tuple([]),
    result: AppStateSchema.nullable()
  },
  [IPC.SELECT_PROJECT_FOLDER]: {
    args: z.tuple([]),
    result: z.string().nullable()
  },
  [IPC.SELECT_FILES]: {
    args: z.tuple([]),
    result: z.array(z.object({ path: z.string(), size: z.number() }))
  },
  [IPC.READ_ATTACHMENT]: {
    args: z.tuple([z.string()]),
    result: ReadAttachmentResultSchema
  },
  [IPC.READ_FILE]: {
    args: z.tuple([z.string(), z.string()]),
    result: z.string()
  },
  [IPC.WRITE_FILE]: {
    args: z.tuple([z.string(), z.string(), z.string()]),
    result: z.void()
  },
  [IPC.CHECK_OLLAMA]: {
    args: z.tuple([z.string().optional()]),
    result: z.boolean()
  },
  [IPC.CHECK_QDRANT]: {
    args: z.tuple([z.string(), z.string().optional()]),
    result: z.boolean()
  },
  [IPC.CHECK_MILVUS]: {
    args: z.tuple([z.string(), z.string().optional()]),
    result: z.boolean()
  },
  [IPC.LIST_OLLAMA_MODELS]: {
    args: z.tuple([z.string().optional()]),
    result: z.array(OllamaModelSchema)
  },
  [IPC.LIST_PROVIDER_MODELS]: {
    args: z.tuple([ListProviderModelsConfigSchema]),
    result: z.array(ProviderModelSchema)
  },
  [IPC.PULL_OLLAMA_MODEL]: {
    args: z.tuple([z.string(), z.string()]),
    result: z.void()
  },
  [IPC.DELETE_OLLAMA_MODEL]: {
    args: z.tuple([z.string(), z.string()]),
    result: z.void()
  },
  [IPC.CHECK_AGENT_PREREQUISITES]: {
    args: z.tuple([z.string(), z.string(), z.boolean().optional()]),
    result: z.object({
      ok: z.boolean(),
      issues: z.array(z.unknown())
    })
  },
  [IPC.RUN_TERMINAL_COMMAND]: {
    args: z.tuple([z.string(), z.string()]),
    result: TerminalResultSchema
  },
  [IPC.LIST_MEMORIES]: {
    args: z.tuple([z.string()]),
    result: z.array(MemoryEntrySchema)
  },
  [IPC.DELETE_MEMORY]: {
    args: z.tuple([z.string(), z.string()]),
    result: z.boolean()
  },
  [IPC.LIST_SKILLS]: {
    args: z.tuple([z.string()]),
    result: z.array(AgentSkillSchema)
  },
  [IPC.CREATE_SKILL]: {
    args: z.tuple([
      z.string(),
      z.object({
        name: z.string(),
        description: z.string(),
        instructions: z.string(),
        triggers: z.array(z.string()).optional()
      })
    ]),
    result: AgentSkillSchema
  },
  [IPC.DELETE_SKILL]: {
    args: z.tuple([z.string(), z.string()]),
    result: z.boolean()
  },
  [IPC.SHARE_AS_GIST]: {
    args: z.tuple([z.string(), z.string(), z.enum(['memory', 'skills', 'both'])]),
    result: z.string()
  },
  [IPC.GET_CHAT_STORE]: {
    args: z.tuple([]),
    result: ChatStoreSchema
  },
  [IPC.CREATE_CHAT]: {
    args: z.tuple([z.string().nullable().optional(), z.enum(['chat', 'code']).optional()]),
    result: SavedChatSchema
  },
  [IPC.UPDATE_CHAT]: {
    args: z.tuple([
      z.string(),
      z.object({
        title: z.string().optional(),
        messages: z.array(ChatMessageSchema).optional(),
        folderId: z.string().nullable().optional(),
        projectPath: z.string().optional(),
        pinned: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
        interruptedDraft: InterruptedDraftSchema.nullable().optional()
      })
    ]),
    result: SavedChatSchema.nullable()
  },
  [IPC.DELETE_CHAT]: {
    args: z.tuple([z.string(), z.string().optional()]),
    result: z.void()
  },
  [IPC.CREATE_CHAT_FOLDER]: {
    args: z.tuple([z.string()]),
    result: ChatFolderSchema
  },
  [IPC.RENAME_CHAT_FOLDER]: {
    args: z.tuple([z.string(), z.string()]),
    result: z.void()
  },
  [IPC.UPDATE_CHAT_FOLDER]: {
    args: z.tuple([
      z.string(),
      z.object({ name: z.string().optional(), projectPath: z.string().optional() })
    ]),
    result: z.void()
  },
  [IPC.DELETE_CHAT_FOLDER]: {
    args: z.tuple([z.string()]),
    result: z.void()
  },
  [IPC.SET_ACTIVE_CHAT]: {
    args: z.tuple([z.string().nullable()]),
    result: z.void()
  },
  [IPC.MOVE_CHAT_TO_FOLDER]: {
    args: z.tuple([z.string(), z.string().nullable()]),
    result: z.void()
  },
  [IPC.EXPORT_CHATS]: {
    args: z.tuple([]),
    result: ChatStoreSchema
  },
  [IPC.IMPORT_CHATS]: {
    args: z.tuple([z.array(SavedChatSchema)]),
    result: ImportResultSchema
  },
  [IPC.EXPORT_TRACE]: {
    args: z.tuple([z.string(), z.array(AgentTraceEventSchema), z.string().optional()]),
    result: z.object({
      ok: z.boolean(),
      path: z.string().optional(),
      error: z.string().optional()
    })
  },
  [IPC.REPORT_TRACE_TO_GITHUB]: {
    args: z.tuple([
      z.string(),
      z.array(AgentTraceEventSchema),
      z.string().optional(),
      z.string().optional()
    ]),
    result: z.object({
      ok: z.boolean(),
      issueUrl: z.string().optional(),
      gistUrl: z.string().optional(),
      title: z.string().optional(),
      error: z.string().optional()
    })
  },
  [IPC.GET_AGENT_RUN_STATE]: {
    args: z.tuple([]),
    result: z.array(z.string())
  },
  [IPC.STOP_AGENT]: {
    args: z.tuple([z.string()]),
    result: z.boolean()
  },
  [IPC.GET_RUN_CHECKPOINT]: {
    args: z.tuple([z.string()]),
    result: z.boolean()
  },
  [IPC.ROLLBACK_RUN]: {
    args: z.tuple([z.string()]),
    result: z.object({ ok: z.boolean(), message: z.string() })
  },
  [IPC.GET_PROJECT_TREE]: {
    args: z.tuple([z.string(), z.number().optional()]),
    result: z.array(FileNodeSchema)
  },
  [IPC.PREVIEW_AGENT_CONTEXT]: {
    args: z.tuple([z.string(), z.array(ChatMessageSchema), z.string(), z.string()]),
    result: AgentContextPreviewSchema
  },
  [IPC.SUMMARIZE_CONTEXT]: {
    args: z.tuple([z.array(ChatMessageSchema), AgentSettingsSchema]),
    result: SummarizeContextResultSchema
  },
  [IPC.LOAD_SETTINGS]: {
    args: z.tuple([]),
    result: AgentSettingsSchema
  },
  [IPC.SAVE_SETTINGS]: {
    args: z.tuple([AgentSettingsSchema]),
    result: AgentSettingsSchema
  },
  [IPC.ADD_MCP_SERVER]: {
    args: z.tuple([AgentSettingsSchema, z.string().min(1)]),
    result: AgentSettingsSchema
  },
  [IPC.REMOVE_MCP_SERVER]: {
    args: z.tuple([AgentSettingsSchema, z.string().min(1)]),
    result: AgentSettingsSchema
  },
  [IPC.CHECK_MCP_HEALTH]: {
    args: z.tuple([AgentSettingsSchema]),
    result: z.object({ results: z.array(McpHealthResultSchema) })
  },
  [IPC.BENCHMARK_MODEL]: {
    args: z.tuple([z.string(), z.string()]),
    result: BenchmarkResultSchema
  },
  [IPC.AUTO_INDEX_PROJECT]: {
    args: z.tuple([z.string(), z.string(), z.string(), z.string().optional()]),
    result: z.void()
  },
  [IPC.LIST_ROADMAP_ITEMS]: {
    args: z.tuple([]),
    result: z.array(RoadmapItemSchema)
  },
  [IPC.CHECK_GITHUB_AUTH]: {
    args: z.tuple([]),
    result: z.object({
      ghInstalled: z.boolean(),
      ghLoggedIn: z.boolean(),
      tokenConfigured: z.boolean(),
      tokenValid: z.boolean(),
      authSource: z.enum(['settings', 'gh-cli']).optional(),
      login: z.string().optional(),
      gitRepoRoot: z.string().nullable(),
      hints: z.array(z.string()),
      formatted: z.string()
    })
  },
  [IPC.DELETE_GGUF_FILE]: {
    args: z.tuple([z.string()]),
    result: z.void()
  },
  [IPC.VOTE_MEMORY]: {
    args: z.tuple([z.string(), z.union([z.literal(1), z.literal(-1)])]),
    result: z.number()
  },
  [IPC.RUN_AGENT]: {
    args: z.tuple([
      AgentSettingsSchema,
      z.string(),
      z.string(),
      z.array(ChatMessageSchema),
      z.string(),
      z.boolean().optional()
    ]),
    result: z.void()
  },
  [IPC.LIST_PULL_REQUESTS]: {
    args: z.tuple([]),
    result: PullRequestListResultSchema
  },
  [IPC.CREATE_ISSUE]: {
    args: z.tuple([z.string(), z.string().optional(), z.string().optional()]),
    result: z.string()
  },
  [IPC.CREATE_PR]: {
    args: z.tuple([z.string().optional(), z.string().optional()]),
    result: z.string()
  },
  [IPC.LIST_ISSUES]: {
    args: z.tuple([]),
    result: z.string()
  },
  [IPC.OPEN_ISSUE]: {
    args: z.tuple([z.string()]),
    result: z.string()
  },
  [IPC.TRIGGER_GITHUB_WORKFLOW]: {
    args: z.tuple([z.string(), z.string().optional(), z.string().optional()]),
    result: z.string()
  },

  // One-way (аргументы для ipcMain.on)
  [IPC.SAVE_APP_STATE]: {
    args: z.tuple([AppStateSchema.nullable()])
  },
  [IPC.LOG_FRONTEND_ERROR]: {
    args: z.tuple([z.string(), z.string().optional()])
  },
  [IPC.AGENT_CONFIRM_RESPONSE]: {
    args: z.tuple([z.string(), z.boolean()])
  },
  [IPC.AGENT_PREVIEW_RESPONSE]: {
    args: z.tuple([z.string(), z.boolean()])
  },
  [IPC.OPEN_EXTERNAL]: {
    args: z.tuple([z.string()])
  },
  [IPC.SHOW_ITEM_IN_FOLDER]: {
    args: z.tuple([z.string()])
  },
  [IPC.GET_COLLECTIVE_SYNC_STATUS]: {
    args: z.tuple([])
  },
  [IPC.FLUSH_COLLECTIVE_MEMORY]: {
    args: z.tuple([z.string()])
  },
  [IPC.REGISTER_P2P_NODE]: {
    args: z.tuple([AgentSettingsSchema]),
    result: z.object({ ok: z.boolean(), id: z.string().optional(), message: z.string() })
  },
  [IPC.GET_P2P_CREDITS]: {
    args: z.tuple([AgentSettingsSchema]),
    result: z.object({
      ok: z.boolean(),
      balance: z.number(),
      message: z.string().optional()
    })
  },
  [IPC.SHOW_AGENT_DONE_NOTIFICATION]: {
    args: z.tuple([
      z.object({
        title: z.string(),
        body: z.string()
      })
    ]),
    result: z.boolean()
  },
  [IPC.GET_AGENT_METRICS]: {
    args: z.tuple([z.number().optional()]),
    result: z.any()
  }
} as const

// ─── Вспомогательные функции ──────────────────────────────────────────────

/**
 * Парсит и валидирует аргументы IPC-вызова по Zod-кортежной схеме.
 * Бросает ZodError при несоответствии — Electron автоматически отклонит промис.
 *
 * @example
 * ipcMain.handle(IPC.WRITE_FILE, async (_e, ...a) => {
 *   const [projectPath, filePath, content] = parseIpcArgs(Contracts[IPC.WRITE_FILE].args, a)
 *   return safeWriteFile(projectPath, filePath, content)
 * })
 */
export function parseIpcArgs<T extends z.ZodTuple>(schema: T, args: unknown[]): z.infer<T> {
  return schema.parse(args) as z.infer<T>
}

/**
 * Безопасный вариант: вместо исключения возвращает { ok, data, error }.
 * Удобно, когда нужно логировать проблему без прерывания потока.
 */
export function safeParseIpcArgs<T extends z.ZodTuple>(
  schema: T,
  args: unknown[]
): { ok: true; data: z.infer<T> } | { ok: false; error: z.ZodError } {
  const result = schema.safeParse(args)
  if (result.success) return { ok: true, data: result.data as z.infer<T> }
  return { ok: false, error: result.error }
}
