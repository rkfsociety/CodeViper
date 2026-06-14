export type AgentRole = 'user' | 'assistant' | 'tool' | 'system'

export interface ChatMessage {
  id: string
  role: AgentRole
  content: string
  toolName?: string
  timestamp: number
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

export interface RecommendedModel {
  name: string
  description: string
  ramHint: string
}

export const RECOMMENDED_MODELS: RecommendedModel[] = [
  {
    name: 'qwen2.5-coder:7b',
    description: 'Быстрая модель для кода, tool calling',
    ramHint: '8 GB RAM'
  },
  {
    name: 'qwen2.5-coder:14b',
    description: 'Лучше качество кода',
    ramHint: '16 GB RAM'
  },
  {
    name: 'llama3.1:8b',
    description: 'Универсальная модель с tool calling',
    ramHint: '8 GB RAM'
  },
  {
    name: 'qwen3:8b',
    description: 'Новая серия Qwen',
    ramHint: '8 GB RAM'
  }
]

export interface AgentSettings {
  ollamaUrl: string
  model: string
  projectPath: string
  maxSteps: number
  selfLearning?: boolean
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

export interface AgentStreamEvent {
  type: 'token' | 'tool_start' | 'tool_end' | 'done' | 'error' | 'learning_saved'
  content?: string
  toolName?: string
  toolInput?: string
  toolOutput?: string
  memoryId?: string
}

export interface TerminalResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

export interface RebuildStatus {
  available: boolean
  root: string | null
  reason?: string
}

export interface RebuildResult {
  ok: boolean
  message: string
  files?: string[]
}

export interface RebuildProgressEvent {
  type: 'start' | 'log' | 'done'
  line?: string
  root?: string
  ok?: boolean
  message?: string
  files?: string[]
}

export interface CodeViperAPI {
  selectProjectFolder: () => Promise<string | null>
  listDirectory: (dirPath: string) => Promise<FileNode[]>
  readFile: (projectPath: string, filePath: string) => Promise<string>
  writeFile: (projectPath: string, filePath: string, content: string) => Promise<void>
  listOllamaModels: (url?: string) => Promise<OllamaModel[]>
  checkOllama: (url?: string) => Promise<boolean>
  pullOllamaModel: (url: string, model: string) => Promise<void>
  onOllamaPullProgress: (callback: (progress: OllamaPullProgress) => void) => () => void
  runAgent: (
    settings: AgentSettings,
    messages: ChatMessage[],
    userMessage: string
  ) => Promise<void>
  onAgentStream: (callback: (event: AgentStreamEvent) => void) => () => void
  runTerminalCommand: (cwd: string, command: string) => Promise<TerminalResult>
  listMemories: (projectPath: string) => Promise<MemoryEntry[]>
  deleteMemory: (projectPath: string, id: string) => Promise<boolean>
  getRebuildStatus: () => Promise<RebuildStatus>
  rebuildApp: () => Promise<RebuildResult>
  onRebuildProgress: (callback: (event: RebuildProgressEvent) => void) => () => void
}

declare global {
  interface Window {
    codeviper: CodeViperAPI
  }
}

export {}
