import { describe, it, expect } from 'vitest'
import { chatMatchesSearchQuery, lastMessagePreview } from '../src/components/ChatHistoryPanel'
import type { SavedChat } from '../src/types'

function chat(partial: Partial<SavedChat> & Pick<SavedChat, 'id' | 'title'>): SavedChat {
  return {
    projectPath: '',
    folderId: null,
    messages: [],
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    mode: 'code',
    ...partial
  }
}

describe('ChatHistoryPanel search', () => {
  it('lastMessagePreview берёт последний user/assistant', () => {
    const c = chat({
      id: '1',
      title: 'T',
      messages: [
        { id: 'm1', role: 'user', content: 'старый', timestamp: 1 },
        { id: 'm2', role: 'assistant', content: 'ответ про grep', timestamp: 2 }
      ]
    })
    expect(lastMessagePreview(c)).toBe('ответ про grep')
  })

  it('chatMatchesSearchQuery ищет по заголовку и последнему сообщению', () => {
    const c = chat({
      id: '1',
      title: 'Багфикс',
      messages: [{ id: 'm1', role: 'user', content: 'исправь typecheck', timestamp: 1 }]
    })
    expect(chatMatchesSearchQuery(c, 'багфикс')).toBe(true)
    expect(chatMatchesSearchQuery(c, 'typecheck')).toBe(true)
    expect(chatMatchesSearchQuery(c, 'roadmap')).toBe(false)
  })
})
