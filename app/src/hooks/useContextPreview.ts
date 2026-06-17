import { useEffect, useState } from 'react'
import type { AgentContextPreview, ChatMessage } from '../types'
import { CONTEXT_PREVIEW_DEBOUNCE_MS } from '../../shared/constants'

export function useContextPreview(
  chatId: string | null,
  projectPath: string,
  messages: ChatMessage[],
  input: string,
  model: string
): {
  contextPreview: AgentContextPreview | null
  contextLoading: boolean
  contextError: string | null
  setContextPreview: React.Dispatch<React.SetStateAction<AgentContextPreview | null>>
} {
  const [contextPreview, setContextPreview] = useState<AgentContextPreview | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)

  useEffect(() => {
    if (!chatId || !model || !input.trim()) {
      setContextPreview(null)
      setContextError(null)
      return
    }

    const timer = window.setTimeout(async () => {
      setContextLoading(true)
      setContextError(null)
      try {
        const preview = await window.codeviper.previewAgentContext(
          projectPath,
          messages,
          input.trim(),
          model
        )
        setContextPreview(preview)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[useContextPreview]', message)
        setContextPreview(null)
        setContextError(message)
      } finally {
        setContextLoading(false)
      }
    }, CONTEXT_PREVIEW_DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [chatId, projectPath, messages, input, model])

  return { contextPreview, contextLoading, contextError, setContextPreview }
}
