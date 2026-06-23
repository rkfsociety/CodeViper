import { useEffect } from 'react'
import { useModalA11y } from '../hooks/useModalA11y'
import styles from './Dialogs.module.css'

interface Props {
  open: boolean
  onAccept: () => void
  onDecline: () => void
}

export function P2PConsentModal({ open, onAccept, onDecline }: Props) {
  const modalRef = useModalA11y<HTMLDivElement>(open)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onDecline()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onDecline])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onDecline}>
      <div
        ref={modalRef}
        className={`modal ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="p2p-consent-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480 }}
      >
        <div className="modal-header">
          <h2 id="p2p-consent-title">Поделиться мощностью — условия</h2>
          <button
            type="button"
            className="btn modal-close"
            onClick={onDecline}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>
        <div className={`modal-body ${styles.confirmBody}`} style={{ lineHeight: 1.6 }}>
          <p>При включении этого режима CodeViper будет:</p>
          <ul style={{ margin: '8px 0 12px 16px', padding: 0 }}>
            <li>Регистрировать этот узел на сигнальном сервере.</li>
            <li>
              Передавать <strong>URL вашего Ollama</strong> и <strong>название модели</strong>{' '}
              другим участникам сети.
            </li>
            <li>Принимать задачи от других пользователей — пока CPU &lt; 15% и GPU &lt; 20%.</li>
          </ul>
          <p style={{ margin: 0 }}>
            <strong>Не передаётся:</strong> содержимое файлов, история чатов, API-ключи, любые
            персональные данные.
          </p>
          <p style={{ marginTop: 12, marginBottom: 0, opacity: 0.7, fontSize: '0.87em' }}>
            Вы можете отключить режим в любой момент в настройках → Интеграции.
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onDecline}>
            Отказаться
          </button>
          <button type="button" className="btn primary" onClick={onAccept}>
            Принимаю
          </button>
        </div>
      </div>
    </div>
  )
}
