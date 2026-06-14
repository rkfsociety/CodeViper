import type {
  AgentSettings,
  AgentStreamPayload,
  ChatMessage,
  FileNode,
  MemoryCategory
} from '../../src/types'
import { extractEmbeddedToolCalls, looksLikeEmbeddedToolCall, sanitizeAssistantContent } from '../../shared/toolCalls'
import {
  claimsActionCompleted,
  MUTATING_TOOLS,
  taskLikelyNeedsMutation,
  TOOL_VERIFICATION_FAILED_MESSAGE,
  TOOL_VERIFICATION_NUDGE
} from '../../shared/actionVerification'
import {
  buildSelfEditContext,
  getCodeViperSourceRoot,
  readCodeViperFile,
  runCodeViperCommand,
  writeCodeViperFile
} from './codeviperSource'
import { safeReadFile, safeWriteFile, runCommand, buildFileTree } from './services'
import { readNdjsonLines } from './ndjson'
import {
  addMemory,
  buildMemoryContext,
  deleteMemory,
  parseReflectionLearnings,
  searchMemories
} from './memory'
import {
  buildSkillsContext,
  createSkill,
  deleteSkill,
  getSkill,
  listSkills,
  readSkillData,
  touchSkill,
  updateSkill,
  writeSkillData
} from './skills'

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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function parseToolArgs(args: Record<string, string> | string): Record<string, string> {
  if (typeof args === 'string') {
    return JSON.parse(args) as Record<string, string>
  }
  return args
}

const BASE_SYSTEM_PROMPT = `Ты CodeViper — локальный AI-агент для программирования.
Пользователь уже открыл папку проекта — корень и структура указаны ниже. Не проси указать путь к проекту или папке.
При запросах «изучи код», «посмотри проект» и подобных сразу используй list_directory, read_file и другие инструменты.
Не выводи вызовы инструментов JSON-текстом в ответе — только через механизм tool calling.
Не оборачивай обычный текст в блоки \`\`\`json — отвечай обычным текстом.
Работай только внутри открытого проекта. Отвечай на русском, если пользователь пишет по-русски.
Используй инструменты для чтения, записи файлов, просмотра структуры и запуска команд.
Перед правками сначала прочитай файл. Делай минимальные точечные изменения.
После выполнения задачи кратко объясни, что сделал.

КРИТИЧНО — честность о действиях:
- Запрещено утверждать, что файл/skill/правка/команда выполнены, если ты НЕ вызвал инструмент и не получил успешный ответ.
- write_file / write_codeviper_file / create_skill / run_command / run_codeviper_command / remember — только через tool calling, не текстом.
- Если инструмент ещё не вызывал — скажи, что действие не выполнено, и вызови инструмент.

## Самообучение, навыки и саморедактирование

### Навыки (skills) — инструкции без правки кода
- **create_skill** / **update_skill** — поведение агента; для «улучши себя» часто достаточно skill с scope **global**
- **read_skill** / **read_skill_data** / **write_skill_data** — работа по навыку

### Саморедактирование — правка исходников CodeViper
Ты можешь менять **свой** код через read_codeviper_file / write_codeviper_file / run_codeviper_command (см. раздел «Исходники CodeViper» в промпте).
- Перед правкой: read_codeviper_file, минимальный diff
- После правки: run_codeviper_command → \`npm run typecheck\` и \`npm test\`
- Изменения electron/main/* требуют **перезапуска** приложения

Если пользователь просит «улучши себя», «сделай skill», «научись …»:
1. list_skills — не дублируй
2. Для поведения: **create_skill** (global). Для логики/инструментов: правка кода через write_codeviper_file
3. Не утверждай об успехе без вызова инструментов

Обновляй .codeviper/rules.md через write_file для правил **рабочего проекта** в чате.`

const MAX_PROJECT_TREE_CHARS = 6000
const MAX_HISTORY_CHARS = 28_000
const MIN_RECENT_MESSAGES = 8
const MAX_TOOL_MESSAGE_CHARS = 4_000

function formatFileTree(nodes: FileNode[], prefix = ''): string {
  const lines: string[] = []

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const last = i === nodes.length - 1
    const branch = last ? '└── ' : '├── '
    lines.push(`${prefix}${branch}${node.name}${node.isDirectory ? '/' : ''}`)

    if (node.children?.length) {
      lines.push(formatFileTree(node.children, `${prefix}${last ? '    ' : '│   '}`))
    }
  }

  return lines.join('\n')
}

function buildProjectContext(projectPath: string, treeText: string): string {
  return `# Открытый проект
Корень: ${projectPath}
run_command выполняется в корне проекта.
read_file / write_file принимают абсолютные пути к файлам внутри проекта.

Структура (до 3 уровней, без node_modules и .git):
${treeText || '(пусто)'}`
}

function buildSystemPrompt(
  projectPath: string,
  memoryContext: string,
  projectTreeText: string
): string {
  const parts = [BASE_SYSTEM_PROMPT, buildSelfEditContext()]

  if (projectPath.trim()) {
    parts.push(buildProjectContext(projectPath, projectTreeText))
  }

  if (memoryContext.trim()) {
    parts.push(`# Память, правила и навыки\n${memoryContext}`)
  }

  return parts.join('\n\n')
}

async function buildAgentContext(projectPath: string, taskHint: string): Promise<string> {
  const memoryContext = await buildMemoryContext(projectPath, taskHint)
  const skillsContext = await buildSkillsContext(projectPath, taskHint)
  return [memoryContext, skillsContext].filter(Boolean).join('\n\n')
}

const REFLECTION_PROMPT = `Проанализируй выполненную задачу. Если есть полезные уроки для будущих задач (ошибки, паттерны проекта, предпочтения пользователя, навыки работы), верни JSON-массив до 2 элементов:
[{"content": "краткий урок", "category": "pattern|mistake|preference|project|skill", "tags": ["тег"]}]
Если уроков нет — верни [].
Только JSON, без пояснений.`

function mapHistoryMessageToOllama(message: ChatMessage): OllamaMessage | null {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: message.content }
    case 'assistant': {
      const cleaned = sanitizeAssistantContent(message.content)
      if (!cleaned || looksLikeEmbeddedToolCall(message.content)) return null
      return { role: 'assistant', content: cleaned }
    }
    case 'tool': {
      // UI хранит ▶ (старт) и ✓ (результат); в Ollama нужны только итоги инструментов
      if (message.content.startsWith('▶ ')) return null

      const name = message.toolName ?? 'unknown'
      let output = message.toolOutput
      if (!output) {
        output = message.content.startsWith('✓ ')
          ? message.content.slice(message.content.indexOf('\n') + 1)
          : message.content
      }

      if (output.length > MAX_TOOL_MESSAGE_CHARS) {
        output = `${output.slice(0, MAX_TOOL_MESSAGE_CHARS)}\n… (обрезано)`
      }

      return { role: 'tool', content: `Инструмент ${name}:\n${output}` }
    }
    case 'system':
      return { role: 'system', content: message.content }
    default:
      return null
  }
}

function estimateMessageChars(message: OllamaMessage): number {
  return message.content.length + 24
}

function trimHistoryForContext(history: ChatMessage[]): {
  messages: OllamaMessage[]
  truncated: boolean
} {
  let mapped = history
    .map(mapHistoryMessageToOllama)
    .filter((m): m is OllamaMessage => m !== null)

  let truncated = false

  while (mapped.length > MIN_RECENT_MESSAGES) {
    const total = mapped.reduce((sum, message) => sum + estimateMessageChars(message), 0)
    if (total <= MAX_HISTORY_CHARS) break

    const dropCount = Math.min(2, mapped.length - MIN_RECENT_MESSAGES)
    mapped = mapped.slice(dropCount)
    truncated = true
  }

  return { messages: mapped, truncated }
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
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: 'Список навыков (skills), которые агент создал для себя',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_skill',
      description: 'Прочитать полную инструкцию навыка по id',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID навыка из list_skills' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_skill',
      description: 'Создать новый навык (по запросу пользователя): инструкции поведения, триггеры',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Название навыка' },
          description: { type: 'string', description: 'Кратко, зачем нужен' },
          instructions: {
            type: 'string',
            description: 'Markdown: когда применять, шаги, формат ответа, работа с skill-data'
          },
          triggers: {
            type: 'string',
            description: 'Слова-триггеры через запятую (todo, задачи, план...)'
          },
          scope: { type: 'string', description: 'global — для всего агента; project — для проекта в чате' },
          id: { type: 'string', description: 'Необязательный id (slug)' }
        },
        required: ['name', 'description', 'instructions']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_skill',
      description: 'Обновить существующий навык',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID навыка' },
          name: { type: 'string' },
          description: { type: 'string' },
          instructions: { type: 'string' },
          triggers: { type: 'string', description: 'Триггеры через запятую' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_skill',
      description: 'Удалить навык по id',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID навыка' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_skill_data',
      description: 'Прочитать JSON-данные навыка (todo, состояние и т.д.)',
      parameters: {
        type: 'object',
        properties: {
          skill_id: { type: 'string', description: 'ID навыка' }
        },
        required: ['skill_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_skill_data',
      description: 'Записать JSON-данные навыка',
      parameters: {
        type: 'object',
        properties: {
          skill_id: { type: 'string', description: 'ID навыка' },
          content: { type: 'string', description: 'JSON-строка' }
        },
        required: ['skill_id', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_codeviper_directory',
      description: 'Дерево исходников CodeViper (своё приложение). Для саморедактирования.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_codeviper_file',
      description: 'Прочитать файл исходников CodeViper по абсолютному пути',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь внутри исходников CodeViper' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_codeviper_file',
      description: 'Записать файл исходников CodeViper (саморедактирование кода агента)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь внутри исходников CodeViper' },
          content: { type: 'string', description: 'Новое содержимое файла' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_codeviper_command',
      description: 'Shell-команда в корне исходников CodeViper (npm test, typecheck, build)',
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
    private projectPath: string,
    private emit: (event: AgentStreamPayload) => void,
    private signal?: AbortSignal
  ) {}

  private throwIfAborted(): void {
    if (this.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
  }

  private handleAbort(): void {
    this.emit({ type: 'error', content: 'Остановлено пользователем' })
    this.emit({ type: 'done' })
  }

  async run(history: ChatMessage[], userMessage: string): Promise<void> {
    this.throwIfAborted()

    const { projectPath } = this
    const agentContext = await buildAgentContext(projectPath, userMessage)
    this.throwIfAborted()

    let projectTreeText = ''
    if (projectPath.trim()) {
      const tree = await buildFileTree(projectPath)
      projectTreeText = formatFileTree(tree)
      if (projectTreeText.length > MAX_PROJECT_TREE_CHARS) {
        projectTreeText = `${projectTreeText.slice(0, MAX_PROJECT_TREE_CHARS)}\n… (обрезано)`
      }
    }

    const { messages: trimmedHistory, truncated } = trimHistoryForContext(history)
    let systemContent = buildSystemPrompt(projectPath, agentContext, projectTreeText)
    if (truncated) {
      systemContent +=
        '\n\n[Часть старой истории чата опущена из-за лимита контекста модели. Опирайся на последние сообщения.]'
    }

    const messages: OllamaMessage[] = [
      { role: 'system', content: systemContent },
      ...trimmedHistory,
      { role: 'user', content: userMessage }
    ]

    let usedTools = false
    const mutatingToolsUsed = new Set<string>()
    let verificationRetries = 0
    let verificationNoticeSent = false
    let requireToolNext = false
    const MAX_VERIFICATION_RETRIES = 1

    try {
      for (let step = 0; step < this.settings.maxSteps; step++) {
        this.throwIfAborted()

        let response
        try {
          response = await this.chat(messages, { requireTool: requireToolNext })
        } catch (error) {
          if (isAbortError(error)) {
            this.handleAbort()
            return
          }
          throw error
        }
        requireToolNext = false

        const assistantText = sanitizeAssistantContent(response.message?.content ?? '')
        const toolCalls: ToolCall[] = response.message?.tool_calls ?? []

        if (assistantText) {
          messages.push({ role: 'assistant', content: assistantText })
        }

        if (!toolCalls.length) {
          const mutationTask = taskLikelyNeedsMutation(userMessage)
          const noMutatingToolsYet = mutatingToolsUsed.size === 0
          const shouldRetryWithTools =
            mutationTask &&
            noMutatingToolsYet &&
            verificationRetries < MAX_VERIFICATION_RETRIES &&
            (claimsActionCompleted(assistantText) || assistantText.length > 0)

          if (shouldRetryWithTools) {
            verificationRetries += 1
            if (assistantText) {
              messages.pop()
            }
            this.emit({ type: 'clear_draft' })
            if (!verificationNoticeSent) {
              verificationNoticeSent = true
              this.emit({
                type: 'error',
                content:
                  '⚠️ Модель ответила текстом без инструментов — повторяю с обязательным tool call…'
              })
            }
            messages.push({ role: 'user', content: TOOL_VERIFICATION_NUDGE })
            requireToolNext = true
            continue
          }

          if (mutationTask && noMutatingToolsYet && verificationRetries >= MAX_VERIFICATION_RETRIES) {
            if (assistantText) {
              messages.pop()
            }
            this.emit({ type: 'clear_draft' })
            this.emit({ type: 'error', content: TOOL_VERIFICATION_FAILED_MESSAGE })
            this.emit({ type: 'done' })
            return
          }

          if (assistantText) {
            this.emit({ type: 'assistant', content: assistantText })
          }
          if (this.settings.selfLearning !== false) {
            await this.reflectAndLearn(messages, userMessage, usedTools)
          }
          this.emit({ type: 'done' })
          return
        }

        usedTools = true

        for (const call of toolCalls) {
          this.throwIfAborted()

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

          if (MUTATING_TOOLS.has(name)) {
            mutatingToolsUsed.add(name)
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
    } catch (error) {
      if (isAbortError(error)) {
        this.handleAbort()
        return
      }
      throw error
    }
  }

  private async chat(messages: OllamaMessage[], options?: { requireTool?: boolean }) {
    const res = await fetch(`${this.settings.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.settings.model,
        messages,
        tools: TOOLS,
        stream: true,
        ...(options?.requireTool ? { tool_choice: 'required' as const } : {})
      }),
      signal: this.signal
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

    for await (const chunk of readNdjsonLines(res.body, this.signal)) {
      const message = chunk.message as OllamaChatChunk['message'] | undefined
      const piece = message?.content
      if (piece) {
        content += piece
        const visible = sanitizeAssistantContent(content)
        const embedded = extractEmbeddedToolCalls(content)
        const isPureToolCall = embedded.toolCalls.length > 0 && !embedded.content.trim()
        if (!isPureToolCall && visible) {
          this.emit({ type: 'token', content: piece })
        }
      }

      if (message?.tool_calls?.length) {
        toolCalls.push(...message.tool_calls)
      }
    }

    const embedded = extractEmbeddedToolCalls(content)
    content = sanitizeAssistantContent(embedded.content)
    for (const call of embedded.toolCalls) {
      toolCalls.push({
        function: {
          name: call.name,
          arguments: call.arguments as Record<string, string>
        }
      })
    }

    return {
      message: {
        content: content.trim() || undefined,
        tool_calls: toolCalls.length ? toolCalls : undefined
      }
    }
  }

  private async executeTool(name: string, args: Record<string, string>): Promise<string> {
    const { projectPath } = this

    switch (name) {
      case 'list_directory': {
        const tree = await buildFileTree(projectPath)
        return formatFileTree(tree) || '(пусто)'
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
      case 'list_skills': {
        const skills = await listSkills(projectPath)
        return JSON.stringify(skills, null, 2)
      }
      case 'read_skill': {
        const skill = await getSkill(projectPath, args.id)
        if (!skill) return `Навык не найден: ${args.id}`
        await touchSkill(projectPath, skill.id)
        return JSON.stringify(skill, null, 2)
      }
      case 'create_skill': {
        const skill = await createSkill(projectPath, {
          name: args.name,
          description: args.description,
          instructions: args.instructions,
          triggers: args.triggers,
          scope: args.scope === 'project' || args.scope === 'global' ? args.scope : undefined,
          id: args.id
        })
        this.emit({
          type: 'skill_saved',
          content: skill.name,
          skillId: skill.id
        })
        return `Навык создан: ${skill.name} (id: ${skill.id}, scope: ${skill.scope})`
      }
      case 'update_skill': {
        const skill = await updateSkill(projectPath, args.id, {
          name: args.name,
          description: args.description,
          instructions: args.instructions,
          triggers: args.triggers
        })
        if (!skill) return `Навык не найден: ${args.id}`
        this.emit({
          type: 'skill_saved',
          content: skill.name,
          skillId: skill.id
        })
        return `Навык обновлён: ${skill.name} (id: ${skill.id})`
      }
      case 'delete_skill': {
        const removed = await deleteSkill(projectPath, args.id)
        return removed ? `Навык удалён: ${args.id}` : `Навык не найден: ${args.id}`
      }
      case 'read_skill_data': {
        const data = await readSkillData(projectPath, args.skill_id)
        if (!data) return `Навык не найден: ${args.skill_id}`
        return data.content
      }
      case 'write_skill_data': {
        const ok = await writeSkillData(projectPath, args.skill_id, args.content)
        return ok ? `Данные навыка записаны: ${args.skill_id}` : `Навык не найден: ${args.skill_id}`
      }
      case 'list_codeviper_directory': {
        const root = getCodeViperSourceRoot()
        const tree = await buildFileTree(root)
        return formatFileTree(tree) || '(пусто)'
      }
      case 'read_codeviper_file': {
        return readCodeViperFile(args.path)
      }
      case 'write_codeviper_file': {
        await writeCodeViperFile(args.path, args.content)
        return `Файл CodeViper записан: ${args.path}`
      }
      case 'run_codeviper_command': {
        const result = await runCodeViperCommand(args.command)
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
        }),
        signal: this.signal
      })

      if (!res.ok) return

      const data = (await res.json()) as { message?: { content?: string } }
      const learnings = parseReflectionLearnings(data.message?.content ?? '')

      for (const learning of learnings) {
        const entry = await addMemory(this.projectPath, {
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
