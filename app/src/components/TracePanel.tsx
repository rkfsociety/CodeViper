import { useEffect, useRef, useState } from 'react'
import type { AgentTraceEvent } from '../types'
import { getTraceEvents, clearTraceEvents, onTraceUpdate } from '../traceBuffer'
import styles from './TracePanel.module.css'

interface Props {
  chatId: string | null
}

const KIND_COLORS: Record<AgentTraceEvent['kind'], string> = {
  run_start: '#4ec9b0',
  llm_request: '#9cdcfe',
  llm_response: '#dcdcaa',
  tool_call: '#c586c0',
  tool_result: '#b5cea8',
  run_end: '#4ec9b0'
}

export function TracePanel({ chatId }: Props) {
  const [events, setEvents] = useState<AgentTraceEvent[]>(() =>
    chatId ? getTraceEvents(chatId) : []
  )
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    setEvents(chatId ? getTraceEvents(chatId) : [])
    setExpanded(new Set())
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

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Трассировка агента</span>
        <div className={styles.headerActions}>
          {events.length > 0 && (
            <button
              className={styles.clearBtn}
              onClick={() => {
                if (chatId) clearTraceEvents(chatId)
              }}
            >
              Очистить
            </button>
          )}
          <span className={styles.count}>{events.length} событий</span>
        </div>
      </div>
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
          return (
            <div key={idx} className={styles.event}>
              <div
                className={styles.eventHeader}
                onClick={() => hasData && toggleExpand(idx)}
                style={{ cursor: hasData ? 'pointer' : 'default' }}
              >
                <span className={styles.ts}>{formatTime(ev.ts)}</span>
                <span className={styles.dot} style={{ background: KIND_COLORS[ev.kind] }} />
                <span className={styles.label}>{ev.label}</span>
                {hasData && <span className={styles.toggle}>{isOpen ? '▾' : '▸'}</span>}
              </div>
              {isOpen && hasData && (
                <pre className={styles.data}>{JSON.stringify(ev.data, null, 2)}</pre>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
