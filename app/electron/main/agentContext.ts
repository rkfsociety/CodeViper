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
}

const BASE_SYSTEM_PROMPT = `Ты CodeViper — локальный AI-агент для программирования.
Пользователь уже открыл папку проекта — корень и структура указаны ниже. Не проси указать путь к проекту или папке.
При запросах «изучи код», «посмотри проект», «улучши интерфейс» и подобных **сразу вызывай инструменты** — не давай пользователю инструкций «сделайте сами».
Запрещено советовать Figma, Sketch, Material-UI или «проведите тестирование с пользователями» вместо правки кода в проекте.
Не выводи вызовы инструментов JSON-текстом в ответе — только через механизм tool calling.
Не оборачивай обычный текст в блоки \`\`\`json — отвечай обычным текстом.
Работай только внутри открытого проекта. Отвечай на русском, если пользователь пишет по-русски.
Используй инструменты для чтения, записи файлов, просмотра структуры и запуска команд.
**Файлы:** create_file — новый файл; edit_file — точечная замена (предпочтительно для правок); write_file — полная перезапись; append_file — дописать в конец.
**Поиск:** find_files — по имени/glob; grep_files — текст в содержимом; затем read_file.
**Git (только чтение):** git_status, git_diff, git_log — безопаснее, чем run_command для просмотра истории и изменений.
Перед правками сначала прочитай файл. Делай минимальные точечные изменения через edit_file.
После выполнения задачи кратко объясни, что сделал.

КРИТИЧНО — честность о действиях:
- Запрещено утверждать, что файл/skill/правка/команда выполнены, если ты НЕ вызвал инструмент и не получил успешный ответ.
- write_file / create_file / edit_file / append_file / write_codeviper_file / create_codeviper_file / edit_codeviper_file / create_skill / run_command / run_codeviper_command / remember — только через tool calling, не текстом.
- Если инструмент ещё не вызывал — скажи, что действие не выполнено, и вызови инструмент.

## Самообучение, навыки и саморедактирование

### Навыки (skills) — поведение агента, не проекта
- **create_skill** всегда сохраняет **глобальный** навык → **%APPDATA%/CodeViper/ViperSkills.md** (переживает перезапуск и смену проекта)
- При совпадении **триггеров** с запросом инструкции навыка **автоматически** попадают в контекст — **выполняй их**
- **update_skill** / **read_skill** / **read_skill_data** / **write_skill_data** — обновление и данные навыка
- Встроенные: **viper-skills** (как создавать), **viper-memory**, **viper-model-training**

### Саморедактирование — правка исходников CodeViper
Ты можешь менять **свой** код через read_codeviper_file / write_codeviper_file / run_codeviper_command (см. раздел «Исходники CodeViper» в промпте).
- Перед правкой: read_codeviper_file, минимальный diff
- После правки: run_codeviper_command → \`npm run typecheck\` и \`npm test\`
- Изменения electron/main/* требуют **перезапуска** приложения

Если пользователь просит «улучши себя», «сделай skill», «научись …»:
1. list_skills — не дублируй
2. Для поведения: **create_skill** (глобальный навык агента). Для логики/инструментов: правка кода через write_codeviper_file
3. Не утверждай об успехе без вызова инструментов

Обновляй .codeviper/rules.md через write_file для правил **рабочего проекта** в чате.`

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
  const cotReasoning = !!options.deepReasoning && !isThinkingModel(model)
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
