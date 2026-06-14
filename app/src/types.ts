export type AgentRole = 'user' | 'assistant' | 'tool' | 'system'

import type { AgentPrerequisitesResult } from '../shared/agentPrerequisites'

export type { AgentPrerequisiteIssue, AgentPrerequisitesResult, PackageManager } from '../shared/agentPrerequisites'

export interface ChatMessage {
  id: string
  role: AgentRole
  content: string
  toolName?: string
  toolOutput?: string
  timestamp: number
}

export interface ChatFolder {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface SavedChat {
  id: string
  title: string
  folderId: string | null
  projectPath: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt: string
}

export interface ChatStore {
  version: 2
  folders: ChatFolder[]
  chats: SavedChat[]
  activeChatId: string | null
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
}

export interface OllamaPullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
}

export type { RecommendedModel, RamTier } from '../shared/recommendedModels'
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
  maxSteps: number
  selfLearning?: boolean
  /** Автовыбор модели под задачу и выгрузка других из RAM */
  autoModel?: boolean
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
}

export interface AgentStreamPayload {
  type:
    | 'token'
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
    | 'model_selected'
  content?: string
  toolName?: string
  toolInput?: string
  toolOutput?: string
  memoryId?: string
  skillId?: string
  planItems?: SelfImprovementPlanItem[]
  selectedModel?: string
  modelReason?: string
  contextPreview?: AgentContextPreview
}

export interface AgentStreamEvent extends AgentStreamPayload {
  chatId: string
}

export interface AgentRunState {
  chatId: string
}

export interface TerminalResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export interface CodeViperAPI {
  selectProjectFolder: () => Promise<string | null>
  listDirectory: (dirPath: string) => Promise<FileNode[]>
  readFile: (projectPath: string, filePath: string) => Promise<string>
  writeFile: (projectPath: string, filePath: string, content: string) => Promise<void>
  listOllamaModels: (url?: string) => Promise<OllamaModel[]>
  checkOllama: (url?: string) => Promise<boolean>
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
  getAgentRunState: () => Promise<AgentRunState | null>
  stopAgent: () => Promise<boolean>
  previewAgentContext: (
    projectPath: string,
    messages: ChatMessage[],
    userMessage: string,
    model: string
  ) => Promise<AgentContextPreview>
  checkAgentPrerequisites: (
    ollamaUrl: string,
    projectPath: string
  ) => Promise<AgentPrerequisitesResult>
  loadSettings: () => Promise<AgentSettings>
  saveSettings: (settings: AgentSettings) => Promise<AgentSettings>
  onAgentStream: (callback: (event: AgentStreamEvent) => void) => () => void
  runTerminalCommand: (cwd: string, command: string) => Promise<TerminalResult>
  listMemories: (projectPath: string) => Promise<MemoryEntry[]>
  deleteMemory: (projectPath: string, id: string) => Promise<boolean>
  listSkills: (projectPath: string) => Promise<AgentSkill[]>
  deleteSkill: (projectPath: string, id: string) => Promise<boolean>
  getChatStore: () => Promise<ChatStore>
  createChat: (folderId?: string | null) => Promise<SavedChat>
  updateChat: (
    id: string,
    patch: Partial<Pick<SavedChat, 'title' | 'messages' | 'folderId' | 'projectPath'>>
  ) => Promise<SavedChat | null>
  deleteChat: (id: string) => Promise<void>
  createChatFolder: (name: string) => Promise<ChatFolder>
  renameChatFolder: (id: string, name: string) => Promise<void>
  deleteChatFolder: (id: string) => Promise<void>
  setActiveChat: (id: string | null) => Promise<void>
  moveChatToFolder: (chatId: string, folderId: string | null) => Promise<void>
}

declare global {
  interface Window {
    codeviper: CodeViperAPI
  }
}

export {}
