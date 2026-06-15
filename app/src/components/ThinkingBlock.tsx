interface Props {
  content: string
  /** Идёт стриминг рассуждений — раскрыть по умолчанию */
  live?: boolean
}

export function ThinkingBlock({ content, live = false }: Props) {
  if (!content.trim()) return null

  return (
    <details className="thinking-block" open={live}>
      <summary className="thinking-summary">
        <span className="thinking-icon">💭</span>
        <span className="thinking-title">Размышления{live ? '…' : ''}</span>
        <span className="thinking-toggle-hint" />
      </summary>
      <div className="thinking-content">{content}</div>
    </details>
  )
}
