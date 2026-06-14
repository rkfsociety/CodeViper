import type { AgentSettings, AgentStreamEvent, ChatMessage } from '../../src/types'
import { safeReadFile, safeWriteFile, runCommand, buildFileTree } from './services'

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
): AsyncGenerator<OllamaChatChunk> {
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
        if (line) yield JSON.parse(line) as OllamaChatChunk
        newlineIndex = buffer.indexOf('\n')
      }
    }

    const tail = buffer.trim()
    if (tail) yield JSON.parse(tail) as OllamaChatChunk
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

const SYSTEM_PROMPT = `Ты CodeViper — локальный AI-агент для программирования.
Работай только внутри открытого проекта. Отвечай на русском, если пользователь пишет по-русски.
Используй инструменты для чтения, записи файлов, просмотра структуры и запуска команд.
Перед правками сначала прочитай файл. Делай минимальные точечные изменения.
После выполнения задачи кратко объясни, что сделал.`

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
  }
]

export class AgentRunner {
  constructor(
    private settings: AgentSettings,
    private emit: (event: AgentStreamEvent) => void
  ) {}

  async run(history: ChatMessage[], userMessage: string): Promise<void> {
    const messages: OllamaMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        })),
      { role: 'user', content: userMessage }
    ]

    for (let step = 0; step < this.settings.maxSteps; step++) {
      const response = await this.chat(messages)
      const assistantText = response.message?.content ?? ''
      const toolCalls: ToolCall[] = response.message?.tool_calls ?? []

      if (assistantText) {
        messages.push({ role: 'assistant', content: assistantText })
      }

      if (!toolCalls.length) {
        this.emit({ type: 'done' })
        return
      }

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
      const piece = chunk.message?.content
      if (piece) {
        content += piece
        this.emit({ type: 'token', content: piece })
      }

      if (chunk.message?.tool_calls?.length) {
        toolCalls.push(...chunk.message.tool_calls)
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
      default:
        return `Неизвестный инструмент: ${name}`
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
