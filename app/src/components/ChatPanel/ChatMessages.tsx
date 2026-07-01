import { lazy, Suspense } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { ChatMessage } from '../../types'
import { AgentWorkPanel } from '../AgentWorkPanel'
import { WelcomePanel } from '../WelcomePanel'
import { EditPreviewBlock } from '../EditPreviewBlock'
import { MessageRoleBadge } from '../MessageRoleBadge'
import { formatElapsed, formatTokenCount } from '../../../shared/generationMetrics'
import type { AgentWorkTrace, DisplayItem } from './helpers'
import { visibleAssistantContent, workTraceIsEmpty, findLastWorkDisplayIndex } from './helpers'
import { MessageRow } from './MessageRow'
import type { AgentPhase } from '../../contexts/agentPhase'
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
  agentPhase: AgentPhase
  draftMessageIdRef: React.RefObject<string | null>
  runStats: { tokens: number; elapsedSec: number } | null
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
  isChatMode?: boolean
}

function renderWorkPanel(
  work: AgentWorkTrace | undefined,
  opts: {
    busy: boolean
    agentPhase: AgentPhase
    draftMessageId: string | null
    message?: ChatMessage
    liveNarration?: string
    showLiveThinking?: boolean
  }
) {
  if (!opts.busy || !work || workTraceIsEmpty(work)) return null
  return (
    <AgentWorkPanel
      work={work}
      message={opts.message}
      busy={opts.busy}
      agentPhase={opts.agentPhase}
      draftMessageId={opts.draftMessageId}
      liveNarration={opts.liveNarration}
      showLiveThinking={opts.showLiveThinking}
    />
  )
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
  agentPhase,
  draftMessageIdRef,
  runStats,
  togglePinMessage,
  retryUserMessage,
  editUserMessage,
  regenerateAssistantMessage,
  onFileTimeline,
  onSaveAsSkill,
  onExternalLink,
  respondPreview,
  onInsertPrompt,
  recentProjects = [],
  onOpenRecentProject,
  onBrowseProject,
  showLiveThinking = false,
  isChatMode = false
}: Props) {
  const draftMessageId = draftMessageIdRef.current
  const workOpts = { busy, agentPhase, draftMessageId, showLiveThinking }
  const lastWorkIndex = busy ? findLastWorkDisplayIndex(displayItems) : -1

  return (
    <div className={styles.messages} ref={scrollRef}>
      {!chatId && (
        <div className="empty">
          {isChatMode
            ? 'Создай чат слева и начни разговор.'
            : 'Создай чат слева, выбери проект и опиши задачу.'}
        </div>
      )}
      {chatId && messagesCount === 0 && (
        <WelcomePanel
          onSelect={onInsertPrompt}
          isChatMode={isChatMode}
          hasProject={Boolean(projectPath)}
          currentProjectPath={projectPath ?? ''}
          recentProjects={recentProjects}
          onOpenRecentProject={onOpenRecentProject}
          onBrowseProject={onBrowseProject}
        />
      )}

      {pinnedDisplayItems.length > 0 && (
        <div className="pinned-messages-section">
          <div className="pinned-messages-title">📌 Закреплённые</div>
          {pinnedDisplayItems.map((item) =>
            item.kind === 'pending-work' ? (
              <div key={item.key}>{renderWorkPanel(item.work, workOpts)}</div>
            ) : (
              <div key={item.message.id} className={`message ${item.message.role} pinned`}>
                {!workTraceIsEmpty(item.work) &&
                  renderWorkPanel(item.work!, { ...workOpts, message: item.message })}
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
                    onExternalLink={onExternalLink}
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

          if (item.kind === 'pending-work') {
            content = vItem.index === lastWorkIndex ? renderWorkPanel(item.work, workOpts) : null
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
                  work={item.work}
                  showWorkPanel={!busy || vItem.index === lastWorkIndex}
                  pinned={pinnedMessageIds.has(msg.id)}
                  busy={busy}
                  agentPhase={agentPhase}
                  draftMessageId={draftMessageId}
                  isStreaming={msg.id === draftMessageIdRef.current}
                  onPin={togglePinMessage}
                  onRetry={retryUserMessage}
                  onEdit={editUserMessage}
                  onRegenerate={regenerateAssistantMessage}
                  onFileTimeline={onFileTimeline}
                  onSaveAsSkill={onSaveAsSkill}
                  onExternalLink={onExternalLink}
                  showLiveThinking={showLiveThinking}
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
