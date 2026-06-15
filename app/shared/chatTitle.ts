import type { ChatMessage } from '../src/types'

/** Короткий заголовок чата из произвольного текста. */
export function makeChatTitle(text: string): string {
  const line = text.trim().replace(/\s+/g, ' ')
  if (!line) return 'Новый чат'
  return line.length > 48 ? `${line.slice(0, 48)}…` : line
}

/** Заголовок по первому сообщению пользователя (undefined, если его нет). */
export function deriveChatTitle(messages: ChatMessage[]): string | undefined {
  const firstUser = messages.find((message) => message.role === 'user')
  if (!firstUser?.content.trim()) return undefined
  return makeChatTitle(firstUser.content)
}
