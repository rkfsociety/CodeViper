import { useCallback, useEffect, useState } from 'react'
import type { MemoryEntry } from '../types'

interface Props {
  projectPath: string
  selfLearning: boolean
  onSelfLearningChange: (value: boolean) => void
  refreshKey?: number
}

const PAGE_SIZE = 12

const CATEGORY_LABELS: Record<MemoryEntry['category'], string> = {
  pattern: 'паттерн',
  mistake: 'ошибка',
  preference: 'предпочтение',
  project: 'проект',
  skill: 'навык'
}

export function MemoryPanel({
  projectPath,
  selfLearning,
  onSelfLearningChange,
  refreshKey = 0
}: Props) {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(PAGE_SIZE)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.codeviper.listMemories(projectPath)
      setEntries(list)
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  useEffect(() => {
    refresh()
  }, [refresh, refreshKey])

  async function remove(id: string) {
    await window.codeviper.deleteMemory(projectPath, id)
    await refresh()
  }

  return (
    <div className="memory-panel">
      <label className="memory-toggle">
        <input
          type="checkbox"
          checked={selfLearning}
          onChange={(e) => onSelfLearningChange(e.target.checked)}
        />
        Самообучение после задач
      </label>

      <div className="memory-section-title">
        Память агента {loading ? '…' : `(${entries.length})`}
      </div>

      {!entries.length && (
        <div className="empty">
          Пока пусто. Агент запоминает уроки в ViperMemory.md через remember и после задач.
        </div>
      )}

      <div className="memory-list">
        {entries.slice(0, visible).map((entry) => (
          <div key={entry.id} className="memory-item">
            <div className="memory-item-head">
              <span className="memory-badge">{CATEGORY_LABELS[entry.category]}</span>
              <span className="memory-scope">{entry.scope}</span>
              <button className="btn memory-delete" onClick={() => remove(entry.id)}>
                ✕
              </button>
            </div>
            <div className="memory-content">{entry.content}</div>
            {entry.tags.length > 0 && <div className="memory-tags">{entry.tags.join(' · ')}</div>}
          </div>
        ))}
      </div>

      {entries.length > visible && (
        <button
          type="button"
          className="btn memory-more-btn"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
        >
          Показать ещё ({entries.length - visible})
        </button>
      )}
    </div>
  )
}
