import { useEffect, useRef } from 'react'
import type { AgentContextPreview, ChatMessage } from '../types'
import { CONTEXT_PREVIEW_DEBOUNCE_MS } from '../../shared/constants'

interface Callbacks {
  onPreview: (preview: AgentContextPreview | null) => void
  onLoading: (loading: boolean) => void
}

export function useContextPreview(
  chatId: string | null,
  projectPath: string,
  messages: ChatMessage[],
  input: string,
  model: string,
  busy: boolean,
  { onPreview, onLoading }: Callbacks
): void {
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const onPreviewRef = useRef(onPreview)
  onPreviewRef.current = onPreview
  const onLoadingRef = useRef(onLoading)
  onLoadingRef.current = onLoading

  // Стабильный ключ: не перезапускаем на каждый токен стриминга,
  // только когда меняется число сообщений или id последнего.
  const lastMsgId = messages[messages.length - 1]?.id ?? ''
  const messagesKey = `${messages.length}:${lastMsgId}`

  useEffect(() => {
    if (busy || !chatId || !model || !input.trim()) {
      onLoadingRef.current(false)
      return
    }

    let active = true
    const timer = window.setTimeout(async () => {
      onLoadingRef.current(true)
      try {
        const preview = await window.codeviper.previewAgentContext(
          projectPath,
          messagesRef.current,
          input.trim(),
          model
        )
        if (active) onPreviewRef.current(preview)
      } catch (err) {
        if (!active) return
        console.error('[useContextPreview]', err instanceof Error ? err.message : String(err))
        onPreviewRef.current(null)
      } finally {
        if (active) onLoadingRef.current(false)
      }
    }, CONTEXT_PREVIEW_DEBOUNCE_MS)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
    // messagesKey вместо messages — не перезапускаем на каждый токен стриминга
  }, [chatId, projectPath, messagesKey, input, model, busy])
}
