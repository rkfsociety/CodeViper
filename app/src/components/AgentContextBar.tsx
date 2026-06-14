import type { AgentContextPreview } from '../types'

interface Props {
  preview: AgentContextPreview | null
  loading?: boolean
  onOpen: () => void
}

function formatChars(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

function usageClass(percent: number): string {
  if (percent >= 95) return 'context-bar-stat danger'
  if (percent >= 85) return 'context-bar-stat warning'
  return 'context-bar-stat'
}

export function AgentContextBar({ preview, loading, onOpen }: Props) {
  if (!preview && !loading) return null

  return (
    <div className="context-bar">
      <button type="button" className="context-bar-open" onClick={onOpen} disabled={loading || !preview}>
        <span className="context-bar-icon">◎</span>
        <span className="context-bar-label">Контекст</span>
        {loading ? (
          <span className="context-bar-stat">обновление…</span>
        ) : preview ? (
          <span className={usageClass(preview.contextUsagePercent)}>
            {preview.contextUsagePercent}% · ~{preview.estimatedTokens.toLocaleString('ru-RU')} tok ·{' '}
            {formatChars(preview.totalChars)}
          </span>
        ) : null}
      </button>

      {preview && (
        <div className="context-chips">
          {preview.sections.map((section) => (
            <button
              key={section.id}
              type="button"
              className="context-chip"
              onClick={onOpen}
              title={`${section.title}: ${formatChars(section.charCount)} симв.`}
            >
              {section.title}
              <span>{formatChars(section.charCount)}</span>
            </button>
          ))}
          {preview.messages.slice(1, -1).length > 0 && (
            <button type="button" className="context-chip" onClick={onOpen}>
              История
              <span>{preview.messages.length - 2}</span>
            </button>
          )}
          {preview.historySummarized && (
            <span className="context-chip warning" title="Старая история суммаризирована">
              Σ сводка
            </span>
          )}
          {preview.historyTruncated && !preview.historySummarized && (
            <span className="context-chip warning" title="Часть истории не попала в контекст">
              −{preview.droppedMessageCount}
            </span>
          )}
          {preview.contextUsagePercent >= 85 && (
            <span className="context-chip warning" title="Близко к лимиту контекста модели">
              {preview.contextUsagePercent}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}
