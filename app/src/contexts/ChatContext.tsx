import { createContext, useContext } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { ChatMessage, ChatStore, InterruptedDraft, SavedChat } from '../types'

export interface ChatContextValue {
  messages: ChatMessage[]
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  activeChatId: string | null
  chatStore: ChatStore | null
  activeChat: SavedChat | null
  activeProjectPath: string
  interruptedDraft: InterruptedDraft | null | undefined
  refreshChatStore: () => Promise<ChatStore>
}

const defaultChatContext: ChatContextValue = {
  messages: [],
  setMessages: () => {},
  activeChatId: null,
  chatStore: null,
  activeChat: null,
  activeProjectPath: '',
  interruptedDraft: null,
  refreshChatStore: async () => ({
    chats: [],
    folders: [],
    activeChatId: null,
    version: 2 as const
  })
}

export const ChatContext = createContext<ChatContextValue>(defaultChatContext)

export function useChatContext(): ChatContextValue {
  return useContext(ChatContext)
}
