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
import { SELF_IMPROVEMENT_MODE_PROMPT } from '../../shared/selfImprovement'
import { DEEP_REASONING_PROMPT, isThinkingModel } from '../../shared/reasoning'
import {
  computeContextUsage,
  estimateMessageChars,
  estimateTokensFromChars,
  MAX_TOOL_MESSAGE_CHARS
} from '../../shared/contextLimits'
import { compressContextMessages } from './contextSummarizer'
import type { ProviderConfig } from '../../shared/modelProvider'

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** Нативные tool calls ассистента (хранятся для cloud-провайдеров). */
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  /** ID вызова инструмента для tool-результатов (cloud-провайдеры). */
  tool_call_id?: string
}

const BASE_SYSTEM_PROMPT = `Ты CodeViper — локальный AI-агент для программирования.
Пользователь уже открыл папку проекта — корень и структура указаны ниже. Не проси указать путь к проекту или папке.
При запросах «изучи код», «посмотри проект», «улучши интерфейс» и подобных **сразу вызывай инструменты** — не давай пользователю инструкций «сделайте сами».
Не советуй Figma/Sketch/Material-UI вместо правки кода. Не выводи tool calls JSON-текстом — только через механизм tool calling. Не оборачивай текст в \`\`\`json.
Работай только внутри открытого проекта. Отвечай на русском, если пользователь пишет по-русски.
Перед правками сначала прочитай файл. Предпочитай edit_file (точечная замена) write_file (полная перезапись).
После выполнения задачи кратко объясни, что сделал.

КРИТИЧНО — честность:
- Не утверждай, что файл/правка/команда выполнены, если инструмент не был вызван или вернул ошибку.
- Все мутации (write_file, edit_file, create_file, create_skill, run_command и др.) — только через tool calling, не текстом.

## Навыки (skills)
- **create_skill** сохраняет **глобальный** навык → **%APPDATA%/CodeViper/ViperSkills.md** (переживает перезапуск и смену проекта)
- При совпадении **триггеров** с запросом инструкции навыка **автоматически** попадают в контекст — выполняй их
- update_skill / read_skill / read_skill_data / write_skill_data — управление навыком
- Перед create_skill вызови list_skills — не дублируй существующие

Обновляй .codeviper/rules.md через write_file для правил рабочего проекта.`

const CLARIFY_PROMPT = `## Режим уточняющих вопросов
Если задача **неоднозначна** или не хватает важных деталей (что именно менять, где, какой ожидаемый результат, какой стек/формат) — **сначала задай 1–3 коротких уточняющих вопроса обычным текстом и остановись**, не вызывая инструменты и не меняя код. Только когда всё ясно — приступай к выполнению. Не переспрашивай по очевидным вещам.`

export const MAX_PROJECT_TREE_CHARS = 6000

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
git_status / git_diff / git_log — только чтение, в корне git-репозитория проекта.
read_file / write_file / create_file / edit_file / append_file принимают абсолютные пути к файлам внутри проекта.

Структура (до 3 уровней, без node_modules и .git):
${treeText || '(пусто)'}`
}

function buildSystemPrompt(
  projectPath: string,
  memoryContext: string,
  projectTreeText: string,
  selfImproveMode = false,
  clarifyMode = false,
  cotReasoning = false
): string {
  const parts = [BASE_SYSTEM_PROMPT, buildSelfEditContext()]

  // Для не-think моделей усиливаем рассуждение через промпт.
  if (cotReasoning) {
    parts.push(DEEP_REASONING_PROMPT)
  }

  // Уточняющие вопросы несовместимы с автономным самоулучшением.
  if (clarifyMode && !selfImproveMode) {
    parts.push(CLARIFY_PROMPT)
  }

  if (selfImproveMode) {
    parts.push(SELF_IMPROVEMENT_MODE_PROMPT)
  }

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

function estimateMessageCharsLocal(message: OllamaMessage): number {
  return estimateMessageChars(message.content)
}

export function estimateTokens(charCount: number): number {
  return estimateTokensFromChars(charCount)
}

export interface PrepareAgentContextOptions {
  ollamaUrl?: string
  providerConfig?: ProviderConfig
  signal?: AbortSignal
  clarifyMode?: boolean
  deepReasoning?: boolean
  summarizeModel?: string
}

function section(
  id: string,
  title: string,
  content: string,
  subtitle?: string
): AgentContextSection {
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
  model: string,
  selfImproveMode = false,
  options: PrepareAgentContextOptions = {}
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

  // Для think-моделей рассуждение включается нативно (think:true), промпт не нужен.
  // Для облачных провайдеров (DeepSeek, OpenAI) глубокое рассуждение уже встроено,
  // дополнительный промпт только тратит токены (~500 токенов на CoT).
  const isCloudProvider = options.providerConfig?.type && options.providerConfig.type !== 'ollama'
  const cotReasoning = !!options.deepReasoning && !isThinkingModel(model) && !isCloudProvider
  const systemContent = buildSystemPrompt(
    projectPath,
    memorySkillsContext,
    projectTreeText,
    selfImproveMode,
    options.clarifyMode,
    cotReasoning
  )

  const mappedHistory = history
    .map(mapHistoryMessageToOllama)
    .filter((m): m is OllamaMessage => m !== null)

  const toolsJsonChars = JSON.stringify(AGENT_TOOLS).length
  const initialMessages: OllamaMessage[] = [
    { role: 'system', content: systemContent },
    ...mappedHistory,
    { role: 'user', content: userMessage }
  ]

  const compressed = await compressContextMessages({
    messages: initialMessages,
    model,
    summarizeModel: options.summarizeModel,
    toolsJsonChars,
    ollamaUrl: options.ollamaUrl,
    providerConfig: options.providerConfig,
    signal: options.signal
  })

  const ollamaMessages = compressed.messages
  if (compressed.truncated && !compressed.summarized) {
    const systemIndex = ollamaMessages.findIndex((message) => message.role === 'system')
    if (systemIndex >= 0) {
      ollamaMessages[systemIndex] = {
        role: 'system',
        content: `${ollamaMessages[systemIndex].content}\n\n[Часть старой истории чата опущена из-за лимита контекста. Опирайся на последние сообщения и сводку.]`
      }
    }
  }

  if (compressed.summarized) {
    const systemIndex = ollamaMessages.findIndex((message) => message.role === 'system')
    if (systemIndex >= 0) {
      ollamaMessages[systemIndex] = {
        role: 'system',
        content: `${ollamaMessages[systemIndex].content}\n\n[Старая история чата суммаризирована автоматически — опирайся на сводку и последние сообщения.]`
      }
    }
  }

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
      section(
        'memory-skills',
        'ViperMemory и навыки',
        memorySkillsContext,
        'Релевантные записи и skills'
      )
    )
  }

  if (selfImproveMode) {
    sections.push(
      section(
        'self-improve',
        'Автономное самоулучшение',
        SELF_IMPROVEMENT_MODE_PROMPT,
        'До выполнения всех пунктов'
      )
    )
  }

  sections.push(
    section(
      'tools',
      `Инструменты (${AGENT_TOOLS.length})`,
      toolsContent,
      'Схема function calling для Ollama'
    )
  )

  const messages = ollamaMessages.map(messagePreview)
  const totalChars =
    ollamaMessages.reduce((sum, message) => sum + estimateMessageCharsLocal(message), 0) +
    toolsJsonChars
  const usage = computeContextUsage(totalChars, model)

  return {
    model,
    generatedAt: new Date().toISOString(),
    totalChars,
    estimatedTokens: usage.estimatedTokens,
    contextUsagePercent: usage.usagePercent,
    contextLimitTokens: usage.limitTokens,
    historyTruncated: compressed.truncated,
    historySummarized: compressed.summarized,
    droppedMessageCount: compressed.droppedMessageCount,
    toolCount: AGENT_TOOLS.length,
    sections,
    messages
  }
}

export async function prepareAgentRunContext(
  projectPath: string,
  history: ChatMessage[],
  userMessage: string,
  model: string,
  selfImproveMode = false,
  options: PrepareAgentContextOptions = {}
): Promise<{ messages: OllamaMessage[]; preview: AgentContextPreview }> {
  const preview = await buildAgentContextPreview(
    projectPath,
    history,
    userMessage,
    model,
    selfImproveMode,
    options
  )
  const messages: OllamaMessage[] = preview.messages.map((item) => ({
    role: item.role,
    content: item.content
  }))

  return { messages, preview }
}
