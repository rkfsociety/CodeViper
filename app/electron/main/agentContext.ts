import type {
  AgentContextMessagePreview,
  AgentContextPreview,
  AgentContextSection,
  ChatMessage,
  FileNode
} from '../../src/types'
import { looksLikeEmbeddedToolCall, sanitizeAssistantContent } from '../../shared/toolCalls'
import { buildSelfEditContext } from './codeviperSource'
import { buildMemoryContext } from './memory'
import { buildSkillsContext } from './skills'
import { buildFileTree } from './services'
import { AGENT_TOOLS, formatAgentToolsSummary } from './agentTools'

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
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
- Встроенный навык **viper-memory** (read_skill) — долгосрочная память в **ViperMemory.md**, инструменты remember / search_memory / forget

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

export const MAX_PROJECT_TREE_CHARS = 6000
const MAX_HISTORY_CHARS = 28_000
const MIN_RECENT_MESSAGES = 8
const MAX_TOOL_MESSAGE_CHARS = 4_000

export function formatFileTree(nodes: FileNode[], prefix = ''): string {
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

export function trimHistoryForContext(history: ChatMessage[]): {
  messages: OllamaMessage[]
  truncated: boolean
  droppedMessageCount: number
} {
  const allMapped = history
    .map(mapHistoryMessageToOllama)
    .filter((m): m is OllamaMessage => m !== null)

  let mapped = allMapped
  let truncated = false

  while (mapped.length > MIN_RECENT_MESSAGES) {
    const total = mapped.reduce((sum, message) => sum + estimateMessageChars(message), 0)
    if (total <= MAX_HISTORY_CHARS) break

    const dropCount = Math.min(2, mapped.length - MIN_RECENT_MESSAGES)
    mapped = mapped.slice(dropCount)
    truncated = true
  }

  return {
    messages: mapped,
    truncated,
    droppedMessageCount: allMapped.length - mapped.length
  }
}

export function estimateTokens(charCount: number): number {
  return Math.ceil(charCount / 3.5)
}

function section(id: string, title: string, content: string, subtitle?: string): AgentContextSection {
  return {
    id,
    title,
    subtitle,
    content,
    charCount: content.length
  }
}

function messagePreview(message: OllamaMessage, index: number): AgentContextMessagePreview {
  const roleLabels: Record<OllamaMessage['role'], string> = {
    system: 'Системный промпт',
    user: 'Пользователь',
    assistant: 'Ассистент',
    tool: 'Инструмент'
  }

  let label = `${index + 1}. ${roleLabels[message.role]}`
  if (message.role === 'tool') {
    const toolMatch = message.content.match(/^Инструмент ([^:]+):/)
    if (toolMatch) label += ` · ${toolMatch[1]}`
  }

  return {
    role: message.role,
    label,
    content: message.content,
    charCount: message.content.length
  }
}

export async function buildAgentContextPreview(
  projectPath: string,
  history: ChatMessage[],
  userMessage: string,
  model: string
): Promise<AgentContextPreview> {
  const memorySkillsContext = await buildAgentContext(projectPath, userMessage)

  let projectTreeText = ''
  if (projectPath.trim()) {
    const tree = await buildFileTree(projectPath)
    projectTreeText = formatFileTree(tree)
    if (projectTreeText.length > MAX_PROJECT_TREE_CHARS) {
      projectTreeText = `${projectTreeText.slice(0, MAX_PROJECT_TREE_CHARS)}\n… (обрезано)`
    }
  }

  const { messages: trimmedHistory, truncated, droppedMessageCount } = trimHistoryForContext(history)
  let systemContent = buildSystemPrompt(projectPath, memorySkillsContext, projectTreeText)
  if (truncated) {
    systemContent +=
      '\n\n[Часть старой истории чата опущена из-за лимита контекста модели. Опирайся на последние сообщения.]'
  }

  const ollamaMessages: OllamaMessage[] = [
    { role: 'system', content: systemContent },
    ...trimmedHistory,
    { role: 'user', content: userMessage }
  ]

  const selfEditContent = buildSelfEditContext()
  const projectContent = projectPath.trim() ? buildProjectContext(projectPath, projectTreeText) : ''
  const toolsContent = formatAgentToolsSummary()

  const sections: AgentContextSection[] = [
    section('instructions', 'Инструкции агента', BASE_SYSTEM_PROMPT),
    section('self-edit', 'Саморедактирование', selfEditContent)
  ]

  if (projectContent) {
    sections.push(section('project', 'Проект', projectContent, projectPath))
  }

  if (memorySkillsContext.trim()) {
    sections.push(
      section('memory-skills', 'ViperMemory и навыки', memorySkillsContext, 'Релевантные записи и skills')
    )
  }

  sections.push(
    section('tools', `Инструменты (${AGENT_TOOLS.length})`, toolsContent, 'Схема function calling для Ollama')
  )

  const messages = ollamaMessages.map(messagePreview)
  const toolsJsonChars = JSON.stringify(AGENT_TOOLS).length
  const totalChars =
    ollamaMessages.reduce((sum, message) => sum + estimateMessageChars(message), 0) + toolsJsonChars

  return {
    model,
    generatedAt: new Date().toISOString(),
    totalChars,
    estimatedTokens: estimateTokens(totalChars),
    historyTruncated: truncated,
    droppedMessageCount,
    toolCount: AGENT_TOOLS.length,
    sections,
    messages
  }
}

export async function prepareAgentRunContext(
  projectPath: string,
  history: ChatMessage[],
  userMessage: string,
  model: string
): Promise<{ messages: OllamaMessage[]; preview: AgentContextPreview }> {
  const preview = await buildAgentContextPreview(projectPath, history, userMessage, model)
  const messages: OllamaMessage[] = preview.messages.map((item) => ({
    role: item.role,
    content: item.content
  }))

  return { messages, preview }
}
