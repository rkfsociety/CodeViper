import { memo } from 'react'
import type { TodoItem } from '../types'
import styles from './TodoPanel.module.css'

interface TodoPanelProps {
  items: TodoItem[]
  title?: string
  onClose?: () => void
}

export const TodoPanel = memo(function TodoPanel({ items, title, onClose }: TodoPanelProps) {
  if (!items.length) return null

  const doneCount = items.filter((i) => i.done).length
  const total = items.length
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>{title ?? 'Todo List'}</span>
        <span className={styles.progress}>
          {doneCount}/{total} · {pct}%
        </span>
        {onClose && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="Скрыть">
            ✕
          </button>
        )}
      </div>

      <div className={styles.bar}>
        <div className={styles.barFill} style={{ width: `${pct}%` }} />
      </div>

      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={item.done ? styles.itemDone : styles.item}>
            <span className={styles.check}>{item.done ? '✓' : '○'}</span>
            <span className={styles.itemTitle}>{item.title}</span>
          </li>
        ))}
      </ul>
    </div>
  )
})
