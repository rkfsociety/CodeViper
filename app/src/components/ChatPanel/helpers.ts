import { sanitizeAssistantContent } from '../../../shared/toolCalls'
import type { ChatMessage } from '../../types'

export const FILE_LIMIT = 10

export const CLOUD_KNOWN_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
  gemini: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite-preview-06-17',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
  ]
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

export function visibleAssistantContent(content: string): string {
  return sanitizeAssistantContent(content)
}

export function shouldShowAssistantMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return true
  const hasContent = visibleAssistantContent(message.content).length > 0
  const hasThinking = typeof message.thinking === 'string' && message.thinking.trim().length > 0
  return hasContent || hasThinking
}

export type DisplayItem =
  | { kind: 'message'; message: ChatMessage }
  | {
      kind: 'all-tools'
      items: ChatMessage[]
      key: string
      reasoning?: { thinking: string; assistant: ChatMessage }
    }

export function groupToolMessages(messages: ChatMessage[]): DisplayItem[] {
  const result: DisplayItem[] = []
  let pendingTools: ChatMessage[] = []
  let pendingReasoning: { thinking: string; assistant: ChatMessage } | null = null

  function flushTools() {
    if (pendingTools.length > 0 || pendingReasoning) {
      const key = `tools-${pendingTools[0]?.id || 'reasoning'}`
      result.push({
        kind: 'all-tools',
        items: pendingTools,
        key,
        reasoning: pendingReasoning || undefined
      })
      pendingTools = []
      pendingReasoning = null
    }
  }

  for (const msg of messages) {
    if (msg.role === 'tool') {
      pendingTools.push(msg)
    } else if (msg.role === 'assistant') {
      const hasThinking = Boolean(msg.thinking?.trim())
      const hasContent = visibleAssistantContent(msg.content).length > 0
      if (hasThinking && !hasContent) {
        if (pendingReasoning === null) {
          pendingReasoning = { thinking: msg.thinking!, assistant: msg }
        } else {
          pendingReasoning.thinking += '\n' + msg.thinking
        }
        continue
      }
      flushTools()
      result.push({ kind: 'message', message: msg })
    } else {
      flushTools()
      result.push({ kind: 'message', message: msg })
    }
  }

  flushTools()
  return result
}

export function messageCopyText(message: ChatMessage): string {
  if (message.role === 'assistant') return visibleAssistantContent(message.content)
  if (message.role === 'tool' && message.toolOutput?.trim()) return message.toolOutput
  return message.content
}
