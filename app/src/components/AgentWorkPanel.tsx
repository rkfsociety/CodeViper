import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../types'
import type { AgentPhase } from './AgentStatusBar'
import type { AgentWorkTrace } from './ChatPanel/helpers'
import { computeWorkDurationMs, formatWorkDuration } from './ChatPanel/helpers'
import { AllToolsGroup } from './AllToolsGroup'
import toolStyles from './AllToolsGroup.module.css'
import styles from './AgentWorkPanel.module.css'

interface Props {
  work: AgentWorkTrace
  message?: ChatMessage
  busy: boolean
  agentPhase: AgentPhase
  draftMessageId: string | null
  /** Показывать текст reasoning; иначе только индикатор «Думаю…» */
  showLiveThinking?: boolean
}

function humanizeToolName(name: string): string {
  const map: Record<string, string> = {
    read_file: 'Read',
    write_file: 'Write',
    edit_file: 'Edit',
    bash: 'Run',
    search_files: 'Search',
    grep_search: 'Search',
    grep: 'Search',
    list_directory: 'List',
    list_files: 'List',
    create_file: 'Create',
    delete_file: 'Delete',
    move_file: 'Move',
    copy_file: 'Copy',
    execute_command: 'Run',
    run_command: 'Run',
    web_search: 'Search Web',
    fetch_url: 'Fetch'
  }
  if (map[name]) return map[name]
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function parseToolContent(content: string) {
  const isRunning = content.startsWith('▶')
  const isError = content.startsWith('✗') || content.startsWith('❌')
  const lines = content.split('\n')
  const firstLine = lines[0].replace(/^[▶✓✗❌]\s*/, '').trim()
  const result = lines.slice(1).join('\n').trim()
  return { isRunning, isError, firstLine, result }
}

function ToolDetail({ m }: { m: ChatMessage }) {
  const [open, setOpen] = useState(false)
  const name = m.toolName || 'tool'
  const { isRunning, isError, firstLine, result } = parseToolContent(m.content)
  const statusIcon = isRunning ? '…' : isError ? '✗' : '✓'
  const statusClass = isRunning
    ? toolStyles.statusRunning
    : isError
      ? toolStyles.statusError
      : toolStyles.statusOk
  const label = firstLine || humanizeToolName(name)

  return (
    <div className={toolStyles.item}>
      <button
        type="button"
        className={toolStyles.itemRow}
        onClick={() => result && setOpen((v) => !v)}
        aria-expanded={open}
        style={{ cursor: result ? 'pointer' : 'default' }}
      >
        <span className={`${toolStyles.itemStatus} ${statusClass}`}>{statusIcon}</span>
        <span className={toolStyles.itemLabel}>{label}</span>
        {result && <span className={toolStyles.itemChevron}>{open ? '▾' : '›'}</span>}
      </button>
      {open && result && <div className={toolStyles.itemResult}>{result}</div>}
    </div>
  )
}

export function AgentWorkPanel({
  work,
  message,
  busy,
  agentPhase,
  draftMessageId,
  showLiveThinking = false
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const thinkingScrollRef = useRef<HTMLDivElement>(null)
  const wasActiveRef = useRef(false)
  const [frozenDurationMs, setFrozenDurationMs] = useState<number | undefined>()

  const thinkingLive =
    busy &&
    agentPhase === 'thinking' &&
    work.liveAssistantId != null &&
    draftMessageId === work.liveAssistantId
  const toolsLive = work.tools.some((m) => m.content.startsWith('▶'))
  const active = thinkingLive || toolsLive
  const hasThinking = work.thinking.trim().length > 0
  const showThinkingText = showLiveThinking && hasThinking

  useLayoutEffect(() => {
    if (!thinkingLive || !showThinkingText) return
    const el = thinkingScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [work.thinking, thinkingLive, showThinkingText])

  useEffect(() => {
    if (wasActiveRef.current && !active) {
      setFrozenDurationMs(computeWorkDurationMs(work, message))
    }
    if (active) setFrozenDurationMs(undefined)
    wasActiveRef.current = active
  }, [active, work, message])

  const durationMs =
    frozenDurationMs ??
    (active ? computeWorkDurationMs(work, message) : computeWorkDurationMs(work, message))

  if (work.tools.length === 0 && !hasThinking) return null
  if (work.tools.length === 0 && hasThinking && !showThinkingText && !thinkingLive) return null

  if (active) {
    return (
      <div className={styles.live} role="status" aria-live="polite">
        {thinkingLive &&
          (showThinkingText ? (
            <div ref={thinkingScrollRef} className={styles.liveThinking}>
              {work.thinking}
            </div>
          ) : (
            <div className={styles.liveIndicator}>Думаю…</div>
          ))}
        {toolsLive && <AllToolsGroup items={work.tools} />}
      </div>
    )
  }

  const durationLabel =
    durationMs != null && durationMs > 0
      ? `Выполнено за ${formatWorkDuration(durationMs)}`
      : 'Выполнено'

  return (
    <div className={`${styles.settled}${expanded ? ` ${styles.expanded}` : ''}`}>
      <button
        type="button"
        className={styles.summary}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={styles.summaryLabel}>{durationLabel}</span>
        <span className={styles.summaryChevron}>{expanded ? '▾' : '›'}</span>
      </button>
      {expanded && (
        <div className={styles.details}>
          {showThinkingText && <div className={styles.detailThinking}>{work.thinking}</div>}
          {work.tools.length > 0 && (
            <div className={toolStyles.list}>
              {work.tools.map((m) => (
                <ToolDetail key={m.id} m={m} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
