import { memo, useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ChatMessage } from '../../types'
import type { RunStats } from '../../../shared/generationMetrics'
import type { AgentPhase } from '../AgentStatusBar'
import { groupToolMessages, shouldShowAssistantMessage } from './helpers'
import { ChatMessages } from './ChatMessages'

/** Допуск «у низа» — чуть больше, чтобы не отлипать от случайного микроскролла. */
const STICKY_THRESHOLD_PX = 140

interface Props {
  chatId: string | null
  projectPath: string | null
  messages: ChatMessage[]
  pinnedMessageIds: Set<string>
  busy: boolean
  agentPhase: AgentPhase
  queueSize: number
  draftMessageIdRef: MutableRefObject<string | null>
  runStats: RunStats | null
  scrollToBottomRef: MutableRefObject<((force?: boolean) => void) | null>
  togglePinMessage: (id: string) => void
  retryUserMessage: (message: ChatMessage) => void
  editUserMessage: (message: ChatMessage) => void
  regenerateAssistantMessage: (message: ChatMessage) => void
  onFileTimeline: (path: string) => void
  onSaveAsSkill: (content: string) => void
  onExternalLink: (url: string) => void
  respondPreview: (messageId: string, previewId: string, apply: boolean) => void
  onInsertPrompt: (text: string) => void
  recentProjects?: string[]
  onOpenRecentProject?: (path: string) => void
  onBrowseProject?: () => void
  showLiveThinking?: boolean
}

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD_PX
}

/** Список сообщений + virtualizer — изолирован от ре-рендеров поля ввода. */
export const ChatPanelMessagesPane = memo(function ChatPanelMessagesPane({
  chatId,
  projectPath,
  messages,
  pinnedMessageIds,
  busy,
  agentPhase,
  queueSize,
  draftMessageIdRef,
  runStats,
  scrollToBottomRef,
  togglePinMessage,
  retryUserMessage,
  editUserMessage,
  regenerateAssistantMessage,
  onFileTimeline,
  onSaveAsSkill,
  onExternalLink,
  respondPreview,
  onInsertPrompt,
  recentProjects,
  onOpenRecentProject,
  onBrowseProject,
  showLiveThinking = false
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const scrollRafRef = useRef<number | null>(null)
  const displayCountRef = useRef(0)

  const displayItems = useMemo(
    () => groupToolMessages(messages.filter(shouldShowAssistantMessage)),
    [messages]
  )

  const pinnedDisplayItems = useMemo(
    () =>
      pinnedMessageIds.size > 0
        ? groupToolMessages(
            messages.filter((m) => pinnedMessageIds.has(m.id) && shouldShowAssistantMessage(m))
          )
        : [],
    [messages, pinnedMessageIds]
  )

  const virtualizer = useVirtualizer({
    count: displayItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
    measureElement:
      typeof window !== 'undefined' && navigator.userAgent.includes('Firefox')
        ? undefined
        : (el) => el.getBoundingClientRect().height
  })

  const listTotalSize = virtualizer.getTotalSize()
  displayCountRef.current = displayItems.length

  const tailScrollKey = useMemo(() => {
    const last = messages[messages.length - 1]
    if (!last) return 'empty'
    return [
      last.id,
      last.role,
      last.content.length,
      last.thinking?.length ?? 0,
      last.toolOutput?.length ?? 0
    ].join(':')
  }, [messages])

  const scrollToBottom = useCallback(
    (force?: boolean) => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current)
      }

      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null
        const el = scrollRef.current
        const count = displayCountRef.current
        if (!el || count === 0) return

        if (!force && !atBottomRef.current && !isNearBottom(el)) return

        const behavior = force && !busy ? ('smooth' as const) : ('auto' as const)
        virtualizer.scrollToIndex(count - 1, { align: 'end', behavior })
        el.scrollTop = el.scrollHeight - el.clientHeight

        // После remeasure virtualizer иногда недокручивает — второй кадр надёжнее.
        requestAnimationFrame(() => {
          const box = scrollRef.current
          if (!box) return
          virtualizer.scrollToIndex(displayCountRef.current - 1, { align: 'end', behavior: 'auto' })
          box.scrollTop = box.scrollHeight - box.clientHeight
        })

        if (force) atBottomRef.current = true
      })
    },
    [virtualizer, busy]
  )

  scrollToBottomRef.current = scrollToBottom

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      atBottomRef.current = isNearBottom(el)
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [chatId])

  useEffect(() => {
    atBottomRef.current = true
    scrollToBottom(true)
  }, [chatId, scrollToBottom])

  useEffect(() => {
    if (busy) {
      atBottomRef.current = true
      scrollToBottom(true)
    }
  }, [busy, scrollToBottom])

  useEffect(() => {
    scrollToBottom()
  }, [
    messages.length,
    queueSize,
    tailScrollKey,
    displayItems.length,
    listTotalSize,
    scrollToBottom
  ])

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current)
    }
  }, [])

  return (
    <ChatMessages
      chatId={chatId}
      projectPath={projectPath}
      messagesCount={messages.length}
      displayItems={displayItems}
      pinnedDisplayItems={pinnedDisplayItems}
      pinnedMessageIds={pinnedMessageIds}
      scrollRef={scrollRef}
      virtualizer={virtualizer}
      busy={busy}
      agentPhase={agentPhase}
      draftMessageIdRef={draftMessageIdRef}
      runStats={runStats}
      togglePinMessage={togglePinMessage}
      retryUserMessage={retryUserMessage}
      editUserMessage={editUserMessage}
      regenerateAssistantMessage={regenerateAssistantMessage}
      onFileTimeline={onFileTimeline}
      onSaveAsSkill={onSaveAsSkill}
      onExternalLink={onExternalLink}
      respondPreview={respondPreview}
      onInsertPrompt={onInsertPrompt}
      recentProjects={recentProjects}
      onOpenRecentProject={onOpenRecentProject}
      onBrowseProject={onBrowseProject}
      showLiveThinking={showLiveThinking}
    />
  )
})
