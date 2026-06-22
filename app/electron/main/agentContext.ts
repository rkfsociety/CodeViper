import { app } from 'electron'
import type {
  AgentContextMessagePreview,
  AgentContextPreview,
  AgentContextSection,
  AgentRole,
  AgentSettings,
  ChatMessage,
  FileNode,
  McpServerConfig
} from '../../src/types'
import { looksLikeEmbeddedToolCall, sanitizeAssistantContent } from '../../shared/toolCalls'
import { buildSelfEditContext } from './codeviperSource'
import { buildMemoryContext } from './memory'
import { buildSkillsContext } from './skills'
import { buildFileTree } from './services'
import { getAgentTools, formatAgentToolsSummary } from './agentTools'
import { SELF_IMPROVEMENT_MODE_PROMPT } from '../../shared/selfImprovement'
import { DEEP_REASONING_PROMPT, isThinkingModel } from '../../shared/reasoning'
import {
  computeContextUsage,
  computeAdaptiveLimits,
  estimateMessageChars,
  estimateTokensFromChars,
  MAX_TOOL_MESSAGE_CHARS
} from '../../shared/contextLimits'
import { compressContextMessages } from './contextSummarizer'
import { searchRAGMessages } from './contextRAG'
import type { VectorStoreConfig } from './vectorStore'
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

const BASE_SYSTEM_PROMPT = `Ты CodeViper, локальный AI-агент для программирования.
Работай только внутри открытого проекта. Если задача про код, сразу используй инструменты.
Пиши по-русски, если пользователь пишет по-русски. Не показывай tool calls как текст и не рассуждай вслух.
Перед правками сначала читай файл. Для точечных правок используй preview_patch (old_string → new_string) — он безопаснее: меняет только указанный фрагмент, не трогая остальное. preview_edit и write_file — только для новых файлов или полного переписывания (передавать ВСЕ содержимое).
Говори кратко и только по делу. Не утверждай, что действие выполнено, пока инструмент не сработал.

**Не исследуй проект без необходимости.** Если ты знаешь, какой файл нужно изменить — читай сразу его. Не вызывай list_directory, find_files и аналоги без явной причины — это трата токенов.

Если задача состоит из нескольких шагов, используй todo-лист. После выполнения каждого шага сразу отмечай его через complete_todo_item и продолжай следующий — не останавливайся и не жди подтверждения. Если пользователь уточнил задачу, продолжай работу.

Навыки и память подставляются автоматически, когда релевантны. Перед create_skill проверь list_skills.
Для правил конкретного проекта обновляй .codeviper/rules.md через write_file.`

const CLARIFY_PROMPT = `## Уточнение
Если задача действительно неоднозначна, задай 1–3 коротких вопроса и остановись. Не переспрашивай по очевидным вещам.`

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
Для read_file, write_file и других файловых инструментов используй пути **относительно корня проекта** (например, src/components/Foo.tsx) — НЕ добавляй сам корень в путь.

Дерево проекта:
${treeText || '(пусто)'}`
}

function buildSystemPrompt(
  projectPath: string,
  memoryContext: string,
  projectTreeText: string,
  selfImproveMode = false,
  clarifyMode = false,
  cotReasoning = false,
  chatMode = false,
  customSystemPrompt = ''
): string {
  // В режиме Chat — только базовый промпт: без инструментов, дерева проекта и памяти.
  if (chatMode) {
    const base = BASE_SYSTEM_PROMPT
    return customSystemPrompt.trim() ? `${base}\n\n${customSystemPrompt.trim()}` : base
  }

  const parts = [BASE_SYSTEM_PROMPT]
  if (selfImproveMode) parts.push(buildSelfEditContext(app.isPackaged))

  // Для не-think моделей даём краткую подсказку к последовательной работе.
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

  if (customSystemPrompt.trim()) {
    parts.push(`## Дополнительные инструкции\n${customSystemPrompt.trim()}`)
  }

  return parts.join('\n\n')
}

async function buildAgentContext(projectPath: string, taskHint: string): Promise<string> {
  const memoryContext = await buildMemoryContext(projectPath, taskHint)
  const skillsContext = await buildSkillsContext(projectPath, taskHint)
  return [memoryContext, skillsContext].filter(Boolean).join('\n\n')
}

/**
 * Объединить историю сообщений с RAG поиском.
 * Возвращает релевантные сообщения из истории + RAG результаты.
 */
async function getMergedHistoryWithRAG(
  history: ChatMessage[],
  userMessage: string,
  chatId: string,
  ollamaUrl: string,
  maxHistoryMessages: number,
  storeConfig: VectorStoreConfig
): Promise<ChatMessage[]> {
  const recentMessages = history.slice(-maxHistoryMessages)

  // Пытаемся найти релевантные сообщения по семантике
  const ragResults = await searchRAGMessages(
    userMessage,
    chatId,
    ollamaUrl,
    Math.floor(maxHistoryMessages / 2),
    0.25,
    storeConfig
  ).catch(() => [])

  if (ragResults.length === 0) {
    return recentMessages
  }

  // Создаём Map недавних сообщений для быстрого поиска
  const recentIds = new Set(recentMessages.map((m) => m.id))

  // Преобразуем RAG результаты обратно в ChatMessage
  const ragMessages: ChatMessage[] = ragResults
    .filter((r) => !recentIds.has(r.id))
    .slice(0, Math.floor(maxHistoryMessages / 3))
    .map((r) => ({
      id: r.id,
      role: r.message.role as AgentRole,
      content: r.message.content,
      timestamp: Date.now()
    }))

  // Объединяем: недавние + релевантные из RAG (без дупликатов)
  const mergedIds = new Set<string>()
  const merged: ChatMessage[] = []

  // Сначала добавляем недавние сообщения
  for (const m of recentMessages) {
    if (!mergedIds.has(m.id)) {
      merged.push(m)
      mergedIds.add(m.id)
    }
  }

  // Затем добавляем релевантные из RAG (если не было в недавних)
  for (const m of ragMessages) {
    if (!mergedIds.has(m.id)) {
      merged.push(m)
      mergedIds.add(m.id)
    }
  }

  return merged
}

function stripThinkingTags(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

function mapHistoryMessageToOllama(
  message: ChatMessage,
  maxToolChars = MAX_TOOL_MESSAGE_CHARS,
  excludeThinking = true
): OllamaMessage | null {
  switch (message.role) {
    case 'user':
      return { role: 'user', content: message.content }
    case 'assistant': {
      let raw = message.content
      if (excludeThinking) raw = stripThinkingTags(raw)
      const cleaned = sanitizeAssistantContent(raw)
      if (!cleaned || looksLikeEmbeddedToolCall(raw)) return null
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

      if (output.length > maxToolChars) {
        output = `${output.slice(0, maxToolChars)}\n… (обрезано)`
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
  /** Стрипить <think>...</think> из assistant-контента при построении истории */
  excludeThinkingFromHistory?: boolean
  /** Реальный размер контекста модели в токенах (если известен из API провайдера) */
  modelContextLength?: number
  /** Порог суммаризации в процентах (50–85); передаётся из настроек пользователя */
  summarizeThresholdPercent?: number
  /** Режим чата: только базовый промпт без инструментов, дерева проекта и памяти */
  chatMode?: boolean
  /** ID чата для RAG поиска релевантных сообщений */
  chatId?: string
  /** Включить RAG поиск релевантных сообщений из истории */
  enableRAG?: boolean
  /** Конфиг векторного хранилища для RAG (провайдер + реквизиты) */
  ragStoreConfig?: VectorStoreConfig
  /** Дополнительные инструкции, дописываемые в конец системного промпта */
  customSystemPrompt?: string
  /** Отключённые инструменты агента (имена); исключаются из набора tools */
  disabledTools?: string[]
  /** Подключённые MCP-серверы — инструменты добавляются динамически */
  mcpServers?: McpServerConfig[]
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
  const chatMode = options.chatMode === true
  const memorySkillsContext = chatMode ? '' : await buildAgentContext(projectPath, userMessage)

  let projectTreeText = ''
  if (!chatMode && projectPath.trim()) {
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
    cotReasoning,
    chatMode,
    options.customSystemPrompt ?? ''
  )

  const adaptiveLimits = computeAdaptiveLimits(model, options.modelContextLength)

  // Используем RAG поиск если включен и есть chatId и ollamaUrl
  let slicedHistory = history.slice(-adaptiveLimits.maxHistoryMessages)
  if (options.enableRAG && options.chatId && options.ollamaUrl) {
    try {
      const ragTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('RAG timeout')), 5000)
      )
      const storeConfig = options.ragStoreConfig ?? { provider: 'local' as const, projectPath }
      slicedHistory = await Promise.race([
        getMergedHistoryWithRAG(
          history,
          userMessage,
          options.chatId,
          options.ollamaUrl,
          adaptiveLimits.maxHistoryMessages,
          storeConfig
        ),
        ragTimeout
      ])
    } catch {
      // Fallback на обычную историю при ошибке RAG или таймауте
    }
  }

  const mappedHistory = slicedHistory
    .map((m) =>
      mapHistoryMessageToOllama(
        m,
        adaptiveLimits.maxToolMessageChars,
        options.excludeThinkingFromHistory !== false
      )
    )
    .filter((m): m is OllamaMessage => m !== null)

  const activeTools = chatMode
    ? []
    : getAgentTools(selfImproveMode, options.disabledTools, options.mcpServers)
  const toolsJsonChars = JSON.stringify(activeTools).length
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
    signal: options.signal,
    summarizeThresholdPercent: options.summarizeThresholdPercent
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

  const projectContent =
    !chatMode && projectPath.trim() ? buildProjectContext(projectPath, projectTreeText) : ''
  const toolsContent = chatMode ? '' : formatAgentToolsSummary(selfImproveMode)

  const sections: AgentContextSection[] = [
    section('instructions', 'Инструкции агента', BASE_SYSTEM_PROMPT)
  ]
  if (selfImproveMode) {
    sections.push(section('self-edit', 'Саморедактирование', buildSelfEditContext(app.isPackaged)))
  }

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

  if (!chatMode) {
    sections.push(
      section(
        'tools',
        `Инструменты (${activeTools.length})`,
        toolsContent,
        'Схема function calling для Ollama'
      )
    )
  }

  const messages = ollamaMessages.map(messagePreview)
  const totalChars =
    ollamaMessages.reduce((sum, message) => sum + estimateMessageCharsLocal(message), 0) +
    toolsJsonChars
  const usage = computeContextUsage(totalChars, model, options.modelContextLength)

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
    toolCount: activeTools.length,
    sections,
    messages,
    adaptiveLimits
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

export interface SummarizeChatHistoryResult {
  droppedChatIds: string[]
  summary: string | null
  summarized: boolean
  truncated: boolean
}

export async function summarizeChatHistory(
  chatMessages: ChatMessage[],
  settings: AgentSettings
): Promise<SummarizeChatHistoryResult> {
  const mapped = chatMessages.map((m) => ({
    id: m.id,
    ollama: mapHistoryMessageToOllama(m)
  }))
  const ollamaMessages = mapped.filter((x) => x.ollama !== null).map((x) => x.ollama!)

  const providerType = settings.modelProvider || 'ollama'
  const { DEEPSEEK_API_BASE_URL, GEMINI_API_BASE_URL, OPENROUTER_API_BASE_URL } =
    await import('../../shared/constants')

  const providerBaseUrl: string | undefined =
    providerType === 'deepseek'
      ? DEEPSEEK_API_BASE_URL
      : providerType === 'gemini'
        ? GEMINI_API_BASE_URL
        : providerType === 'openrouter'
          ? OPENROUTER_API_BASE_URL
          : settings.ollamaUrl

  const providerApiKey =
    providerType === 'deepseek'
      ? (settings.deepseekApiKey ?? settings.providerApiKey)
      : providerType === 'gemini'
        ? (settings.geminiApiKey ?? settings.providerApiKey)
        : providerType === 'openrouter'
          ? (settings.openrouterApiKey ?? settings.providerApiKey)
          : providerType === 'openai'
            ? (settings.openaiApiKey ?? settings.providerApiKey)
            : providerType === 'anthropic'
              ? (settings.claudeApiKey ?? settings.providerApiKey)
              : providerType === 'groq'
                ? (settings.groqApiKey ?? settings.providerApiKey)
                : providerType === 'together'
                  ? (settings.togetherApiKey ?? settings.providerApiKey)
                  : undefined

  const providerConfig: ProviderConfig = {
    type: providerType,
    baseUrl: providerBaseUrl,
    apiKey: providerApiKey,
    model: settings.model,
    ...(providerType === 'gemini' && settings.geminiRpm != null ? { rpm: settings.geminiRpm } : {})
  }

  const result = await compressContextMessages({
    messages: ollamaMessages,
    model: settings.model,
    summarizeModel: settings.summarizeModel,
    toolsJsonChars: 0,
    providerConfig,
    summarizeThresholdPercent: 60
  })

  const droppedOllama = result.droppedMessageCount
  const droppedChatIds: string[] = []
  let ollamaDropped = 0
  for (const x of mapped) {
    if (ollamaDropped >= droppedOllama) break
    droppedChatIds.push(x.id)
    if (x.ollama !== null) ollamaDropped++
  }

  let summary: string | null = null
  if (result.summarized) {
    const summaryMsg = result.messages.find((m) => m.content.startsWith('[Сводка'))
    if (summaryMsg) summary = summaryMsg.content
  }

  return { droppedChatIds, summary, summarized: result.summarized, truncated: result.truncated }
}
