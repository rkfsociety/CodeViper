import { useState } from 'react'
import type { ChatMessage } from '../types'
import styles from './AllToolsGroup.module.css'

interface AllToolsGroupProps {
  items: ChatMessage[]
}

/**
 * Группирует tool-сообщения в единый блок без разбивки по имени инструмента.
 * Каждый вызов инструмента отображается как отдельная строка внутри блока.
 */
export function AllToolsGroup({ items }: AllToolsGroupProps) {
  const [open, setOpen] = useState(false)

  const total = items.length
  const done = items.every((m) => !m.content.startsWith('▶'))
  const statusIcon = done ? '✓' : '▶'

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.headerIcon} aria-hidden="true">
          ⚙
        </span>
        <span>Инструменты</span>
        <span className={styles.headerCount}>
          {statusIcon} ×{total}
        </span>
        <span className={open ? styles.headerChevronOpen : styles.headerChevron}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className={styles.toolList}>
          {items.map((m) => {
            const name = m.toolName || 'Инструмент'
            const isRunning = m.content.startsWith('▶')
            const isError = m.content.startsWith('✗') || m.content.startsWith('❌')
            const isDone = !isRunning && !isError

            let statusClass = styles.toolStatus
            if (isDone) statusClass += ` ${styles.toolStatusOk}`
            else if (isError) statusClass += ` ${styles.toolStatusError}`
            else statusClass += ` ${styles.toolStatusRunning}`

            const statusLabel = isRunning ? '…' : isError ? '✗' : '✓'

            // Парсим аргументы из content (первая строка после ▶)
            const lines = m.content.split('\n')
            const firstLine = lines[0].replace(/^[▶✓✗❌]\s*/, '').trim()
            const args = firstLine || name
            const result = lines.slice(1).join('\n').trim()

            return (
              <div key={m.id} className={styles.toolItem}>
                <span className={styles.toolName}>{name}</span>
                <span className={styles.toolArgs}>{args}</span>
                <span className={statusClass}>{statusLabel}</span>
                {result && (
                  <div className={styles.resultBlock}>
                    <div className={styles.resultLabel}>Результат:</div>
                    {result}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
