import type { z } from 'zod'
import { AgentTraceEventSchema, SavedChatSchema } from './ipcContracts'

export const CHAT_EXPORT_SCHEMA_VERSION = 1 as const

type SavedChat = z.infer<typeof SavedChatSchema>
type AgentTraceEvent = z.infer<typeof AgentTraceEventSchema>

export interface ChatExportPayload {
  exportSchemaVersion: typeof CHAT_EXPORT_SCHEMA_VERSION
  exportedAt: number
  chat: SavedChat
  trace: AgentTraceEvent[]
}

const ROLE_LABEL: Record<string, string> = {
  user: 'Вы',
  assistant: 'CodeViper',
  tool: 'Инструмент',
  system: 'Система'
}

export function buildChatExportPayload(
  chat: SavedChat,
  trace: AgentTraceEvent[]
): ChatExportPayload {
  return {
    exportSchemaVersion: CHAT_EXPORT_SCHEMA_VERSION,
    exportedAt: Date.now(),
    chat,
    trace
  }
}

export function sanitizeExportFilename(title: string): string {
  const safe = [...title.trim().slice(0, 60)]
    .map((ch) => {
      const code = ch.charCodeAt(0)
      if (code < 32 || /[<>:"/\\|?*]/.test(ch)) return '_'
      return ch
    })
    .join('')
    .replace(/\s+/g, '-')
  return safe || 'chat'
}

export function chatExportJsonFilename(chat: { title: string; id: string }): string {
  return `codeviper-chat-${sanitizeExportFilename(chat.title)}-${chat.id.slice(0, 8)}.json`
}

export function chatToMarkdown(chat: SavedChat): string {
  const parts: string[] = []
  parts.push(`# ${chat.title}`)
  parts.push(`*ID: ${chat.id}*`)
  parts.push(`*Проект: ${chat.projectPath || 'не указан'}*`)
  parts.push(`*Создан: ${chat.createdAt} · Обновлён: ${chat.updatedAt}*`)
  if (chat.mode) parts.push(`*Режим: ${chat.mode}*`)
  if (chat.tags?.length) parts.push(`*Теги: ${chat.tags.join(', ')}*`)
  parts.push('')

  if (chat.interruptedDraft) {
    parts.push('## Прерванный черновик')
    parts.push(`*Причина: ${chat.interruptedDraft.reason}*`)
    parts.push(`**Сообщение пользователя:** ${chat.interruptedDraft.userMessage}`)
    if (chat.interruptedDraft.partial.trim()) {
      parts.push(`**Частичный ответ:**\n\n${chat.interruptedDraft.partial}`)
    }
    parts.push('')
  }

  parts.push('## Сообщения')
  for (const msg of chat.messages) {
    const label = ROLE_LABEL[msg.role] ?? msg.role
    const toolSuffix = msg.toolName ? ` (${msg.toolName})` : ''
    parts.push(`### ${label}${toolSuffix}`)
    parts.push(`*${new Date(msg.timestamp).toISOString()}*`)
    if (msg.thinking?.trim()) {
      parts.push('<details><summary>Рассуждения</summary>\n')
      parts.push(msg.thinking)
      parts.push('\n</details>\n')
    }
    if (msg.content.trim()) {
      parts.push(msg.content)
    }
    if (msg.toolOutput?.trim()) {
      parts.push(`\n**Результат инструмента:**\n\n\`\`\`\n${msg.toolOutput}\n\`\`\``)
    }
    if (msg.previewPath && msg.previewDiff) {
      parts.push(
        `\n**Превью правки ${msg.previewPath}** (${msg.previewStatus ?? 'pending'}):\n\n\`\`\`diff\n${msg.previewDiff}\n\`\`\``
      )
    }
    if (msg.images?.length) {
      parts.push(`\n*Вложено изображений: ${msg.images.length}*`)
    }
    parts.push('')
  }
  return parts.join('\n')
}

export function chatsToMarkdown(chats: SavedChat[]): string {
  const parts = [`# История чатов CodeViper\n`]
  for (const chat of chats) {
    parts.push(chatToMarkdown(chat))
    parts.push('---\n')
  }
  return parts.join('\n')
}

export function chatExportToMarkdown(payload: ChatExportPayload): string {
  const md = chatToMarkdown(payload.chat)
  if (payload.trace.length === 0) return md
  const traceParts = ['## Трассировка агента', '']
  for (const ev of payload.trace) {
    traceParts.push(`### ${ev.label} (${ev.kind})`)
    traceParts.push(`*${new Date(ev.ts).toISOString()}*`)
    traceParts.push('```json')
    traceParts.push(JSON.stringify(ev.data, null, 2))
    traceParts.push('```')
    traceParts.push('')
  }
  return `${md}\n\n${traceParts.join('\n')}`
}
