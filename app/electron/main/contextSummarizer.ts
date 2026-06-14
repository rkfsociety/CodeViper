import {
  computeContextUsage,
  estimateMessageChars,
  MIN_RECENT_CONTEXT_MESSAGES
} from '../../shared/contextLimits'
import type { OllamaMessage } from './agentContext'

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
    messages.reduce((sum, message) => sum + estimateMessageChars(message.content), 0) + toolsJsonChars
  )
}

function buildSummaryMessage(summary: string): OllamaMessage {
  return {
    role: 'user',
    content: `[Сводка предыдущего контекста — автоматически при ~85%+ лимита]\n${summary.trim()}`
  }
}

export async function summarizeOllamaMessages(
  baseUrl: string,
  model: string,
  messages: OllamaMessage[],
  signal?: AbortSignal
): Promise<string> {
  if (!messages.length) return ''

  const transcript = messages
    .map((message) => `### ${message.role}\n${message.content}`)
    .join('\n\n')
    .slice(0, 60_000)

  const url = baseUrl.replace(/\/$/, '')
  const res = await fetch(`${url}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
        { role: 'user', content: `Суммаризируй диалог:\n\n${transcript}` }
      ],
      options: { temperature: 0.2 }
    }),
    signal
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama summarize: ${res.status} ${text}`)
  }

  const data = (await res.json()) as { message?: { content?: string } }
  return (data.message?.content ?? '').trim()
}

function dropOldestNonSystem(messages: OllamaMessage[], count: number): OllamaMessage[] {
  if (count <= 0 || messages.length <= 1) return messages

  const system = messages[0]?.role === 'system' ? messages[0] : null
  const rest = system ? messages.slice(1) : messages
  const nextRest = rest.slice(Math.min(count, Math.max(0, rest.length - MIN_RECENT_CONTEXT_MESSAGES)))

  return system ? [system, ...nextRest] : nextRest
}

export async function compressContextMessages(options: {
  messages: OllamaMessage[]
  model: string
  toolsJsonChars: number
  ollamaUrl?: string
  signal?: AbortSignal
  minRecentMessages?: number
}): Promise<ContextCompressionResult> {
  const minRecent = options.minRecentMessages ?? MIN_RECENT_CONTEXT_MESSAGES
  let messages = [...options.messages]
  let truncated = false
  let summarized = false
  let droppedMessageCount = 0

  const evaluate = () =>
    computeContextUsage(countPayloadChars(messages, options.toolsJsonChars), options.model)

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

  while (usage.shouldSummarize && messages.length > minRecent + 1) {
    const system = messages[0]?.role === 'system' ? messages[0] : null
    const rest = system ? messages.slice(1) : messages

    if (rest.length <= minRecent) break

    const older = rest.slice(0, rest.length - minRecent)
    const recent = rest.slice(-minRecent)

    if (!older.length) break

    droppedMessageCount += older.length

    if (options.ollamaUrl) {
      try {
        const summary = await summarizeOllamaMessages(
          options.ollamaUrl,
          options.model,
          older,
          options.signal
        )

        if (summary) {
          messages = system
            ? [system, buildSummaryMessage(summary), ...recent]
            : [buildSummaryMessage(summary), ...recent]
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
