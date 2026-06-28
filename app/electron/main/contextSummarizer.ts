import {
  computeContextUsage,
  estimateMessageChars,
  MIN_RECENT_CONTEXT_MESSAGES
} from '../../shared/contextLimits'
import { CONTEXT_SUMMARIZE_TIMEOUT_MS } from '../../shared/constants'
import { redactMessagesForModel } from '../../shared/secretRedaction'
import type { OllamaMessage } from './agentContext'
import { ModelRuntime } from './modelRuntime'
import type { ProviderConfig } from '../../shared/modelProvider'

const SUMMARIZE_SYSTEM_PROMPT = `Сожми фрагмент диалога агента-программиста в краткую сводку на русском.
Сохрани: принятые решения, изменённые файлы, ошибки, незавершённые задачи, важные выводы инструментов.
Без воды, markdown-списки допустимы, до 1500 символов.`

export interface ContextCompressionResult {
  messages: OllamaMessage[]
  truncated: boolean
  droppedMessageCount: number
  summarized: boolean
  usagePercent: number
  limitTokens: number
  estimatedTokens: number
}

function countPayloadChars(
  messages: OllamaMessage[],
  toolsJsonChars: number,
  excludeToolMessages = false
): number {
  const payload = excludeToolMessages
    ? messages.filter((message) => message.role !== 'tool')
    : messages
  return (
    payload.reduce((sum, message) => sum + estimateMessageChars(message.content), 0) +
    toolsJsonChars
  )
}

function buildSummaryMessage(summary: string, thresholdPercent?: number): OllamaMessage {
  const pct = thresholdPercent ?? 85
  return {
    role: 'user',
    content: `[Сводка предыдущего контекста — автоматически при ~${pct}%+ лимита]\n${summary.trim()}`
  }
}

async function summarizeWithProvider(
  provider: ModelRuntime,
  summarizeModel: string,
  messages: OllamaMessage[],
  signal?: AbortSignal
): Promise<string> {
  if (!messages.length) return ''

  const safeMessages = redactMessagesForModel(messages)

  const transcript = safeMessages
    .map((message) => `### ${message.role}\n${message.content}`)
    .join('\n\n')
    .slice(0, 60_000)

  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), CONTEXT_SUMMARIZE_TIMEOUT_MS)
  const linkedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal

  let summaryContent = ''
  try {
    for await (const chunk of provider.chat({
      model: summarizeModel,
      messages: redactMessagesForModel([
        { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
        { role: 'user', content: `Суммаризируй диалог:\n\n${transcript}` }
      ]),
      temperature: 0.2,
      signal: linkedSignal
    })) {
      summaryContent += chunk.content
    }
  } finally {
    clearTimeout(timeoutId)
  }

  return summaryContent.trim()
}

/**
 * Заменяет содержимое tool-сообщений, оставляя только последние keepLast результатов.
 * Более старые → «[результат обрезан]», инструмент сохраняется по названию.
 */
function truncateOldToolResults(messages: OllamaMessage[], keepLast: number): OllamaMessage[] {
  const toolIndices: number[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'tool') toolIndices.push(i)
  }
  if (toolIndices.length <= keepLast) return messages

  const cutoff = toolIndices.length - keepLast
  const toTruncate = new Set(toolIndices.slice(0, cutoff))

  return messages.map((msg, i) => {
    if (!toTruncate.has(i)) return msg
    const nameMatch = msg.content.match(/^Инструмент ([^:]+):/)
    const label = nameMatch ? `Инструмент ${nameMatch[1]}` : 'Инструмент'
    return { ...msg, content: `${label}: [результат обрезан]` }
  })
}

/**
 * Удаляет ошибочные tool results (content начинается с «Ошибка:»), если для того
 * же инструмента есть хотя бы один более поздний успешный результат.
 * Сохраняет порядок и все успешные результаты.
 */
function dropSupersededErrors(messages: OllamaMessage[]): OllamaMessage[] {
  // Собираем имена инструментов, у которых есть успешный результат
  const hasLaterSuccess = new Set<string>()
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'tool') continue
    const nameMatch = msg.content.match(/^Инструмент ([^:]+):/)
    if (!nameMatch) continue
    const name = nameMatch[1]
    const body = msg.content.slice(nameMatch[0].length).trimStart()
    if (!body.startsWith('Ошибка:')) {
      hasLaterSuccess.add(name)
    }
  }

  // Второй проход: удаляем ошибочные, у которых есть более поздний успешный
  // ИЛИ если это более ранняя попытка того же инструмента (оставляем только последнюю)
  const toDelete = new Set<number>()
  const seenTools = new Set<string>()
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'tool') continue
    const nameMatch = msg.content.match(/^Инструмент ([^:]+):/)
    if (!nameMatch) continue
    const name = nameMatch[1]
    const body = msg.content.slice(nameMatch[0].length).trimStart()

    if (body.startsWith('Ошибка:') && hasLaterSuccess.has(name)) {
      toDelete.add(i)
      continue
    }

    if (seenTools.has(name)) {
      toDelete.add(i)
    } else {
      seenTools.add(name)
    }
  }

  if (!toDelete.size) return messages
  return messages.filter((_, i) => !toDelete.has(i))
}

/**
 * Заменяет повторяющиеся tool results (одинаковый инструмент + одинаковый вывод)
 * на пометку «(повторено N раз)», оставляя первое вхождение.
 */
function deduplicateToolResults(messages: OllamaMessage[]): OllamaMessage[] {
  // key → [firstIndex, count]
  const seen = new Map<string, { firstIndex: number; count: number }>()
  const result = [...messages]

  for (let i = 0; i < result.length; i++) {
    if (result[i].role !== 'tool') continue
    const key = result[i].content
    const entry = seen.get(key)
    if (!entry) {
      seen.set(key, { firstIndex: i, count: 1 })
    } else {
      entry.count++
      // Обновляем первое вхождение с актуальным счётчиком
      const firstMsg = result[entry.firstIndex]
      const withoutSuffix = firstMsg.content.replace(/\n\(повторено \d+ раз\)$/, '')
      result[entry.firstIndex] = {
        ...firstMsg,
        content: `${withoutSuffix}\n(повторено ${entry.count} раз)`
      }
      // Заменяем дубликат заглушкой
      result[i] = { ...result[i], content: '[дубликат tool result — см. выше]' }
    }
  }

  return result
}

function dropOldestNonSystem(messages: OllamaMessage[], count: number): OllamaMessage[] {
  if (count <= 0 || messages.length <= 1) return messages

  const system = messages[0]?.role === 'system' ? messages[0] : null
  const rest = system ? messages.slice(1) : messages
  const nextRest = rest.slice(
    Math.min(count, Math.max(0, rest.length - MIN_RECENT_CONTEXT_MESSAGES))
  )

  return system ? [system, ...nextRest] : nextRest
}

export async function compressContextMessages(options: {
  messages: OllamaMessage[]
  /** Модель агента — для оценки лимита контекста */
  model: string
  /** Модель для вызова суммаризации; по умолчанию та же, что model */
  summarizeModel?: string
  toolsJsonChars: number
  ollamaUrl?: string
  /** Конфигурация провайдера моделей (для поддержки DeepSeek и др.) */
  providerConfig?: ProviderConfig
  signal?: AbortSignal
  minRecentMessages?: number
  /** Вызывается один раз, когда сжатие реально начинается (суммаризация или обрезка). */
  onCompressStart?: () => void
  /** Порог суммаризации в процентах (50–85); по умолчанию — глобальная константа (85) */
  summarizeThresholdPercent?: number
  /** Оставлять результаты только последних N tool-вызовов; более старые → [результат обрезан]. Дефолт 5. */
  maxRecentToolResults?: number
  /** Реальный размер контекста модели (из API), если известен */
  knownContextLength?: number
  /**
   * Не вызывать LLM-суммаризацию — только обрезка/dedup.
   * Для Ollama без облачной summarize-модели: второй тяжёлый вызов часто не укладывается в таймаут шага.
   */
  preferTruncateOverLlmSummarize?: boolean
}): Promise<ContextCompressionResult> {
  const minRecent = options.minRecentMessages ?? MIN_RECENT_CONTEXT_MESSAGES
  const summarizeModel = options.summarizeModel?.trim() || options.model
  let messages = deduplicateToolResults(
    truncateOldToolResults(
      dropSupersededErrors([...options.messages]),
      options.maxRecentToolResults ?? 5
    )
  )
  let truncated = false
  let summarized = false
  let droppedMessageCount = 0

  const evaluate = () =>
    computeContextUsage(
      countPayloadChars(messages, options.toolsJsonChars),
      options.model,
      options.knownContextLength,
      options.summarizeThresholdPercent
    )

  let usage = evaluate()

  if (!usage.shouldSummarize) {
    return {
      messages,
      truncated,
      droppedMessageCount,
      summarized,
      usagePercent: usage.usagePercent,
      limitTokens: usage.limitTokens,
      estimatedTokens: usage.estimatedTokens
    }
  }

  options.onCompressStart?.()

  while (usage.shouldSummarize && messages.length > minRecent + 1) {
    const system = messages[0]?.role === 'system' ? messages[0] : null
    const rest = system ? messages.slice(1) : messages

    if (rest.length <= minRecent) break

    const older = rest.slice(0, rest.length - minRecent)
    const recent = rest.slice(-minRecent)

    if (!older.length) break

    droppedMessageCount += older.length

    if (!options.preferTruncateOverLlmSummarize && (options.ollamaUrl || options.providerConfig)) {
      try {
        let summary = ''

        if (options.providerConfig) {
          const provider = new ModelRuntime(options.providerConfig)
          summary = await summarizeWithProvider(provider, summarizeModel, older, options.signal)
        } else if (options.ollamaUrl) {
          // Обратная совместимость: если передан только ollamaUrl, используем Ollama
          const provider = new ModelRuntime({
            type: 'ollama',
            baseUrl: options.ollamaUrl
          })
          summary = await summarizeWithProvider(provider, summarizeModel, older, options.signal)
        }

        if (summary) {
          messages = system
            ? [system, buildSummaryMessage(summary, options.summarizeThresholdPercent), ...recent]
            : [buildSummaryMessage(summary, options.summarizeThresholdPercent), ...recent]
          summarized = true
          usage = evaluate()
          continue
        }
      } catch {
        // fallback — обрезка ниже (таймаут summarize или ошибка провайдера)
      }
    }

    messages = system ? [system, ...recent] : recent
    truncated = true
    usage = evaluate()

    if (usage.shouldSummarize) {
      const before = messages.length
      messages = dropOldestNonSystem(messages, 2)
      droppedMessageCount += Math.max(0, before - messages.length)
      truncated = true
      usage = evaluate()
    }
  }

  return {
    messages,
    truncated,
    droppedMessageCount,
    summarized,
    usagePercent: usage.usagePercent,
    limitTokens: usage.limitTokens,
    estimatedTokens: usage.estimatedTokens
  }
}
