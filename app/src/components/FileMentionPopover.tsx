import { useEffect, useRef } from 'react'
import type { FileMentionItem } from '../../shared/fileMentions'
import styles from './FileMentionPopover.module.css'

interface Props {
  items: FileMentionItem[]
  selectedIndex: number
  onSelect: (item: FileMentionItem) => void
}

export function FileMentionPopover({ items, selectedIndex, onSelect }: Props) {
  const listRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!items.length) {
    return (
      <div className={styles.menu} role="listbox" aria-label="Файлы проекта">
        <div className={styles.empty}>Нет совпадений</div>
      </div>
    )
  }

  return (
    <div className={styles.menu} role="listbox" aria-label="Файлы проекта">
      <ul
        ref={(el) => {
          listRef.current = el
        }}
        className={styles.list}
      >
        {items.map((item, i) => (
          <li
            key={item.relativePath}
            className={`${styles.item}${i === selectedIndex ? ' ' + styles.selected : ''}`}
            role="option"
            aria-selected={i === selectedIndex}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(item)
            }}
          >
            <span className={styles.icon}>{item.isDirectory ? '📁' : '📄'}</span>
            <span className={styles.path}>@{item.relativePath}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
