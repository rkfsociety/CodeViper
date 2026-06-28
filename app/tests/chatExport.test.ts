import { describe, it, expect } from 'vitest'
import {
  buildChatExportPayload,
  chatExportJsonFilename,
  chatExportToMarkdown,
  chatToMarkdown,
  sanitizeExportFilename
} from '../shared/chatExport'
import type { SavedChat } from '../src/types'

function chat(partial: Partial<SavedChat> & Pick<SavedChat, 'id' | 'title'>): SavedChat {
  return {
    projectPath: 'F:/proj',
    folderId: null,
    messages: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    mode: 'code',
    ...partial
  }
}

describe('chatExport', () => {
  it('buildChatExportPayload включает чат и трейс', () => {
    const c = chat({
      id: 'abc-123',
      title: 'Тест',
      messages: [{ id: 'm1', role: 'user', content: 'привет', timestamp: 1 }]
    })
    const payload = buildChatExportPayload(c, [
      { ts: 2, kind: 'run_start', label: 'Старт', data: { message: 'привет' } }
    ])
    expect(payload.exportSchemaVersion).toBe(1)
    expect(payload.chat.id).toBe('abc-123')
    expect(payload.trace).toHaveLength(1)
    expect(payload.exportedAt).toBeGreaterThan(0)
  })

  it('chatToMarkdown включает tool output и thinking', () => {
    const md = chatToMarkdown(
      chat({
        id: '1',
        title: 'Анализ',
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            content: 'готово',
            thinking: 'думаю…',
            toolName: 'grep',
            toolOutput: 'match: foo',
            timestamp: 1000
          }
        ]
      })
    )
    expect(md).toContain('# Анализ')
    expect(md).toContain('Рассуждения')
    expect(md).toContain('думаю…')
    expect(md).toContain('grep')
    expect(md).toContain('match: foo')
  })

  it('chatExportToMarkdown добавляет секцию трейса', () => {
    const c = chat({ id: '1', title: 'T' })
    const md = chatExportToMarkdown(
      buildChatExportPayload(c, [
        { ts: 1, kind: 'tool_call', label: 'grep', data: { name: 'grep' } }
      ])
    )
    expect(md).toContain('## Трассировка агента')
    expect(md).toContain('tool_call')
  })

  it('sanitizeExportFilename убирает недопустимые символы', () => {
    expect(sanitizeExportFilename('foo/bar:baz')).toBe('foo_bar_baz')
    expect(chatExportJsonFilename({ title: 'Мой чат', id: 'abcd1234efgh' })).toMatch(
      /^codeviper-chat-.+-abcd1234\.json$/
    )
  })
})
