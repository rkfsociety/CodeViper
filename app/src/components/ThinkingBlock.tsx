import { useEffect, useRef, useState } from 'react'

interface Props {
  content: string
  /** Идёт стриминг рассуждений — раскрыть и держать открытым до завершения */
  live?: boolean
}

export function ThinkingBlock({ content, live = false }: Props) {
  const [open, setOpen] = useState(live)
  const wasLiveRef = useRef(live)

  useEffect(() => {
    if (live) {
      setOpen(true)
    } else if (wasLiveRef.current) {
      setOpen(false)
    }
    wasLiveRef.current = live
  }, [live])

  if (!content.trim()) return null

  return (
    <div className={`thinking-block${open ? ' open' : ''}${live ? ' live' : ''}`}>
      <button
        type="button"
        className="thinking-summary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="thinking-icon" aria-hidden="true">
          💭
        </span>
        <span className="thinking-title">Размышления{live ? '…' : ''}</span>
        <span className="thinking-toggle-hint" />
      </button>
      <div className="thinking-content-wrap">
        <div className="thinking-content">{content}</div>
      </div>
    </div>
  )
}
