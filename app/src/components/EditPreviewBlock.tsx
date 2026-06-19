import { useState } from 'react'
import styles from './EditPreviewBlock.module.css'

interface Props {
  messageId: string
  previewId: string
  path: string
  diff: string
  status: 'pending' | 'applied' | 'cancelled'
  onRespond: (messageId: string, previewId: string, apply: boolean) => void
}

export function EditPreviewBlock({ messageId, previewId, path, diff, status, onRespond }: Props) {
  const [expanded, setExpanded] = useState(true)

  const lines = diff.split('\n')

  return (
    <div className={`${styles.block} ${styles[status]}`}>
      <div className={styles.header} onClick={() => setExpanded((v) => !v)}>
        <span className={styles.icon}>
          {status === 'pending' ? '📋' : status === 'applied' ? '✅' : '❌'}
        </span>
        <span className={styles.path}>{path}</span>
        {status !== 'pending' && (
          <span className={styles.statusLabel}>
            {status === 'applied' ? 'Применено' : 'Отменено'}
          </span>
        )}
        <span className={styles.toggle}>{expanded ? '▾' : '▸'}</span>
      </div>

      {expanded && (
        <div className={styles.diffWrap}>
          <pre className={styles.diff}>
            {lines.map((line, i) => {
              const cls =
                line.startsWith('+') && !line.startsWith('+++')
                  ? styles.added
                  : line.startsWith('-') && !line.startsWith('---')
                    ? styles.removed
                    : line.startsWith('@@')
                      ? styles.hunk
                      : ''
              return (
                <span key={i} className={cls}>
                  {line}
                  {'\n'}
                </span>
              )
            })}
          </pre>
        </div>
      )}

      {status === 'pending' && (
        <div className={styles.actions}>
          <button
            type="button"
            className={`btn ${styles.applyBtn}`}
            onClick={() => onRespond(messageId, previewId, true)}
          >
            ✅ Применить
          </button>
          <button
            type="button"
            className={`btn ${styles.cancelBtn}`}
            onClick={() => onRespond(messageId, previewId, false)}
          >
            ❌ Отмена
          </button>
        </div>
      )}
    </div>
  )
}
