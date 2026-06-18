import type { InterruptedDraft } from '../types'
import styles from './InterruptedDraftBanner.module.css'

interface Props {
  draft: InterruptedDraft
  onRetry: () => void
  onDismiss: () => void
}

export function InterruptedDraftBanner({ draft, onRetry, onDismiss }: Props) {
  const label = draft.reason === 'timeout' ? 'Превышено время ожидания' : 'Стрим прерван'
  const date = new Date(draft.timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  })

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.info}>
        <span className={styles.icon}>⚠️</span>
        <span className={styles.text}>
          <strong>{label}</strong> в {date}
          {draft.partial && <span className={styles.partial}> — получен частичный ответ</span>}
        </span>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.btnRetry} onClick={onRetry}>
          Повторить
        </button>
        <button type="button" className={styles.btnDismiss} onClick={onDismiss}>
          Закрыть
        </button>
      </div>
    </div>
  )
}
