import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../../types'
import type { AgentPhase } from '../AgentStatusBar'
import { AgentWorkPanel } from '../AgentWorkPanel'
import { MessageCopyButton } from '../MessageCopyButton'
import type { AgentWorkTrace } from './helpers'
import { messageCopyText, visibleAssistantContent, workTraceIsEmpty } from './helpers'

const MessageBody = lazy(() => import('../MessageBody').then((m) => ({ default: m.MessageBody })))

export const MessageRow = memo(function MessageRow({
  message,
  work,
  showWorkPanel = true,
  pinned,
  busy,
  agentPhase,
  draftMessageId,
  isStreaming,
  onPin,
  onRetry,
  onEdit,
  onRegenerate,
  onFileTimeline,
  onSaveAsSkill,
  onExternalLink,
  showLiveThinking = false
}: {
  message: ChatMessage
  work?: AgentWorkTrace
  showWorkPanel?: boolean
  pinned: boolean
  busy: boolean
  agentPhase: AgentPhase
  draftMessageId: string | null
  isStreaming?: boolean
  onPin: (id: string) => void
  onRetry: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
  onRegenerate?: (message: ChatMessage) => void
  onFileTimeline?: (path: string) => void
  onSaveAsSkill?: (content: string) => void
  onExternalLink?: (url: string) => void
  showLiveThinking?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const visibleContent = visibleAssistantContent(message.content, !!isStreaming)
  const streamIntoThinking = Boolean(isStreaming && busy)
  const showAnswer = visibleContent.length > 0 && !streamIntoThinking
  const liveNarration = streamIntoThinking ? visibleContent : undefined

  useEffect(() => {
    if (!menuOpen) return
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen])

  return (
    <div className={`message ${message.role}${pinned ? ' pinned' : ''}`}>
      <div className="message-menu" ref={menuRef}>
        <button
          type="button"
          className="btn message-menu-trigger"
          title="Действия"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ···
        </button>
        {menuOpen && (
          <div className="message-menu-dropdown" onClick={() => setMenuOpen(false)}>
            <MessageCopyButton text={messageCopyText(message)} asMenuItem />
            {!busy && (
              <button type="button" className="message-menu-item" onClick={() => onPin(message.id)}>
                {pinned ? '📌 Открепить' : '📌 Закрепить'}
              </button>
            )}
            {!busy && message.role === 'user' && (
              <>
                <button
                  type="button"
                  className="message-menu-item"
                  onClick={() => onRetry(message)}
                >
                  ↺ Повторить
                </button>
                <button type="button" className="message-menu-item" onClick={() => onEdit(message)}>
                  ✎ Изменить
                </button>
              </>
            )}
            {!busy && message.role === 'assistant' && onRegenerate && (
              <button
                type="button"
                className="message-menu-item"
                onClick={() => onRegenerate(message)}
              >
                ↺ Перегенерировать
              </button>
            )}
            {!busy && message.role === 'assistant' && onSaveAsSkill && (
              <button
                type="button"
                className="message-menu-item"
                onClick={() => onSaveAsSkill(visibleAssistantContent(message.content))}
              >
                🎓 Сохранить как навык
              </button>
            )}
            {message.role === 'assistant' && message.durationMs != null && (
              <span className="message-menu-meta">⏱ {(message.durationMs / 1000).toFixed(1)}s</span>
            )}
          </div>
        )}
      </div>
      {showWorkPanel && !workTraceIsEmpty(work) && (
        <AgentWorkPanel
          work={work!}
          message={message}
          busy={busy}
          agentPhase={agentPhase}
          draftMessageId={draftMessageId}
          liveNarration={liveNarration}
          showLiveThinking={showLiveThinking}
        />
      )}
      {message.images && message.images.length > 0 && (
        <div className="message-images">
          {message.images.map((img) => (
            <img
              key={img.name}
              src={img.dataUrl}
              alt={img.name}
              className="message-image-thumb"
              title={img.name}
            />
          ))}
        </div>
      )}
      {showAnswer && (
        <Suspense fallback={null}>
          <MessageBody
            role={message.role}
            content={message.role === 'assistant' ? visibleContent : message.content}
            onFileTimeline={onFileTimeline}
            onExternalLink={onExternalLink}
          />
        </Suspense>
      )}
    </div>
  )
})
