import {
  computeContextUsage,
  estimateMessageChars,
  MIN_RECENT_CONTEXT_MESSAGES
} from '../../shared/contextLimits'
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

function countPayloadChars(messages: OllamaMessage[], toolsJsonChars: number): number {
  return (
    messages.reduce((sum, message) => sum + estimateMessageChars(message.content), 0) +
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

  const transcript = messages
    .map((message) => `### ${message.role}\n${message.content}`)
    .join('\n\n')
    .slice(0, 60_000)

  let summaryContent = ''
  for await (const chunk of provider.chat({
    model: summarizeModel,
    messages: [
      { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
      { role: 'user', content: `Суммаризируй диалог:\n\n${transcript}` }
    ],
    temperature: 0.2,
    signal
  })) {
    summaryContent += chunk.content
  }

  return summaryContent.trim()
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
}): Promise<ContextCompressionResult> {
  const minRecent = options.minRecentMessages ?? MIN_RECENT_CONTEXT_MESSAGES
  const summarizeModel = options.summarizeModel?.trim() || options.model
  let messages = [...options.messages]
  let truncated = false
  let summarized = false
  let droppedMessageCount = 0

  const evaluate = () =>
    computeContextUsage(
      countPayloadChars(messages, options.toolsJsonChars),
      options.model,
      undefined,
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

    if (options.ollamaUrl || options.providerConfig) {
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
        // fallback — обрезка ниже
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
