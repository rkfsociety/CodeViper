import { useCallback, useEffect, useState } from 'react'
import type { MemoryEntry } from '../types'

interface Props {
  projectPath: string
  selfLearning: boolean
  onSelfLearningChange: (value: boolean) => void
  refreshKey?: number
}

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
          Пока пусто. Агент будет запоминать уроки через инструмент remember и после задач.
        </div>
      )}

      <div className="memory-list">
        {entries.slice(0, 12).map((entry) => (
          <div key={entry.id} className="memory-item">
            <div className="memory-item-head">
              <span className="memory-badge">{CATEGORY_LABELS[entry.category]}</span>
              <span className="memory-scope">{entry.scope}</span>
              <button className="btn memory-delete" onClick={() => remove(entry.id)}>
                ✕
              </button>
            </div>
            <div className="memory-content">{entry.content}</div>
            {entry.tags.length > 0 && (
              <div className="memory-tags">{entry.tags.join(' · ')}</div>
            )}
          </div>
        ))}
      </div>

      {entries.length > 12 && (
        <div className="memory-more">+ ещё {entries.length - 12} записей</div>
      )}
    </div>
  )
}
