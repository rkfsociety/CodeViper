import { useEffect, useRef } from 'react'
import type { AgentContextPreview, ChatMessage } from '../types'
import { CONTEXT_PREVIEW_DEBOUNCE_MS } from '../../shared/constants'

interface Callbacks {
  onPreview: (preview: AgentContextPreview | null) => void
  onLoading: (loading: boolean) => void
}

interface CacheEntry {
  cacheKey: string
  preview: AgentContextPreview | null
}

export function useContextPreview(
  chatId: string | null,
  projectPath: string,
  messages: ChatMessage[],
  input: string,
  model: string,
  busy: boolean,
  /** Запрашивать превью только при открытом попапе/модалке контекста */
  previewOpen: boolean,
  { onPreview, onLoading }: Callbacks
): void {
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const onPreviewRef = useRef(onPreview)
  onPreviewRef.current = onPreview
  const onLoadingRef = useRef(onLoading)
  onLoadingRef.current = onLoading

  const cacheRef = useRef<CacheEntry | null>(null)

  // Стабильный ключ: не перезапускаем на каждый токен стриминга,
  // только когда меняется число сообщений или id последнего.
  const lastMsgId = messages[messages.length - 1]?.id ?? ''
  const messagesKey = `${messages.length}:${lastMsgId}`
  const draftText = previewOpen ? input.trim() : ''
  const cacheKey = `${messagesKey}:${model}:${draftText}`

  useEffect(() => {
    if (!previewOpen || busy || !chatId || !model) {
      onLoadingRef.current(false)
      return
    }

    const cached = cacheRef.current
    if (cached && cached.cacheKey === cacheKey) {
      onPreviewRef.current(cached.preview)
      return
    }

    let active = true
    const timer = window.setTimeout(async () => {
      onLoadingRef.current(true)
      try {
        const preview = await window.codeviper.previewAgentContext(
          projectPath,
          messagesRef.current,
          draftText,
          model
        )
        if (active) {
          cacheRef.current = { cacheKey, preview }
          onPreviewRef.current(preview)
        }
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
    // previewOpen=false — не строим превью при старте/вводе; только по клику на ◎
  }, [chatId, projectPath, cacheKey, draftText, model, busy, previewOpen])
}
