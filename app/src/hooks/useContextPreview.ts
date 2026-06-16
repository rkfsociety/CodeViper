import { useEffect, useState } from 'react'
import type { AgentContextPreview, ChatMessage } from '../types'

export function useContextPreview(
  chatId: string | null,
  projectPath: string,
  messages: ChatMessage[],
  input: string,
  model: string
): {
  contextPreview: AgentContextPreview | null
  contextLoading: boolean
  setContextPreview: React.Dispatch<React.SetStateAction<AgentContextPreview | null>>
} {
  const [contextPreview, setContextPreview] = useState<AgentContextPreview | null>(null)
  const [contextLoading, setContextLoading] = useState(false)

  useEffect(() => {
    if (!chatId || !model) {
      setContextPreview(null)
      return
    }

    const timer = window.setTimeout(async () => {
      setContextLoading(true)
      try {
        const preview = await window.codeviper.previewAgentContext(
          projectPath,
          messages,
          input.trim(),
          model
        )
        setContextPreview(preview)
      } catch {
        setContextPreview(null)
      } finally {
        setContextLoading(false)
      }
    }, 350)

    return () => window.clearTimeout(timer)
  }, [chatId, projectPath, messages, input, model])

  return { contextPreview, contextLoading, setContextPreview }
}
