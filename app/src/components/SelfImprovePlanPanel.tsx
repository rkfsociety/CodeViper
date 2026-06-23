import { memo } from 'react'
import type { SelfImprovementPlanItem } from '../types'
import styles from './SelfImprovePlanPanel.module.css'

interface Props {
  items: SelfImprovementPlanItem[]
  onClose?: () => void
}

export const SelfImprovePlanPanel = memo(function SelfImprovePlanPanel({ items, onClose }: Props) {
  if (!items.length) return null

  const doneCount = items.filter((i) => i.done || i.blocked).length
  const total = items.length
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.icon}>🛠️</span>
        <span className={styles.title}>План самоулучшения</span>
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
          <li
            key={item.id}
            className={
              item.done ? styles.itemDone : item.blocked ? styles.itemBlocked : styles.item
            }
          >
            <span className={styles.check}>{item.done ? '✓' : item.blocked ? '✗' : '○'}</span>
            <span className={styles.itemTitle}>{item.title}</span>
          </li>
        ))}
      </ul>
    </div>
  )
})
