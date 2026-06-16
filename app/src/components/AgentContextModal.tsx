import { useEffect, useMemo, useState } from 'react'
import type { AgentContextPreview } from '../types'
import { MessageCopyButton } from './MessageCopyButton'
import { useModalA11y } from '../hooks/useModalA11y'

interface Props {
  open: boolean
  preview: AgentContextPreview | null
  onClose: () => void
}

function formatChars(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}

export function AgentContextModal({ open, preview, onClose }: Props) {
  const [activeId, setActiveId] = useState('system')
  const modalRef = useModalA11y<HTMLDivElement>(open)

  const items = useMemo(() => {
    if (!preview) return []
    return [
      ...preview.sections.map((section) => ({
        id: section.id,
        title: section.title,
        subtitle: section.subtitle,
        content: section.content,
        charCount: section.charCount
      })),
      ...preview.messages.map((message, index) => ({
        id: `message-${index}`,
        title: message.label,
        subtitle: `${message.role} · ${formatChars(message.charCount)} симв.`,
        content: message.content,
        charCount: message.charCount
      }))
    ]
  }, [preview])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open || !items.length) return
    if (!items.some((item) => item.id === activeId)) {
      setActiveId(items[0].id)
    }
  }, [open, items, activeId])

  if (!open || !preview) return null

  const active = items.find((item) => item.id === activeId) ?? items[0]

  return (
    <div className="modal-backdrop context-modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal context-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="context-modal-title"
      >
        <div className="modal-header">
          <div>
            <h2 id="context-modal-title">Контекст модели</h2>
            <div className="context-modal-meta">
              {preview.model || 'модель не выбрана'} · {preview.contextUsagePercent}% /{' '}
              {preview.contextLimitTokens.toLocaleString('ru-RU')} tok · ~
              {preview.estimatedTokens.toLocaleString('ru-RU')} tok · {formatChars(preview.totalChars)}{' '}
              симв. · {preview.toolCount} инструментов
              {preview.historySummarized && (
                <span className="context-warning"> · история суммаризирована</span>
              )}
              {preview.historyTruncated && !preview.historySummarized && (
                <span className="context-warning">
                  {' '}
                  · история обрезана (−{preview.droppedMessageCount})
                </span>
              )}
            </div>
          </div>
          <button type="button" className="btn modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className="context-modal-body">
          <aside className="context-modal-sidebar">
            <div className="context-sidebar-group">Системный промпт</div>
            {preview.sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`context-sidebar-item${activeId === section.id ? ' active' : ''}`}
                onClick={() => setActiveId(section.id)}
              >
                <span>{section.title}</span>
                <span className="context-sidebar-meta">{formatChars(section.charCount)}</span>
              </button>
            ))}

            <div className="context-sidebar-group">Сообщения в запросе</div>
            {preview.messages.map((message, index) => {
              const id = `message-${index}`
              return (
                <button
                  key={id}
                  type="button"
                  className={`context-sidebar-item${activeId === id ? ' active' : ''}`}
                  onClick={() => setActiveId(id)}
                >
                  <span>{message.label}</span>
                  <span className="context-sidebar-meta">{formatChars(message.charCount)}</span>
                </button>
              )
            })}
          </aside>

          <section className="context-modal-content">
            <div className="context-content-header">
              <div>
                <div className="context-content-title">{active.title}</div>
                {active.subtitle && <div className="context-content-subtitle">{active.subtitle}</div>}
              </div>
              <MessageCopyButton text={active.content} />
            </div>
            <pre className="context-content-pre">{active.content}</pre>
          </section>
        </div>
      </div>
    </div>
  )
}
