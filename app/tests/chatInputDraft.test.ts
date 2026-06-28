import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  CHAT_INPUT_DRAFT_DEBOUNCE_MS,
  clearChatInputDraft,
  loadChatInputDraft,
  saveChatInputDraft
} from '../src/lib/chatInputDraft'

describe('chatInputDraft', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      }
    })
  })

  it('debounce константа 500 мс', () => {
    expect(CHAT_INPUT_DRAFT_DEBOUNCE_MS).toBe(500)
  })

  it('сохраняет и восстанавливает черновик per chatId', () => {
    saveChatInputDraft('chat-a', 'черновик A')
    saveChatInputDraft('chat-b', 'черновик B')
    expect(loadChatInputDraft('chat-a')).toBe('черновик A')
    expect(loadChatInputDraft('chat-b')).toBe('черновик B')
    expect(loadChatInputDraft('missing')).toBe('')
  })

  it('clearChatInputDraft удаляет ключ', () => {
    saveChatInputDraft('chat-a', 'текст')
    clearChatInputDraft('chat-a')
    expect(loadChatInputDraft('chat-a')).toBe('')
    expect(store.has('cv-chat-input-draft:chat-a')).toBe(false)
  })

  it('пустая строка удаляет черновик', () => {
    saveChatInputDraft('chat-a', 'текст')
    saveChatInputDraft('chat-a', '')
    expect(loadChatInputDraft('chat-a')).toBe('')
  })
})
