import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../src/types'
import {
  findLastWorkDisplayIndex,
  groupToolMessages,
  isIntermediateAssistant
} from '../src/components/ChatPanel/helpers'

function msg(
  partial: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role' | 'content'>
): ChatMessage {
  return { timestamp: 1, ...partial }
}

describe('isIntermediateAssistant', () => {
  it('true когда после ассистента идут только tool-сообщения', () => {
    const messages: ChatMessage[] = [
      msg({ id: 'a1', role: 'assistant', content: 'Планирую…' }),
      msg({ id: 't1', role: 'tool', content: '▶ read' }),
      msg({ id: 'a2', role: 'assistant', content: 'Готово' })
    ]
    expect(isIntermediateAssistant(messages, 0)).toBe(true)
    expect(isIntermediateAssistant(messages, 2)).toBe(false)
  })
})

describe('groupToolMessages', () => {
  it('не показывает промежуточный ответ ассистента перед инструментами', () => {
    const messages: ChatMessage[] = [
      msg({ id: 'u1', role: 'user', content: 'задача' }),
      msg({
        id: 'a1',
        role: 'assistant',
        content: 'Сначала прочитаю файл…',
        thinking: 'размышляю'
      }),
      msg({ id: 't1', role: 'tool', content: '✓ read_file' }),
      msg({ id: 'a2', role: 'assistant', content: 'Сделано.' })
    ]
    const items = groupToolMessages(messages)
    const assistantBodies = items
      .filter((i) => i.kind === 'message' && i.message.role === 'assistant')
      .map((i) => (i.kind === 'message' ? i.message.content : ''))
    expect(assistantBodies).toEqual(['Сделано.'])
    const final = items.find((i) => i.kind === 'message' && i.message.id === 'a2')
    expect(final?.kind === 'message' && final.work?.thinking).toContain('Сначала прочитаю')
    expect(final?.kind === 'message' && final.work?.thinking).toContain('размышляю')
  })

  it('findLastWorkDisplayIndex указывает на последний work-элемент', () => {
    const items = groupToolMessages([
      msg({ id: 'u1', role: 'user', content: 'x' }),
      msg({ id: 'a1', role: 'assistant', content: 'plan', thinking: 't' }),
      msg({ id: 't1', role: 'tool', content: '✓' }),
      msg({ id: 'a2', role: 'assistant', content: 'ok' })
    ])
    expect(findLastWorkDisplayIndex(items)).toBe(items.length - 1)
  })
})
