import { useEffect } from 'react'
import { useModalA11y } from '../hooks/useModalA11y'
import type { AppState } from '../types'
import styles from './Dialogs.module.css'

interface Props {
  recovery: AppState | null
  chatTitle: string | null
  onRestore: () => void
  onDismiss: () => void
}

function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return isoString
  }
}

export function CrashRecoveryDialog({ recovery, chatTitle, onRestore, onDismiss }: Props) {
  const open = recovery !== null
  const modalRef = useModalA11y<HTMLDivElement>(open)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onDismiss])

  if (!recovery) return null

  const hasPending = recovery.pendingMessages.length > 0
  const chatLabel = chatTitle ?? recovery.activeChatId

  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div
        ref={modalRef}
        className={`modal ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        aria-describedby="recovery-body"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="recovery-title">Восстановление после сбоя</h2>
          <button
            type="button"
            className="btn modal-close"
            onClick={onDismiss}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        <div
          id="recovery-body"
          className="modal-body"
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <p style={{ margin: 0 }}>
            Приложение завершилось неожиданно <strong>{formatTime(recovery.crashedAt)}</strong>.
          </p>
          <p style={{ margin: 0 }}>
            Активный чат: <strong>{chatLabel}</strong>
          </p>

          {hasPending && (
            <div>
              <p style={{ margin: '0 0 0.4rem' }}>
                Сообщения, не отправленные агенту ({recovery.pendingMessages.length}):
              </p>
              <ul
                style={{
                  margin: 0,
                  padding: '0 0 0 1.2rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.3rem'
                }}
              >
                {recovery.pendingMessages.map((msg) => (
                  <li key={msg.id} style={{ wordBreak: 'break-word' }}>
                    <span
                      style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                      title="Нажмите, чтобы скопировать"
                      onClick={() => void navigator.clipboard.writeText(msg.text).catch(() => {})}
                    >
                      {msg.text.length > 120 ? msg.text.slice(0, 120) + '…' : msg.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85em' }}>
            Нажмите «Восстановить», чтобы открыть этот чат. Нажмите «Удалить», чтобы начать заново.
          </p>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn danger" onClick={onDismiss}>
            Удалить
          </button>
          <button type="button" className="btn primary" onClick={onRestore}>
            Восстановить
          </button>
        </div>
      </div>
    </div>
  )
}
