import { visibleAssistantContent as sharedVisibleAssistantContent } from '../../../shared/toolCalls'
import type { ChatMessage } from '../../types'

export const FILE_LIMIT = 10

export const CLOUD_KNOWN_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3.1-flash-lite']
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

export function formatProjectLabel(path: string): string {
  if (!path.trim()) return 'Проект не выбран'
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function visibleAssistantContent(content: string, streaming = false): string {
  return sharedVisibleAssistantContent(content, streaming)
}

export function shouldShowAssistantMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return true
  const hasContent = visibleAssistantContent(message.content).length > 0
  const hasThinking = typeof message.thinking === 'string' && message.thinking.trim().length > 0
  return hasContent || hasThinking
}

/** Инструменты и размышления до ответа ассистента */
export interface AgentWorkTrace {
  tools: ChatMessage[]
  thinking: string
  /** Время начала (timestamp assistant/thinking) */
  startedAt?: number
  /** id draft-сообщения для live-размышлений */
  liveAssistantId?: string
}

export type DisplayItem =
  | { kind: 'message'; message: ChatMessage; work?: AgentWorkTrace }
  | { kind: 'pending-work'; work: AgentWorkTrace; key: string }

export function computeWorkDurationMs(
  work: AgentWorkTrace,
  message?: ChatMessage
): number | undefined {
  if (message?.durationMs != null && message.durationMs > 0) return message.durationMs

  const stamps: number[] = work.tools.map((t) => t.timestamp)
  if (work.startedAt != null) stamps.push(work.startedAt)

  if (stamps.length === 0) return undefined
  if (stamps.length === 1) return Math.max(0, Date.now() - stamps[0]!)
  return Math.max(...stamps) - Math.min(...stamps)
}

export function formatWorkDuration(ms: number): string {
  const sec = ms / 1000
  return sec < 10 ? `${sec.toFixed(1)} с` : `${Math.round(sec)} с`
}

function buildWorkTrace(
  tools: ChatMessage[],
  thinking: string,
  liveAssistantId?: string,
  startedAt?: number
): AgentWorkTrace | null {
  const trimmed = thinking.trim()
  if (tools.length === 0 && !trimmed) return null
  return {
    tools,
    thinking: trimmed,
    liveAssistantId,
    startedAt
  }
}

function appendPendingReasoning(
  pending: { thinking: string; assistant: ChatMessage } | null,
  chunk: string,
  anchor: ChatMessage
): { thinking: string; assistant: ChatMessage } {
  const text = chunk.trim()
  if (!text) return pending ?? { thinking: '', assistant: anchor }
  if (pending === null) return { thinking: text, assistant: anchor }
  return { thinking: `${pending.thinking}\n${text}`, assistant: pending.assistant }
}

/** Ответ ассистента перед tool-сообщениями — промежуточный, не финальный. */
export function isIntermediateAssistant(messages: ChatMessage[], index: number): boolean {
  const msg = messages[index]
  if (msg?.role !== 'assistant') return false
  let sawTool = false
  for (let j = index + 1; j < messages.length; j++) {
    const next = messages[j]!
    if (next.role === 'tool') {
      sawTool = true
      continue
    }
    if (next.role === 'assistant') return sawTool
    return sawTool
  }
  return sawTool
}

export function groupToolMessages(messages: ChatMessage[]): DisplayItem[] {
  const result: DisplayItem[] = []
  let pendingTools: ChatMessage[] = []
  let pendingReasoning: { thinking: string; assistant: ChatMessage } | null = null

  function takePendingWork(): AgentWorkTrace | null {
    const work = buildWorkTrace(
      pendingTools,
      pendingReasoning?.thinking ?? '',
      pendingReasoning?.assistant.id,
      pendingReasoning?.assistant.timestamp ?? pendingTools[0]?.timestamp
    )
    pendingTools = []
    pendingReasoning = null
    return work
  }

  function pushPendingWork() {
    const work = takePendingWork()
    if (!work) return
    result.push({
      kind: 'pending-work',
      work,
      key: `work-${work.tools[0]?.id ?? work.liveAssistantId ?? work.startedAt}`
    })
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]!
    if (msg.role === 'tool') {
      pendingTools.push(msg)
    } else if (msg.role === 'assistant') {
      const hasThinking = Boolean(msg.thinking?.trim())
      const visibleContent = visibleAssistantContent(msg.content)
      const hasContent = visibleContent.length > 0
      const intermediate = isIntermediateAssistant(messages, i)

      if (intermediate) {
        if (hasThinking)
          pendingReasoning = appendPendingReasoning(pendingReasoning, msg.thinking!, msg)
        if (hasContent)
          pendingReasoning = appendPendingReasoning(pendingReasoning, visibleContent, msg)
        continue
      }

      if (hasThinking && !hasContent) {
        pendingReasoning = appendPendingReasoning(pendingReasoning, msg.thinking!, msg)
        continue
      }

      let work = takePendingWork()
      if (hasThinking && hasContent && !work) {
        work = buildWorkTrace([], msg.thinking!.trim(), msg.id, msg.timestamp)
      }

      result.push({ kind: 'message', message: msg, work: work ?? undefined })
    } else {
      pushPendingWork()
      result.push({ kind: 'message', message: msg })
    }
  }

  pushPendingWork()
  return result
}

export function messageCopyText(message: ChatMessage): string {
  if (message.role === 'assistant') return visibleAssistantContent(message.content)
  if (message.role === 'tool' && message.toolOutput?.trim()) return message.toolOutput
  return message.content
}

export function workTraceIsEmpty(work?: AgentWorkTrace): boolean {
  if (!work) return true
  return work.tools.length === 0 && !work.thinking.trim()
}

/** Индекс последнего элемента с work/pending-work — только он показывает live-блок во время прогона. */
export function findLastWorkDisplayIndex(items: DisplayItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]!
    if (it.kind === 'pending-work') return i
    if (it.kind === 'message' && !workTraceIsEmpty(it.work)) return i
  }
  return -1
}
