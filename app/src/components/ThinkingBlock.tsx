import { useEffect, useRef, useState } from 'react'

interface Props {
  content: string
  /** Идёт стриминг рассуждений — компактная полоска с live-текстом */
  live?: boolean
}

export function ThinkingBlock({ content, live = false }: Props) {
  const [expanded, setExpanded] = useState(false)
  const wasLiveRef = useRef(live)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (live) {
      setExpanded(false)
    } else if (wasLiveRef.current) {
      setExpanded(false)
    }
    wasLiveRef.current = live
  }, [live])

  useEffect(() => {
    if (!live) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [content, live])

  if (!content.trim()) return null

  if (live) {
    return (
      <div
        className="thinking-stream live"
        role="status"
        aria-live="polite"
        aria-label="Размышления модели"
      >
        <div className="thinking-stream-live-head">
          <span className="thinking-stream-badge" aria-hidden="true" />
          <span className="thinking-stream-live-label">Думает</span>
        </div>
        <div ref={scrollRef} className="thinking-stream-body">
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className={`thinking-stream settled${expanded ? ' expanded' : ''}`}>
      <button
        type="button"
        className="thinking-stream-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="thinking-stream-badge settled" aria-hidden="true" />
        <span className="thinking-stream-label">Размышления</span>
        <span className="thinking-stream-hint" />
      </button>
      <div ref={scrollRef} className="thinking-stream-body" hidden={!expanded}>
        {content}
      </div>
    </div>
  )
}
