import { useEffect, useRef, useState } from 'react'

interface Props {
  content: string
  /** Идёт стриминг рассуждений — раскрыть и держать открытым до завершения */
  live?: boolean
}

export function ThinkingBlock({ content, live = false }: Props) {
  const [open, setOpen] = useState(live)
  const wasLiveRef = useRef(live)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (live) {
      setOpen(true)
    } else if (wasLiveRef.current) {
      setOpen(false)
    }
    wasLiveRef.current = live
  }, [live])

  useEffect(() => {
    if (!live || !open) return
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [content, live, open])

  if (!content.trim()) return null

  return (
    <div className={`thinking-stream${open ? ' open' : ''}${live ? ' live' : ''}`}>
      <button
        type="button"
        className="thinking-stream-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="thinking-stream-label">Размышления{live ? '…' : ''}</span>
        <span className="thinking-stream-hint" />
      </button>
      <div ref={scrollRef} className="thinking-stream-body" hidden={!open}>
        {content}
      </div>
    </div>
  )
}
