import { describe, it, expect } from 'vitest'
import {
  chatMatchesSearchQuery,
  lastMessagePreview,
  sortChatsByStarredAndPinned
} from '../src/components/ChatHistoryPanel'
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

  it('sortChatsByStarredAndPinned ставит избранные и закреплённые сверху', () => {
    const plain = chat({ id: '1', title: 'A', updatedAt: '2026-06-03' })
    const starred = chat({ id: '2', title: 'B', starred: true, updatedAt: '2026-06-01' })
    const pinned = chat({ id: '3', title: 'C', pinned: true, updatedAt: '2026-06-02' })
    const starredPinned = chat({
      id: '4',
      title: 'D',
      starred: true,
      pinned: true,
      updatedAt: '2026-06-04'
    })

    const sorted = [plain, starred, pinned, starredPinned].sort(sortChatsByStarredAndPinned)
    expect(sorted.map((c) => c.id)).toEqual(['4', '2', '3', '1'])
  })
})
