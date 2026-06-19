import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface QueueContextValue {
  chatBusy: boolean
  setChatBusy: (busy: boolean) => void
}

const defaultValue: QueueContextValue = {
  chatBusy: false,
  setChatBusy: () => {}
}

const QueueContext = createContext<QueueContextValue>(defaultValue)

export function QueueProvider({ children }: { children: ReactNode }) {
  const [chatBusy, setChatBusy] = useState(false)
  return <QueueContext.Provider value={{ chatBusy, setChatBusy }}>{children}</QueueContext.Provider>
}

export function useChatBusy(): QueueContextValue {
  return useContext(QueueContext)
}
