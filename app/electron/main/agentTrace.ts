import type { OllamaMessage } from './ollamaMessage'
import { computeContextUsage, estimateMessageChars } from '../../shared/contextLimits'
import { normalizeToolLoopSignature } from '../../shared/toolLoopGuard'
import type { AgentStreamPayload, AgentTraceEvent } from '../../src/types'

export { AGENT_TRACE_SCHEMA_VERSION } from '../../shared/constants'

export type AgentTraceKind = AgentTraceEvent['kind']

export function emitAgentTrace(
  emit: (event: AgentStreamPayload) => void,
  kind: AgentTraceKind,
  label: string,
  data: Record<string, unknown>
): void {
  emit({ type: 'trace', traceEvent: { ts: Date.now(), kind, label, data } })
}

const TOOL_VALIDATION_ERROR_PREFIXES = [
  'Укажите ',
  'Не указан параметр ',
  'Неизвестный инструмент:',
  'План не задан.'
] as const

export function isToolOutputError(output: string): boolean {
  if (output.startsWith('Ошибка:') || output.startsWith('⛔')) return true
  return TOOL_VALIDATION_ERROR_PREFIXES.some((prefix) => output.startsWith(prefix))
}

export function isToolResultOk(threw: boolean, output: string): boolean {
  return !threw && !isToolOutputError(output)
}

export interface MessageContextStats {
  messageCount: number
  contextChars: number
  estimatedTokens: number
  usagePercent: number
  limitTokens: number
  roles: Record<string, number>
  toolMessages: number
  toolsJsonChars?: number
}

export function buildMessageContextStats(
  messages: OllamaMessage[],
  model: string,
  toolsJsonChars = 0,
  knownContextLength?: number,
  summarizeThresholdPercent?: number
): MessageContextStats {
  const roles: Record<string, number> = {}
  let contextChars = 0
  let toolMessages = 0
  for (const message of messages) {
    roles[message.role] = (roles[message.role] ?? 0) + 1
    contextChars += estimateMessageChars(message.content)
    if (message.role === 'tool') toolMessages++
  }
  const usage = computeContextUsage(
    contextChars + toolsJsonChars,
    model,
    knownContextLength,
    summarizeThresholdPercent
  )
  return {
    messageCount: messages.length,
    contextChars,
    estimatedTokens: usage.estimatedTokens,
    usagePercent: usage.usagePercent,
    limitTokens: usage.limitTokens,
    roles,
    toolMessages,
    ...(toolsJsonChars > 0 ? { toolsJsonChars } : {})
  }
}

function summarizeMessagesForTrace(messages: OllamaMessage[]): Array<{
  role: string
  chars: number
  preview: string
  toolName?: string
}> {
  return messages.map((message) => {
    const chars = typeof message.content === 'string' ? message.content.length : 0
    const preview = typeof message.content === 'string' ? message.content.slice(0, 400) : ''
    if (message.role === 'tool') {
      const nameMatch = message.content.match(/^Инструмент ([^:]+):/)
      return {
        role: message.role,
        chars,
        preview,
        ...(nameMatch ? { toolName: nameMatch[1] } : {})
      }
    }
    return { role: message.role, chars, preview }
  })
}

export interface RunStartTraceInput {
  model: string
  provider: string
  message: string
  chatId?: string
  taskMode?: string
  settings?: Record<string, unknown>
}

export function buildRunStartTraceData(input: RunStartTraceInput): {
  label: string
  data: Record<string, unknown>
} {
  return {
    label: `▶ Старт — модель: ${input.model} (${input.provider})`,
    data: {
      model: input.model,
      provider: input.provider,
      message: input.message,
      ...(input.chatId ? { chatId: input.chatId } : {}),
      ...(input.taskMode ? { taskMode: input.taskMode } : {}),
      ...(input.settings && Object.keys(input.settings).length > 0
        ? { settings: input.settings }
        : {})
    }
  }
}

export interface LlmRequestTraceInput {
  step: number
  messages: OllamaMessage[]
  model: string
  toolsJsonChars: number
  knownContextLength?: number
  summarizeThresholdPercent?: number
  requireTool?: boolean
}

export function buildLlmRequestTraceData(input: LlmRequestTraceInput): {
  label: string
  data: Record<string, unknown>
} {
  const stats = buildMessageContextStats(
    input.messages,
    input.model,
    input.toolsJsonChars,
    input.knownContextLength,
    input.summarizeThresholdPercent
  )
  const roleSummary = Object.entries(stats.roles)
    .map(([role, count]) => `${role}:${count}`)
    .join(', ')
  return {
    label: `→ Запрос к модели (шаг ${input.step}, ${stats.messageCount} сообщ., ~${stats.estimatedTokens} tok, ${stats.usagePercent}%)`,
    data: {
      step: input.step,
      ...stats,
      roleSummary,
      messages: summarizeMessagesForTrace(input.messages),
      ...(input.requireTool ? { requireTool: true } : {})
    }
  }
}

export interface LlmResponseTraceInput {
  step: number
  durationMs: number
  tokens?: number
  inputTokens?: number
  outputTokens?: number
  toksPerSec?: number
  text?: string
  thinking?: string
  toolCalls?: string[]
  error?: string
}

export function buildLlmResponseTraceData(input: LlmResponseTraceInput): {
  label: string
  data: Record<string, unknown>
} {
  if (input.error) {
    return {
      label: `✖ Ошибка запроса (шаг ${input.step})`,
      data: {
        step: input.step,
        durationMs: input.durationMs,
        error: input.error
      }
    }
  }

  const toolNames = input.toolCalls ?? []
  const text = input.text ?? ''
  const emptyResponse = !text.trim() && toolNames.length === 0

  const label = toolNames.length
    ? `← Ответ (шаг ${input.step}, ${input.durationMs}ms${input.tokens ? `, ${input.tokens}tok` : ''}) → инструменты: ${toolNames.join(', ')}`
    : `← Ответ (шаг ${input.step}, ${input.durationMs}ms${input.tokens ? `, ${input.tokens}tok` : ''}) → текст (${text.length} симв.)`

  return {
    label,
    data: {
      step: input.step,
      durationMs: input.durationMs,
      ...(input.tokens != null ? { tokens: input.tokens } : {}),
      ...(input.inputTokens != null ? { inputTokens: input.inputTokens } : {}),
      ...(input.outputTokens != null ? { outputTokens: input.outputTokens } : {}),
      ...(input.toksPerSec != null ? { toksPerSec: input.toksPerSec } : {}),
      textLength: text.length,
      text: text.slice(0, 800),
      ...(input.thinking?.trim()
        ? { thinkingLength: input.thinking.length, thinking: input.thinking.slice(0, 400) }
        : {}),
      ...(toolNames.length ? { toolCalls: toolNames } : {}),
      ...(emptyResponse ? { emptyResponse: true } : {})
    }
  }
}

export function buildToolCallTraceData(
  step: number,
  tool: string,
  args: Record<string, string>
): { label: string; data: Record<string, unknown> } {
  const signature = normalizeToolLoopSignature(tool, args)
  return {
    label: `⚙ ${tool} (шаг ${step})`,
    data: { step, tool, args, signature }
  }
}

function parseCommandExitCode(output: string): number | undefined {
  const match = output.match(/^exit:\s*(-?\d+)/m)
  if (!match) return undefined
  const code = Number.parseInt(match[1], 10)
  return Number.isFinite(code) ? code : undefined
}

export function buildToolResultTraceData(
  step: number,
  tool: string,
  output: string,
  threw: boolean,
  durationMs: number
): { label: string; data: Record<string, unknown> } {
  const failed = !isToolResultOk(threw, output)
  const label = failed
    ? `✖ ${tool} — ошибка (${durationMs}ms)`
    : `✓ ${tool} (${durationMs}ms, ${output.length} симв.)`
  const data: Record<string, unknown> = {
    step,
    tool,
    ok: !failed,
    durationMs,
    outputLen: output.length
  }
  if (failed) {
    data.error = output.slice(0, 1500)
  } else {
    data.preview = output.slice(0, 400)
    const exitCode = parseCommandExitCode(output)
    if (exitCode != null) data.exitCode = exitCode
  }
  return { label, data }
}

export type NudgeTraceSource =
  | 'loop_guard'
  | 'task_planner'
  | 'scope'
  | 'exploration_stall'
  | 'require_tool'
  | 'duplicate_tool_batch'

export function buildNudgeTraceData(
  step: number,
  source: NudgeTraceSource,
  content: string
): { label: string; data: Record<string, unknown> } {
  return {
    label: `↪ Nudge (${source}, шаг ${step})`,
    data: {
      step,
      source,
      chars: content.length,
      preview: content.slice(0, 500)
    }
  }
}

export interface ContextCompressTraceInput {
  step: number
  durationMs: number
  before: MessageContextStats
  after: MessageContextStats
  summarized: boolean
  truncated: boolean
  droppedMessageCount: number
  attempted: boolean
}

export function buildContextCompressTraceData(input: ContextCompressTraceInput): {
  label: string
  data: Record<string, unknown>
} {
  const method = input.summarized
    ? 'summarize'
    : input.truncated || input.droppedMessageCount > 0
      ? 'truncate'
      : input.attempted
        ? 'attempted'
        : 'none'

  const deltaChars = input.before.contextChars - input.after.contextChars
  const label =
    method === 'none'
      ? `◎ Контекст (шаг ${input.step}, ${input.after.usagePercent}% / ${input.after.limitTokens} tok)`
      : `◎ Сжатие контекста (шаг ${input.step}, ${input.before.usagePercent}%→${input.after.usagePercent}%, −${deltaChars} симв.)`

  return {
    label,
    data: {
      step: input.step,
      durationMs: input.durationMs,
      method,
      attempted: input.attempted,
      summarized: input.summarized,
      truncated: input.truncated,
      droppedMessageCount: input.droppedMessageCount,
      before: input.before,
      after: input.after,
      deltaChars,
      deltaMessages: input.before.messageCount - input.after.messageCount
    }
  }
}

export function buildRunEndTraceData(
  durationMs: number,
  status: 'ok' | 'error' | 'aborted',
  extra: Record<string, unknown> = {}
): { label: string; data: Record<string, unknown> } {
  const statusLabel =
    status === 'ok' ? '■ Завершено' : status === 'aborted' ? '■ Остановлено' : '■ Ошибка'
  return {
    label: `${statusLabel} за ${durationMs}ms`,
    data: { durationMs, status, ...extra }
  }
}
