import { lazy, Suspense } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { ChatMessage } from '../../types'
import { ThinkingBlock } from '../ThinkingBlock'
import { AllToolsGroup } from '../AllToolsGroup'
import { WelcomePanel } from '../WelcomePanel'
import { EditPreviewBlock } from '../EditPreviewBlock'
import { MessageRoleBadge } from '../MessageRoleBadge'
import { formatElapsed, formatTokenCount } from '../../../shared/generationMetrics'
import type { DisplayItem } from './helpers'
import { visibleAssistantContent } from './helpers'
import { MessageRow } from './MessageRow'
import styles from '../ChatPanel.module.css'

const MessageBody = lazy(() => import('../MessageBody').then((m) => ({ default: m.MessageBody })))

interface Props {
  chatId: string | null
  projectPath: string | null
  messagesCount: number
  displayItems: DisplayItem[]
  pinnedDisplayItems: DisplayItem[]
  pinnedMessageIds: Set<string>
  scrollRef: React.RefObject<HTMLDivElement | null>
  virtualizer: Virtualizer<HTMLDivElement, Element>
  busy: boolean
  draftMessageIdRef: React.RefObject<string | null>
  runStats: { tokens: number; elapsedSec: number } | null
  togglePinMessage: (id: string) => void
  retryUserMessage: (message: ChatMessage) => void
  editUserMessage: (message: ChatMessage) => void
  onFileTimeline: (path: string) => void
  onSaveAsSkill: (content: string) => void
  respondPreview: (messageId: string, previewId: string, apply: boolean) => void
  onInsertPrompt: (text: string) => void
}

function isReasoningLive(
  busy: boolean,
  draftMessageIdRef: React.RefObject<string | null>,
  assistantId: string
): boolean {
  return busy && draftMessageIdRef.current === assistantId
}

export function ChatMessages({
  chatId,
  projectPath,
  messagesCount,
  displayItems,
  pinnedDisplayItems,
  pinnedMessageIds,
  scrollRef,
  virtualizer,
  busy,
  draftMessageIdRef,
  runStats,
  togglePinMessage,
  retryUserMessage,
  editUserMessage,
  onFileTimeline,
  onSaveAsSkill,
  respondPreview,
  onInsertPrompt
}: Props) {
  return (
    <div className={styles.messages} ref={scrollRef}>
      {!chatId && <div className="empty">Создай чат слева, выбери проект и опиши задачу.</div>}
      {chatId && !projectPath && messagesCount === 0 && (
        <div className="empty">Выбери папку с кодом — кнопка «Выбрать проект» выше.</div>
      )}
      {chatId && projectPath && messagesCount === 0 && <WelcomePanel onSelect={onInsertPrompt} />}

      {pinnedDisplayItems.length > 0 && (
        <div className="pinned-messages-section">
          <div className="pinned-messages-title">📌 Закреплённые</div>
          {pinnedDisplayItems.map((item) =>
            item.kind === 'all-tools' ? (
              <div key={item.key}>
                {item.items.length > 0 && <AllToolsGroup items={item.items} />}
                {item.reasoning && (
                  <ThinkingBlock
                    content={item.reasoning.thinking}
                    live={isReasoningLive(busy, draftMessageIdRef, item.reasoning.assistant.id)}
                  />
                )}
              </div>
            ) : (
              <div key={item.message.id} className={`message ${item.message.role} pinned`}>
                <div className="message-header">
                  <MessageRoleBadge role={item.message.role} toolName={item.message.toolName} />
                  <button
                    type="button"
                    className="btn message-pin-btn active"
                    title="Открепить"
                    onClick={() => togglePinMessage(item.message.id)}
                  >
                    📌
                  </button>
                </div>
                <Suspense fallback={null}>
                  <MessageBody
                    role={item.message.role}
                    content={
                      item.message.role === 'assistant'
                        ? visibleAssistantContent(item.message.content)
                        : item.message.content
                    }
                    onFileTimeline={onFileTimeline}
                  />
                </Suspense>
              </div>
            )
          )}
        </div>
      )}

      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vItem) => {
          const item = displayItems[vItem.index]!
          let content: React.ReactNode

          if (item.kind === 'all-tools') {
            content = (
              <div>
                {item.items.length > 0 && <AllToolsGroup items={item.items} />}
                {item.reasoning && (
                  <ThinkingBlock
                    content={item.reasoning.thinking}
                    live={isReasoningLive(busy, draftMessageIdRef, item.reasoning.assistant.id)}
                  />
                )}
              </div>
            )
          } else {
            const msg = item.message
            if (msg.previewId && msg.previewDiff !== undefined) {
              content = (
                <EditPreviewBlock
                  messageId={msg.id}
                  previewId={msg.previewId}
                  path={msg.previewPath ?? ''}
                  diff={msg.previewDiff}
                  status={msg.previewStatus ?? 'cancelled'}
                  onRespond={respondPreview}
                />
              )
            } else {
              content = (
                <MessageRow
                  message={msg}
                  pinned={pinnedMessageIds.has(msg.id)}
                  busy={busy}
                  isStreaming={msg.id === draftMessageIdRef.current}
                  onPin={togglePinMessage}
                  onRetry={retryUserMessage}
                  onEdit={editUserMessage}
                  onFileTimeline={onFileTimeline}
                  onSaveAsSkill={onSaveAsSkill}
                />
              )
            }
          }

          return (
            <div
              key={vItem.key}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vItem.start}px)`
              }}
            >
              {content}
            </div>
          )
        })}
      </div>

      {!busy && runStats && runStats.tokens > 0 && (
        <div className={styles.runMeta}>
          {formatElapsed(runStats.elapsedSec)} · {formatTokenCount(runStats.tokens)} токенов
        </div>
      )}
    </div>
  )
}
