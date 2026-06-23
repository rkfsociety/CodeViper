import { useEffect, useMemo, useState } from 'react'
import type { RoadmapItem } from '../types'
import styles from './RoadmapPickerPanel.module.css'

interface Props {
  onSelect: (prompt: string) => void
  onClose?: () => void
}

const SIZE_CLASS: Record<string, string> = {
  S: styles.sizeS,
  M: styles.sizeM,
  L: styles.sizeL,
  XL: styles.sizeXL
}

export function RoadmapPickerPanel({ onSelect, onClose }: Props) {
  const [items, setItems] = useState<RoadmapItem[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    void window.codeviper
      .listRoadmapItems()
      .then(setItems)
      .catch(() => {})
  }, [])

  const filtered = useMemo(() => {
    if (!filter.trim()) return items
    const q = filter.toLowerCase()
    return items.filter(
      (it) =>
        it.title.toLowerCase().includes(q) ||
        String(it.num).includes(q) ||
        it.chain.toLowerCase().includes(q)
    )
  }, [items, filter])

  // Сгруппировать по chain, сохраняя порядок первого вхождения
  const groups = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, RoadmapItem[]>()
    for (const it of filtered) {
      if (!map.has(it.chain)) {
        order.push(it.chain)
        map.set(it.chain, [])
      }
      map.get(it.chain)!.push(it)
    }
    return order.map((chain) => ({ chain, items: map.get(chain)! }))
  }, [filtered])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>ROADMAP · В планах ({items.length})</span>
        {onClose && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        )}
      </div>

      <div className={styles.filter}>
        <input
          className={styles.filterInput}
          placeholder="Фильтр…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          autoFocus
        />
      </div>

      <div className={styles.list}>
        {groups.length === 0 && (
          <div className={styles.empty}>
            {items.length === 0 ? 'Загрузка…' : 'Ничего не найдено'}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.chain}>
            {groups.length > 1 && <div className={styles.chainHeader}>{g.chain}</div>}
            {g.items.map((it) => (
              <div key={it.num} className={styles.item}>
                <span className={styles.num}>{it.num}</span>
                <span className={`${styles.size} ${SIZE_CLASS[it.size] ?? ''}`}>{it.size}</span>
                <span className={styles.itemTitle} title={it.title}>
                  {it.title}
                </span>
                <span className={styles.priority}>{it.priority}</span>
                <button
                  type="button"
                  className={styles.runBtn}
                  onClick={() => {
                    onSelect(`Выполни пункт ${it.num} из ROADMAP.md — самоулучшение CodeViper.`)
                    onClose?.()
                  }}
                >
                  ▶ Выполнить
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
