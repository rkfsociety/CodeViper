export type AgentRole = 'user' | 'assistant' | 'tool' | 'system'

import type { AgentPrerequisitesResult } from '../shared/agentPrerequisites'
import type { GenerationMetrics } from '../shared/generationMetrics'
import type { PermissionMode } from '../shared/permissions'

export type {
  AgentPrerequisiteIssue,
  AgentPrerequisitesResult,
  PackageManager
} from '../shared/agentPrerequisites'
export type { PermissionMode } from '../shared/permissions'
export { PERMISSION_MODES, PERMISSION_MODE_LABELS } from '../shared/permissions'
export { isThinkingModel } from '../shared/reasoning'

export interface ChatMessage {
  id: string
  role: AgentRole
  content: string
  toolName?: string
  toolOutput?: string
  /** Рассуждения think-модели (показываются сворачиваемым блоком) */
  thinking?: string
  timestamp: number
  /** Время генерации этого ответа (мс) */
  durationMs?: number
  /** Поля preview_edit — заполнены только для сообщений с предпросмотром правок */
  previewId?: string
  previewPath?: string
  previewDiff?: string
  previewStatus?: 'pending' | 'applied' | 'cancelled'
  /** Прикреплённые изображения (data URL для показа миниатюры) */
  images?: { name: string; dataUrl: string }[]
}

export interface ChatFolder {
  id: string
  name: string
  projectPath?: string
  createdAt: string
  updatedAt: string
}

export interface InterruptedDraft {
  /** Частичные токены ответа ассистента на момент обрыва */
  partial: string
  /** Сообщение пользователя, которое вызвало прогон (для повтора) */
  userMessage: string
  /** Причина обрыва */
  reason: 'timeout' | 'error'
  /** Метка времени (мс) */
  timestamp: number
}

export interface SavedChat {
  id: string
  title: string
  folderId: string | null
  projectPath: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
  /** Закреплённый чат — всегда сверху в списке */
  pinned?: boolean
  /** Теги для фильтрации */
  tags?: string[]
  /** Черновик, сохранённый при обрыве стрима */
  interruptedDraft?: InterruptedDraft | null
  /** Режим агента, в котором создан чат */
  mode?: 'chat' | 'code'
}

export interface ChatStore {
  version: 2
  folders: ChatFolder[]
  chats: SavedChat[]
  activeChatId: string | null
}

export interface ImportResult {
  added: number
  skipped: number
}

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface OllamaModel {
  name: string
  size: number
  modifiedAt: string
  // Информация о совместимости с системой (добавляется на сервере)
  sizeGB?: number
  contextLength?: number
  parameterSize?: string
  isSupported?: boolean
  supportsTools?: boolean
  reason?: string
  recommendedFor?: string
}

export interface OllamaPullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
}

export type { RecommendedModel, RamTier } from '../shared/recommendedModels'
export type { GenerationMetrics } from '../shared/generationMetrics'
export { isBuiltinSkill } from '../shared/builtinSkills'
export {
  RECOMMENDED_MODELS,
  RECOMMENDED_MODEL_TIERS,
  filterDownloadableRecommendedModels,
  filterToolCallingModels,
  groupRecommendedModelsByTier,
  isRecommendedModelInstalled,
  isToolCallingModel
} from '../shared/recommendedModels'

export interface AgentSettings {
  ollamaUrl: string
  model: string
  selfLearning?: boolean
  /** Автовыбор модели под задачу и выгрузка других из RAM */
  autoModel?: boolean
  /** Режим доступа: ask — спрашивать всё, acceptEdits — принимать правки/спрашивать команды, bypass — без подтверждений */
  permissionMode?: PermissionMode
  /** Сначала задавать уточняющие вопросы при неоднозначной задаче */
  clarifyMode?: boolean
  /** Глубокое рассуждение: think:true для think-моделей, усиленный промпт для остальных */
  deepReasoning?: boolean
  /** Автоматически коммитить и пушить самоправки агента (правки исходников CodeViper) */
  autoPushSelfEdits?: boolean
  /** Ветка git для самоулучшения (по умолчанию agent/self-improve) */
  selfImproveBranch?: string
  /** Синхронизировать глобальные знания в docs/collective/ViperMemory.md на GitHub */
  syncCollectiveMemory?: boolean
  /** Модель для суммаризации контекста; пусто — авто (самая лёгкая установленная) */
  summarizeModel?: string
  /** Провайдер моделей: ollama (локально), deepseek, openai и т.д. */
  modelProvider?:
    | 'ollama'
    | 'deepseek'
    | 'openai'
    | 'openrouter'
    | 'gemini'
    | 'anthropic'
    | 'groq'
    | 'together'
  /** @deprecated Используй deepseekApiKey / openaiApiKey / openrouterApiKey */
  providerApiKey?: string
  /** API ключ DeepSeek */
  deepseekApiKey?: string
  /** API ключ OpenAI-совместимого провайдера */
  openaiApiKey?: string
  /** API ключ OpenRouter */
  openrouterApiKey?: string
  /** API ключ Gemini */
  geminiApiKey?: string
  /** Лимит запросов Gemini API в минуту (free tier: фиксировано моделью, paid: вручную) */
  geminiRpm?: number
  /** Уровень доступа Gemini API: бесплатный (фиксированные модели/лимиты) или платный */
  geminiTier?: 'free' | 'paid'
  /** API ключ Claude (Anthropic) */
  claudeApiKey?: string
  /** API ключ Groq */
  groqApiKey?: string
  /** API ключ Together AI */
  togetherApiKey?: string
  /** Таймаут выполнения команд агентом (сек); по умолчанию 120 */
  commandTimeoutSec?: number
  /** Пользовательский список запрещённых паттернов команд (строки или регулярные выражения) */
  commandBlocklist?: string[]
  /** Режим только чтение: блокирует все инструменты записи */
  readonlyMode?: boolean
  /** Звуковое уведомление при завершении задачи агента */
  soundNotifications?: boolean
  /** Синхронизировать с Git при запуске (stash/reset); по умолчанию true */
  gitSyncOnStartup?: boolean
  /** Стратегия git-синхронизации при запуске; по умолчанию 'stash' */
  gitSyncStrategy?: GitSyncStrategy
  /** GitHub Personal Access Token для создания Gist (экспорт памяти и навыков) */
  githubToken?: string
  /** GitLab Personal Access Token (scopes: api) для MR и пайплайнов */
  gitlabToken?: string
  /** GitLab базовый URL (по умолчанию https://gitlab.com); задай для self-hosted инстанса */
  gitlabUrl?: string
  /** Исключать thinking из истории контекста (экономия 20-50% для think-моделей) */
  excludeThinkingFromHistory?: boolean
  /** Размер контекста выбранной модели в токенах (сохраняется при выборе модели) */
  modelContextLength?: number
  /** Порог суммаризации контекста в процентах (50–85, дефолт 85) */
  contextSummarizeThreshold?: number
  /** Агрессивное сжатие: суммаризировать при 65% заполнения (экономия 30–40%) */
  aggressiveCompression?: boolean
  /** Режим энергосбережения: батчинг обновлений UI (300 мс), анимации отключены */
  powerSaveMode?: boolean
  /** Отключить фоновый сбор CPU/GPU-статистики */
  disableSystemStats?: boolean
  /** Ollama: кол-во слоёв на GPU (-1 = авто, 0 = только CPU, N = N слоёв) */
  ollamaNumGpu?: number
  /** Обновлять PR только вручную (без авто-опроса каждые 5 минут) */
  prManualRefresh?: boolean
  /** Включить облачный API параллельно с Ollama (для суммаризации или запасного канала) */
  cloudEnabled?: boolean
  /** Тип облачного провайдера: deepseek или openai-совместимый */
  cloudProvider?: 'deepseek' | 'openai' | 'openrouter' | 'gemini'
  /** API ключ облачного провайдера */
  cloudApiKey?: string
  /** Базовый URL для OpenAI-совместимых облачных провайдеров */
  cloudBaseUrl?: string
  /** Модель облачного провайдера (по умолчанию deepseek-chat) */
  cloudModel?: string
  /** URL Qdrant (например http://localhost:6333) */
  qdrantUrl?: string
  /** API ключ Qdrant (опционально, для защищённых инстансов) */
  qdrantApiKey?: string
  /** URL Milvus (например http://localhost:19530) */
  milvusUrl?: string
  /** API ключ Milvus (токен, опционально) */
  milvusApiKey?: string
  /** Провайдер векторного хранилища для RAG: local (JSON), qdrant, milvus */
  ragProvider?: 'local' | 'qdrant' | 'milvus'
  /** Режим чата: только базовый промпт, без инструментов и дерева проекта (транзиентное, не сохраняется) */
  chatMode?: boolean
  /** Дополнительные инструкции, дописываемые в конец системного промпта агента */
  customSystemPrompt?: string
  /** Отключённые инструменты агента (имена); пустой массив — все включены */
  disabledTools?: string[]
  /** Подключённые MCP-серверы с кэшем инструментов из /.well-known/mcp */
  mcpServers?: McpServerConfig[]
}

export interface McpToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface McpServerConfig {
  url: string
  tools: McpToolDefinition[]
}

export type GitSyncStrategy = 'stash' | 'rebase' | 'ff-only'

export const GIT_SYNC_STRATEGIES: GitSyncStrategy[] = ['stash', 'rebase', 'ff-only']

export const GIT_SYNC_STRATEGY_LABELS: Record<GitSyncStrategy, string> = {
  stash: 'Stash + reset (приоритет GitHub)',
  rebase: 'Rebase (наложить локальные коммиты)',
  'ff-only': 'Fast-forward only (безопасно)'
}

export interface AgentConfirmRequest {
  id: string
  toolName: string
  toolInput: string
}

export type MemoryCategory = 'pattern' | 'mistake' | 'preference' | 'project' | 'skill'
export type MemoryScope = 'global' | 'project'

export interface MemoryEntry {
  id: string
  content: string
  category: MemoryCategory
  tags: string[]
  scope: MemoryScope
  source?: string
  createdAt: string
  lastUsedAt: string
  useCount: number
}

export interface MemoryStore {
  version: 1
  entries: MemoryEntry[]
}

export interface AgentSkill {
  id: string
  name: string
  description: string
  instructions: string
  triggers: string[]
  scope: MemoryScope
  createdAt: string
  updatedAt: string
  useCount: number
}

export interface SkillsStore {
  version: 1
  skills: AgentSkill[]
}

export interface AgentContextSection {
  id: string
  title: string
  subtitle?: string
  content: string
  charCount: number
}

export interface AgentContextMessagePreview {
  role: AgentRole | 'tool'
  label: string
  content: string
  charCount: number
}

export interface SelfImprovementPlanItem {
  id: string
  title: string
  done: boolean
  attemptCount?: number
  blocked?: boolean
  blockReason?: string
}

export interface TodoItem {
  id: string
  title: string
  done: boolean
}

export interface AdaptiveLimits {
  maxToolMessageChars: number
  maxHistoryMessages: number
}

export interface AgentContextPreview {
  model: string
  generatedAt: string
  totalChars: number
  estimatedTokens: number
  contextUsagePercent: number
  contextLimitTokens: number
  historyTruncated: boolean
  historySummarized: boolean
  droppedMessageCount: number
  toolCount: number
  sections: AgentContextSection[]
  messages: AgentContextMessagePreview[]
  adaptiveLimits?: AdaptiveLimits
}

export interface AgentPreviewRequest {
  id: string
  path: string
  diff: string
}

export interface AgentTraceEvent {
  ts: number
  kind: 'run_start' | 'llm_request' | 'llm_response' | 'tool_call' | 'tool_result' | 'run_end'
  label: string
  data: Record<string, unknown>
}

export type CircuitBreakerState = 'open' | 'half-open' | 'closed'

export interface AgentStreamPayload {
  type:
    | 'token'
    | 'thinking'
    | 'assistant'
    | 'clear_draft'
    | 'tool_start'
    | 'tool_end'
    | 'done'
    | 'error'
    | 'learning_saved'
    | 'skill_saved'
    | 'context'
    | 'self_improve_plan'
    | 'todo_update'
    | 'model_selected'
    | 'generation_metrics'
    | 'preview'
    | 'trace'
    | 'orchestrating'
    | 'retry_429'
    | 'circuit_breaker'
    | 'collective_sync'
  content?: string
  /** Поля события retry_429 */
  retryWaitMs?: number
  retryAttempt?: number
  /** Поля события preview */
  previewId?: string
  previewPath?: string
  previewDiff?: string
  /** Полные рассуждения (передаётся вместе с событием assistant) */
  thinking?: string
  toolName?: string
  toolInput?: string
  toolOutput?: string
  memoryId?: string
  skillId?: string
  planItems?: SelfImprovementPlanItem[]
  todoItems?: TodoItem[]
  selectedModel?: string
  modelReason?: string
  contextPreview?: AgentContextPreview
  /** Идёт ли прямо сейчас сжатие контекста (суммаризация/обрезка) — для индикатора в UI */
  summarizing?: boolean
  /** Метрики последнего шага генерации Ollama (tok/s, длительность) */
  generationMetrics?: GenerationMetrics
  /** Событие трассировки агента (type === 'trace') */
  traceEvent?: AgentTraceEvent
  /** Агент строит план действий (type === 'orchestrating') */
  orchestrating?: boolean
  /** Состояние circuit breaker (type === 'circuit_breaker') */
  circuitBreakerState?: CircuitBreakerState
  /** Момент когда circuit breaker перейдёт из open в half-open (Date.now() + 30 000) */
  circuitBreakerOpenUntilMs?: number
  /** Синхронизация коллективной памяти на GitHub (type === 'collective_sync') */
  collectiveSyncStatus?: 'queued' | 'syncing' | 'done' | 'error'
  collectiveSyncBranch?: string
  collectiveSyncCount?: number
}

export interface AgentStreamEvent extends AgentStreamPayload {
  chatId: string
}

export interface AgentRunState {
  chatId: string
}

/** Состояние приложения для восстановления после краша */
export interface AppState {
  activeChatId: string
  projectPath: string
  /** Сообщения, стоявшие в очереди в момент краша */
  pendingMessages: Array<{ id: string; text: string }>
  crashedAt: string
}

export interface FileHistoryEntry {
  ts: string
  tool: 'edit_file' | 'write_file' | 'create_file' | 'append_file' | 'delete_file' | 'move_file'
  path: string
  projectPath: string
  diff: string
}

export interface TerminalResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export interface SystemStats {
  cpu: number
  gpu: number | null
}

export interface ProgressInfo {
  label: string
  /** 0–100 для определённого прогресса; null — индикатор без процента */
  percent: number | null
}

export type CiStatus = 'success' | 'failure' | 'pending' | 'none'

export interface PullRequestInfo {
  number: number
  title: string
  headRefName: string
  url: string
  isDraft: boolean
  ciStatus: CiStatus
}

export interface PullRequestListResult {
  ok: boolean
  prs?: PullRequestInfo[]
  error?: string
}

import type { UpdateInfo } from '../shared/updateInfo'
export type { UpdateInfo }

export interface CodeViperAPI {
  selectProjectFolder: () => Promise<string | null>
  selectFiles: () => Promise<{ path: string; size: number }[]>
  readAttachment: (filePath: string) => Promise<{
    ok: boolean
    isImage?: boolean
    content?: string
    dataUrl?: string
    mime?: string
    error?: string
  }>
  readFile: (projectPath: string, filePath: string) => Promise<string>
  writeFile: (projectPath: string, filePath: string, content: string) => Promise<void>
  listOllamaModels: (url?: string) => Promise<OllamaModel[]>
  listProviderModels: (config: {
    type: string
    baseUrl?: string
    apiKey?: string
  }) => Promise<{ name: string; size?: number; contextLength?: number }[]>
  checkOllama: (url?: string) => Promise<boolean>
  checkQdrant: (url: string, apiKey?: string) => Promise<boolean>
  checkMilvus: (url: string, apiKey?: string) => Promise<boolean>
  pullOllamaModel: (url: string, model: string) => Promise<void>
  deleteOllamaModel: (url: string, model: string) => Promise<void>
  onOllamaPullProgress: (callback: (progress: OllamaPullProgress) => void) => () => void
  runAgent: (
    settings: AgentSettings,
    projectPath: string,
    chatId: string,
    messages: ChatMessage[],
    userMessage: string
  ) => Promise<void>
  getAgentRunState: () => Promise<string[]>
  stopAgent: (chatId: string) => Promise<boolean>
  previewAgentContext: (
    projectPath: string,
    messages: ChatMessage[],
    userMessage: string,
    model: string
  ) => Promise<AgentContextPreview>
  summarizeContext: (
    messages: ChatMessage[],
    settings: AgentSettings
  ) => Promise<{
    droppedChatIds: string[]
    summary: string | null
    summarized: boolean
    truncated: boolean
  }>
  checkAgentPrerequisites: (
    ollamaUrl: string,
    projectPath: string,
    skipOllamaCheck?: boolean
  ) => Promise<AgentPrerequisitesResult>
  loadSettings: () => Promise<AgentSettings>
  saveSettings: (settings: AgentSettings) => Promise<AgentSettings>
  addMcpServer: (settings: AgentSettings, serverUrl: string) => Promise<AgentSettings>
  removeMcpServer: (settings: AgentSettings, serverUrl: string) => Promise<AgentSettings>
  onAgentStream: (callback: (event: AgentStreamEvent) => void) => () => void
  runTerminalCommand: (cwd: string, command: string) => Promise<TerminalResult>
  listMemories: (projectPath: string) => Promise<MemoryEntry[]>
  deleteMemory: (projectPath: string, id: string) => Promise<boolean>
  listSkills: (projectPath: string) => Promise<AgentSkill[]>
  deleteSkill: (projectPath: string, id: string) => Promise<boolean>
  getChatStore: () => Promise<ChatStore>
  createChat: (folderId?: string | null, mode?: 'chat' | 'code') => Promise<SavedChat>
  updateChat: (
    id: string,
    patch: Partial<
      Pick<
        SavedChat,
        'title' | 'messages' | 'folderId' | 'projectPath' | 'pinned' | 'tags' | 'interruptedDraft'
      >
    >
  ) => Promise<SavedChat | null>
  deleteChat: (id: string) => Promise<void>
  createChatFolder: (name: string) => Promise<ChatFolder>
  renameChatFolder: (id: string, name: string) => Promise<void>
  updateChatFolder: (
    id: string,
    patch: Partial<Pick<ChatFolder, 'name' | 'projectPath'>>
  ) => Promise<void>
  deleteChatFolder: (id: string) => Promise<void>
  setActiveChat: (id: string | null) => Promise<void>
  moveChatToFolder: (chatId: string, folderId: string | null) => Promise<void>
  exportChats: () => Promise<ChatStore>
  importChats: (chats: SavedChat[]) => Promise<ImportResult>
  onAgentConfirm: (callback: (request: AgentConfirmRequest) => void) => () => void
  respondAgentConfirm: (id: string, approved: boolean) => void
  respondAgentPreview: (id: string, apply: boolean) => void
  shareAsGist: (
    token: string,
    projectPath: string,
    what: 'memory' | 'skills' | 'both'
  ) => Promise<string>
  onSystemStats: (cb: (stats: SystemStats) => void) => () => void
  onProgressEvent: (cb: (progress: ProgressInfo | null) => void) => () => void
  listPullRequests: () => Promise<PullRequestListResult>
  createIssue: (title: string, body?: string, labels?: string) => Promise<string>
  createPr: (title?: string, body?: string) => Promise<string>
  listIssues: () => Promise<string>
  openIssue: (number: string) => Promise<string>
  triggerGithubWorkflow: (workflowId: string, ref?: string, fields?: string) => Promise<string>
  readFileHistory: (projectPath: string, filePath: string) => Promise<FileHistoryEntry[]>
  openExternal: (url: string) => void
  showItemInFolder: (filePath: string) => void
  onUpdateAvailable: (cb: (info: UpdateInfo) => void) => () => void
  restartApp: () => void
  installUpdate: () => void
  openDevTools: () => void
  logFrontendError: (message: string, stack?: string) => void
  saveAppState: (state: AppState | null) => void
  getCrashRecovery: () => Promise<AppState | null>
}

declare global {
  interface Window {
    codeviper: CodeViperAPI
  }
}

export {}
