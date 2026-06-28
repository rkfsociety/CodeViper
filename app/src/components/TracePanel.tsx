import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { chatExportJsonFilename } from '../../shared/chatExport'
import type { AgentTraceEvent } from '../types'
import { getTraceEvents, clearTraceEvents, onTraceUpdate, hydrateTraceEvents } from '../traceBuffer'
import { ConfirmDialog } from './ConfirmDialog'
import styles from './TracePanel.module.css'

interface Props {
  chatId: string | null
  projectPath: string
  onReplayFromStep?: (stepTs: number, userMessage: string) => void
}

const KIND_COLORS: Record<AgentTraceEvent['kind'], string> = {
  run_start: '#4ec9b0',
  llm_request: '#9cdcfe',
  llm_response: '#dcdcaa',
  tool_call: '#c586c0',
  tool_result: '#b5cea8',
  context_compress: '#4fc1ff',
  nudge: '#ce9178',
  run_end: '#4ec9b0'
}

function traceEventHint(ev: AgentTraceEvent): string | null {
  const d = ev.data
  if (ev.kind === 'llm_request' && typeof d.usagePercent === 'number') {
    return `${d.usagePercent}% · ~${d.estimatedTokens ?? '?'} tok`
  }
  if (ev.kind === 'context_compress' && typeof d.method === 'string' && d.method !== 'none') {
    const before = d.before as { usagePercent?: number } | undefined
    const after = d.after as { usagePercent?: number } | undefined
    if (before?.usagePercent != null && after?.usagePercent != null) {
      return `${String(d.method)} · ${before.usagePercent}%→${after.usagePercent}%`
    }
    return String(d.method)
  }
  if (ev.kind === 'nudge' && typeof d.source === 'string') return d.source
  if (ev.kind === 'tool_call' && typeof d.signature === 'string') {
    return d.signature.length > 48 ? `${d.signature.slice(0, 48)}…` : d.signature
  }
  if (ev.kind === 'llm_response' && d.emptyResponse === true) return 'пустой ответ'
  return null
}

function isErrorTraceEvent(ev: AgentTraceEvent): boolean {
  if (ev.data.ok === false) return true
  if (ev.data.status === 'error' || ev.data.status === 'aborted') return true
  if (typeof ev.data.error === 'string' && ev.data.error.length > 0) return true
  return false
}

export function TracePanel({ chatId, projectPath, onReplayFromStep }: Props) {
  const [events, setEvents] = useState<AgentTraceEvent[]>(() =>
    chatId ? getTraceEvents(chatId) : []
  )
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [exportingChat, setExportingChat] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reportConfirmOpen, setReportConfirmOpen] = useState(false)
  const [reportStatus, setReportStatus] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    if (!chatId) {
      setEvents([])
      setExpanded(new Set())
      return
    }
    let cancelled = false
    void hydrateTraceEvents(chatId).then(() => {
      if (!cancelled) setEvents([...getTraceEvents(chatId)])
    })
    setExpanded(new Set())
    return () => {
      cancelled = true
    }
  }, [chatId])

  useEffect(() => {
    return onTraceUpdate((updatedChatId) => {
      if (updatedChatId !== chatId) return
      setEvents([...getTraceEvents(chatId!)])
    })
  }, [chatId])

  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [events])

  function toggleExpand(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function formatTime(ts: number): string {
    const d = new Date(ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
  }

  function findRunStart(idx: number): AgentTraceEvent | null {
    for (let i = idx - 1; i >= 0; i--) {
      if (events[i].kind === 'run_start') return events[i]
    }
    return null
  }

  function handleReplayClick(e: MouseEvent, eventTs: number, idx: number) {
    e.stopPropagation()
    if (!onReplayFromStep) return
    const runStart = findRunStart(idx)
    if (!runStart) return
    const userMessage = runStart.data.message
    if (typeof userMessage !== 'string' || !userMessage) return
    onReplayFromStep(eventTs, userMessage)
  }

  async function handleExport() {
    if (!chatId || events.length === 0 || exporting) return
    setExporting(true)
    try {
      const result = await window.codeviper.exportTrace(
        chatId,
        events,
        projectPath.trim() || undefined
      )
      if (result.ok && result.path) {
        window.codeviper.showItemInFolder(result.path)
      }
    } finally {
      setExporting(false)
    }
  }

  function handleReportClick() {
    if (!chatId || events.length === 0 || reporting) return
    setReportConfirmOpen(true)
  }

  async function submitReport() {
    if (!chatId || events.length === 0 || reporting) return
    setReportConfirmOpen(false)
    setReporting(true)
    setReportStatus(null)
    try {
      const result = await window.codeviper.reportTraceToGithub(
        chatId,
        events,
        projectPath.trim() || undefined
      )
      if (result.ok && result.issueUrl) {
        setReportStatus(`Issue создан: ${result.title ?? ''}`)
        window.codeviper.openExternal(result.issueUrl)
      } else {
        setReportStatus(result.error ?? 'Не удалось создать issue')
      }
    } finally {
      setReporting(false)
    }
  }

  async function handleExportChat() {
    if (!chatId || exportingChat) return
    setExportingChat(true)
    try {
      const payload = await window.codeviper.exportChat(chatId)
      if (!payload) return
      const json = JSON.stringify(payload, null, 2)
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = chatExportJsonFilename(payload.chat)
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } finally {
      setExportingChat(false)
    }
  }

  const canExport = Boolean(chatId && events.length > 0 && !exporting)
  const canExportChat = Boolean(chatId && !exportingChat)
  const canReport = Boolean(chatId && events.length > 0 && !reporting)

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Трассировка агента</span>
        <div className={styles.headerActions}>
          {chatId && (
            <button
              className={styles.exportBtn}
              onClick={() => void handleExportChat()}
              disabled={!canExportChat}
              title="Скачать JSON чата: сообщения, метаданные и трейс агента"
            >
              {exportingChat ? 'Экспорт…' : 'Чат JSON'}
            </button>
          )}
          {events.length > 0 && (
            <>
              <button
                className={styles.reportBtn}
                onClick={handleReportClick}
                disabled={!canReport}
                title="Создать GitHub Issue от имени агента (gh auth login)"
              >
                {reporting ? 'Отправка…' : 'На GitHub'}
              </button>
              <button
                className={styles.exportBtn}
                onClick={() => void handleExport()}
                disabled={!canExport}
                title="Сохранить в папку данных приложения (%APPDATA%/CodeViper/traces/)"
              >
                {exporting ? 'Сохранение…' : 'Экспортировать'}
              </button>
              <button
                className={styles.clearBtn}
                onClick={() => {
                  if (chatId) clearTraceEvents(chatId)
                  setReportStatus(null)
                }}
              >
                Очистить
              </button>
            </>
          )}
          <span className={styles.count}>{events.length} событий</span>
        </div>
      </div>
      {reportStatus && <div className={styles.reportStatus}>{reportStatus}</div>}
      <ConfirmDialog
        open={reportConfirmOpen}
        title="Отчёт агента на GitHub"
        message="Создать GitHub Issue от имени агента CodeViper по текущей трассе? Полный JSON будет в gist."
        confirmLabel="Отправить"
        onConfirm={() => void submitReport()}
        onCancel={() => setReportConfirmOpen(false)}
      />
      <div
        className={styles.log}
        onScroll={(e) => {
          const el = e.currentTarget
          autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {events.length === 0 && (
          <div className={styles.empty}>Запустите агента — события появятся здесь</div>
        )}
        {events.map((ev, idx) => {
          const isOpen = expanded.has(idx)
          const hasData = Object.keys(ev.data).length > 0
          const isError = isErrorTraceEvent(ev)
          const canReplay =
            ev.kind === 'llm_request' && onReplayFromStep != null && findRunStart(idx) != null
          const hint = traceEventHint(ev)
          return (
            <div key={idx} className={`${styles.event}${isError ? ` ${styles.eventError}` : ''}`}>
              <div
                className={styles.eventHeader}
                onClick={() => hasData && toggleExpand(idx)}
                style={{ cursor: hasData ? 'pointer' : 'default' }}
              >
                <span className={styles.ts}>{formatTime(ev.ts)}</span>
                <span
                  className={styles.dot}
                  style={{ background: isError ? '#f44747' : KIND_COLORS[ev.kind] }}
                />
                <span className={`${styles.label}${isError ? ` ${styles.labelError}` : ''}`}>
                  {ev.label}
                </span>
                {hint && <span className={styles.hint}>{hint}</span>}
                {hint && <span className={styles.hint}>{hint}</span>}
                {canReplay && (
                  <button
                    className={styles.replayBtn}
                    onClick={(e) => handleReplayClick(e, ev.ts, idx)}
                    title="Повторить с этого шага"
                  >
                    ↩
                  </button>
                )}
                {hasData && <span className={styles.toggle}>{isOpen ? '▾' : '▸'}</span>}
              </div>
              {isOpen && hasData && (
                <pre className={`${styles.data}${isError ? ` ${styles.dataError}` : ''}`}>
                  {JSON.stringify(ev.data, null, 2)}
                </pre>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
