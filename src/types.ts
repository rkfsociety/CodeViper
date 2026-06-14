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
}

export interface AgentStreamEvent {
  type: 'token' | 'tool_start' | 'tool_end' | 'done' | 'error'
  content?: string
  toolName?: string
  toolInput?: string
  toolOutput?: string
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
  onOllamaPullProgress: (callback: (progress: OllamaPullProgress) => void) => () => void
  runAgent: (
    settings: AgentSettings,
    messages: ChatMessage[],
    userMessage: string
  ) => Promise<void>
  onAgentStream: (callback: (event: AgentStreamEvent) => void) => () => void
  runTerminalCommand: (cwd: string, command: string) => Promise<TerminalResult>
}

declare global {
  interface Window {
    codeviper: CodeViperAPI
  }
}

export {}
