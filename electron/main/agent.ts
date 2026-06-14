import type { AgentSettings, AgentStreamEvent, ChatMessage, MemoryCategory } from '../../src/types'
import { safeReadFile, safeWriteFile, runCommand, buildFileTree } from './services'
import {
  addMemory,
  buildMemoryContext,
  deleteMemory,
  parseReflectionLearnings,
  searchMemories
} from './memory'

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

interface ToolCall {
  function: {
    name: string
    arguments: Record<string, string> | string
  }
}

interface OllamaChatChunk {
  message?: {
    content?: string
    tool_calls?: ToolCall[]
  }
}

async function* readNdjsonLines(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line) yield JSON.parse(line) as Record<string, unknown>
        newlineIndex = buffer.indexOf('\n')
      }
    }

    const tail = buffer.trim()
    if (tail) yield JSON.parse(tail) as Record<string, unknown>
  } finally {
    reader.releaseLock()
  }
}

function parseToolArgs(args: Record<string, string> | string): Record<string, string> {
  if (typeof args === 'string') {
    return JSON.parse(args) as Record<string, string>
  }
  return args
}

const BASE_SYSTEM_PROMPT = `Ты CodeViper — локальный AI-агент для программирования.
Работай только внутри открытого проекта. Отвечай на русском, если пользователь пишет по-русски.
Используй инструменты для чтения, записи файлов, просмотра структуры и запуска команд.
Перед правками сначала прочитай файл. Делай минимальные точечные изменения.
После выполнения задачи кратко объясни, что сделал.

## Самообучение
Ты можешь улучшать себя со временем:
- Используй remember, чтобы сохранить полезный паттерн, ошибку, предпочтение пользователя или правило проекта.
- Используй search_memory, если нужно вспомнить прошлый опыт.
- Используй forget, если знание устарело.
- Обновляй .codeviper/rules.md через write_file для постоянных правил проекта.
- После успешной задачи сохраняй 1–2 важных урока, если они пригодятся в будущем.`

const REFLECTION_PROMPT = `Проанализируй выполненную задачу. Если есть полезные уроки для будущих задач (ошибки, паттерны проекта, предпочтения пользователя, навыки работы), верни JSON-массив до 2 элементов:
[{"content": "краткий урок", "category": "pattern|mistake|preference|project|skill", "tags": ["тег"]}]
Если уроков нет — верни [].
Только JSON, без пояснений.`

function buildSystemPrompt(memoryContext: string): string {
  if (!memoryContext.trim()) return BASE_SYSTEM_PROMPT
  return `${BASE_SYSTEM_PROMPT}\n\n# Память и правила\n${memoryContext}`
}

function mapHistoryMessageToOllama(message: ChatMessage): OllamaMessage | null {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: message.content }
    case 'assistant':
      return { role: 'assistant', content: message.content }
    case 'tool': {
      // UI хранит ▶ (старт) и ✓ (результат); в Ollama нужны только итоги инструментов
      if (message.content.startsWith('▶ ')) return null

      const name = message.toolName ?? 'unknown'
      const output = message.content.startsWith('✓ ')
        ? message.content.slice(message.content.indexOf('\n') + 1)
        : message.content

      return { role: 'tool', content: `Инструмент ${name}:\n${output}` }
    }
    case 'system':
      return { role: 'system', content: message.content }
    default:
      return null
  }
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Показать дерево файлов проекта (до 3 уровней)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Прочитать содержимое файла',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь к файлу' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Записать или перезаписать файл',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь к файлу' },
          content: { type: 'string', description: 'Новое содержимое файла' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Выполнить shell-команду в корне проекта',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Команда для терминала' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Сохранить знание для самообучения (паттерн, ошибка, предпочтение, правило проекта)',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Краткое знание для запоминания' },
          category: {
            type: 'string',
            description: 'pattern | mistake | preference | project | skill'
          },
          tags: { type: 'string', description: 'Теги через запятую (необязательно)' },
          scope: { type: 'string', description: 'global | project (по умолчанию auto)' }
        },
        required: ['content', 'category']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_memory',
      description: 'Найти сохранённые знания по ключевым словам',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Поисковый запрос' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'forget',
      description: 'Удалить устаревшее знание по id',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID записи из remember/search_memory' }
        },
        required: ['id']
      }
    }
  }
]

export class AgentRunner {
  constructor(
    private settings: AgentSettings,
    private emit: (event: AgentStreamEvent) => void
  ) {}

  async run(history: ChatMessage[], userMessage: string): Promise<void> {
    const memoryContext = await buildMemoryContext(this.settings.projectPath, userMessage)
    const messages: OllamaMessage[] = [
      { role: 'system', content: buildSystemPrompt(memoryContext) },
      ...history
        .map(mapHistoryMessageToOllama)
        .filter((m): m is OllamaMessage => m !== null),
      { role: 'user', content: userMessage }
    ]

    let usedTools = false

    for (let step = 0; step < this.settings.maxSteps; step++) {
      const response = await this.chat(messages)
      const assistantText = response.message?.content ?? ''
      const toolCalls: ToolCall[] = response.message?.tool_calls ?? []

      if (assistantText) {
        messages.push({ role: 'assistant', content: assistantText })
      }

      if (!toolCalls.length) {
        if (this.settings.selfLearning !== false) {
          await this.reflectAndLearn(messages, userMessage, usedTools)
        }
        this.emit({ type: 'done' })
        return
      }

      usedTools = true

      for (const call of toolCalls) {
        const name = call.function.name
        const args = parseToolArgs(call.function.arguments ?? {})
        this.emit({
          type: 'tool_start',
          toolName: name,
          toolInput: JSON.stringify(args, null, 2)
        })

        let output = ''
        try {
          output = await this.executeTool(name, args)
        } catch (error) {
          output = `Ошибка: ${error instanceof Error ? error.message : String(error)}`
        }

        this.emit({
          type: 'tool_end',
          toolName: name,
          toolOutput: output
        })

        messages.push({
          role: 'tool',
          content: `Инструмент ${name}:\n${output}`
        })
      }
    }

    this.emit({
      type: 'error',
      content: `Достигнут лимит шагов агента (${this.settings.maxSteps}). Уточните задачу или увеличьте лимит.`
    })
    this.emit({ type: 'done' })
  }

  private async chat(messages: OllamaMessage[]) {
    const res = await fetch(`${this.settings.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.settings.model,
        messages,
        tools: TOOLS,
        stream: true
      })
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Ollama: ${res.status} ${text}`)
    }

    if (!res.body) {
      throw new Error('Ollama: пустой ответ (нет body)')
    }

    let content = ''
    const toolCalls: ToolCall[] = []

    for await (const chunk of readNdjsonLines(res.body)) {
      const message = chunk.message as OllamaChatChunk['message'] | undefined
      const piece = message?.content
      if (piece) {
        content += piece
        this.emit({ type: 'token', content: piece })
      }

      if (message?.tool_calls?.length) {
        toolCalls.push(...message.tool_calls)
      }
    }

    return {
      message: {
        content: content || undefined,
        tool_calls: toolCalls.length ? toolCalls : undefined
      }
    }
  }

  private async executeTool(name: string, args: Record<string, string>): Promise<string> {
    const { projectPath } = this.settings

    switch (name) {
      case 'list_directory': {
        const tree = await buildFileTree(projectPath)
        return JSON.stringify(tree, null, 2)
      }
      case 'read_file': {
        return safeReadFile(projectPath, args.path)
      }
      case 'write_file': {
        await safeWriteFile(projectPath, args.path, args.content)
        return `Файл записан: ${args.path}`
      }
      case 'run_command': {
        const result = await runCommand(projectPath, args.command)
        return [
          `exit: ${result.exitCode}`,
          result.stdout ? `stdout:\n${result.stdout}` : '',
          result.stderr ? `stderr:\n${result.stderr}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      }
      case 'remember': {
        const entry = await addMemory(projectPath, {
          content: args.content,
          category: args.category as MemoryCategory,
          tags: args.tags,
          source: args.source,
          scope: args.scope === 'project' || args.scope === 'global' ? args.scope : undefined
        })
        this.emit({
          type: 'learning_saved',
          content: entry.content,
          memoryId: entry.id
        })
        return `Запомнено [${entry.category}/${entry.scope}]: ${entry.content} (id: ${entry.id})`
      }
      case 'search_memory': {
        const results = await searchMemories(projectPath, args.query, 10)
        return JSON.stringify(results, null, 2)
      }
      case 'forget': {
        const removed = await deleteMemory(projectPath, args.id)
        return removed ? `Забыто: ${args.id}` : `Запись не найдена: ${args.id}`
      }
      default:
        return `Неизвестный инструмент: ${name}`
    }
  }

  private async reflectAndLearn(
    messages: OllamaMessage[],
    userMessage: string,
    usedTools: boolean
  ): Promise<void> {
    if (!usedTools) return

    try {
      const res = await fetch(`${this.settings.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.settings.model,
          messages: [...messages, { role: 'user', content: REFLECTION_PROMPT }],
          stream: false
        })
      })

      if (!res.ok) return

      const data = (await res.json()) as { message?: { content?: string } }
      const learnings = parseReflectionLearnings(data.message?.content ?? '')

      for (const learning of learnings) {
        const entry = await addMemory(this.settings.projectPath, {
          ...learning,
          source: userMessage.slice(0, 120)
        })
        this.emit({
          type: 'learning_saved',
          content: entry.content,
          memoryId: entry.id
        })
      }
    } catch {
      // рефлексия необязательна
    }
  }
}

export async function fetchOllamaModels(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/tags`)
  if (!res.ok) throw new Error('Ollama недоступна')
  const data = (await res.json()) as {
    models?: Array<{ name: string; size: number; modified_at: string }>
  }
  return (data.models ?? []).map((m) => ({
    name: m.name,
    size: m.size,
    modifiedAt: m.modified_at
  }))
}

export async function pingOllama(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`)
    return res.ok
  } catch {
    return false
  }
}

export interface OllamaPullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
}

export async function pullOllamaModel(
  baseUrl: string,
  model: string,
  onProgress: (progress: OllamaPullProgress) => void
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama pull: ${res.status} ${text}`)
  }

  if (!res.body) {
    throw new Error('Ollama: пустой ответ при скачивании')
  }

  for await (const chunk of readNdjsonLines(res.body)) {
    onProgress({
      status: String(chunk.status ?? ''),
      digest: chunk.digest as string | undefined,
      total: chunk.total as number | undefined,
      completed: chunk.completed as number | undefined
    })
  }
}
