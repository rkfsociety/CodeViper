import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface QueueContextValue {
  /** id чатов, в которых сейчас работает агент */
  busyChats: Set<string>
  /** Обратная совместимость: true если хотя бы один чат занят */
  chatBusy: boolean
  markChatBusy: (chatId: string, busy: boolean) => void
}

const defaultValue: QueueContextValue = {
  busyChats: new Set(),
  chatBusy: false,
  markChatBusy: () => {}
}

const QueueContext = createContext<QueueContextValue>(defaultValue)

export function QueueProvider({ children }: { children: ReactNode }) {
  const [busyChats, setBusyChats] = useState<Set<string>>(new Set())

  const markChatBusy = useCallback((chatId: string, busy: boolean) => {
    setBusyChats((prev) => {
      const next = new Set(prev)
      if (busy) next.add(chatId)
      else next.delete(chatId)
      return next
    })
  }, [])

  return (
    <QueueContext.Provider value={{ busyChats, chatBusy: busyChats.size > 0, markChatBusy }}>
      {children}
    </QueueContext.Provider>
  )
}

export function useChatBusy(): QueueContextValue {
  return useContext(QueueContext)
}
