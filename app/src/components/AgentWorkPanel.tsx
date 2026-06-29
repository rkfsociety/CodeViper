import { useLayoutEffect, useRef } from 'react'
import type { ChatMessage } from '../types'
import type { AgentPhase } from './AgentStatusBar'
import type { AgentWorkTrace } from './ChatPanel/helpers'
import { AllToolsGroup } from './AllToolsGroup'
import styles from './AgentWorkPanel.module.css'

interface Props {
  work: AgentWorkTrace
  message?: ChatMessage
  busy: boolean
  agentPhase: AgentPhase
  draftMessageId: string | null
  /** Текст ответа в процессе стрима — показывается в блоке размышлений, не в теле сообщения */
  liveNarration?: string
  /** @deprecated настройка больше не скрывает live-блок; оставлено для совместимости props */
  showLiveThinking?: boolean
}

export function AgentWorkPanel({
  work,
  busy,
  agentPhase,
  draftMessageId,
  liveNarration = ''
}: Props) {
  const thinkingScrollRef = useRef<HTMLDivElement>(null)

  const thinkingLive =
    busy &&
    agentPhase === 'thinking' &&
    work.liveAssistantId != null &&
    draftMessageId === work.liveAssistantId
  const toolsLive = work.tools.some((m) => m.content.startsWith('▶'))
  const active = thinkingLive || toolsLive

  const reasoningText = [work.thinking, liveNarration]
    .filter((s) => s.trim().length > 0)
    .join('\n')
    .trim()
  const hasReasoning = reasoningText.length > 0

  useLayoutEffect(() => {
    if (!busy || !hasReasoning) return
    const el = thinkingScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [reasoningText, busy, hasReasoning])

  if (!busy) return null

  if (!active) {
    if (work.tools.length > 0) {
      return (
        <div className={styles.live} role="status" aria-live="polite">
          <div className={styles.liveIndicator}>Думаю…</div>
        </div>
      )
    }
    return null
  }

  return (
    <div className={styles.live} role="status" aria-live="polite">
      {thinkingLive &&
        (hasReasoning ? (
          <div ref={thinkingScrollRef} className={styles.liveThinking}>
            {reasoningText}
          </div>
        ) : (
          <div className={styles.liveIndicator}>Думаю…</div>
        ))}
      {toolsLive && <AllToolsGroup items={work.tools} />}
    </div>
  )
}
