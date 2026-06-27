import { useLayoutEffect, useRef, useState } from 'react'

interface Props {
  content: string
  /** Идёт стриминг рассуждений (фаза thinking) */
  live?: boolean
}

export function ThinkingBlock({ content, live = false }: Props) {
  const [expanded, setExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!live) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [content, live])

  if (!content.trim()) return null

  if (live) {
    return (
      <div
        className="thinking-stream-ghost"
        role="status"
        aria-live="polite"
        aria-label="Размышления модели"
      >
        <div ref={scrollRef} className="thinking-stream-ghost-body">
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className={`thinking-stream-settled${expanded ? ' expanded' : ''}`}>
      <button
        type="button"
        className="thinking-stream-settled-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? 'скрыть размышления' : 'размышления'}
      </button>
      {expanded && (
        <div ref={scrollRef} className="thinking-stream-settled-body">
          {content}
        </div>
      )}
    </div>
  )
}
