import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ChatMessage } from '../../types'
import type { RunStats } from '../../../shared/generationMetrics'
import type { AgentPhase } from '../AgentStatusBar'
import { groupToolMessages, shouldShowAssistantMessage } from './helpers'
import { ChatMessages } from './ChatMessages'

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
  respondPreview: (messageId: string, previewId: string, apply: boolean) => void
  onInsertPrompt: (text: string) => void
  recentProjects?: string[]
  onOpenRecentProject?: (path: string) => void
  onBrowseProject?: () => void
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
  respondPreview,
  onInsertPrompt,
  recentProjects,
  onOpenRecentProject,
  onBrowseProject
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

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

  scrollToBottomRef.current = (force?: boolean) => {
    if ((force || atBottomRef.current) && displayItems.length > 0) {
      virtualizer.scrollToIndex(displayItems.length - 1, { align: 'end', behavior: 'smooth' })
    }
    if (force) atBottomRef.current = true
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    scrollToBottomRef.current?.()
  }, [messages.length, queueSize, scrollToBottomRef])

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
      respondPreview={respondPreview}
      onInsertPrompt={onInsertPrompt}
      recentProjects={recentProjects}
      onOpenRecentProject={onOpenRecentProject}
      onBrowseProject={onBrowseProject}
    />
  )
})
