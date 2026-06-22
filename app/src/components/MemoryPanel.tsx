import { useCallback, useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { MemoryEntry } from '../types'
import { Skeleton } from './Skeleton'
import styles from './MemorySkills.module.css'

interface Props {
  projectPath: string
  selfLearning: boolean
  onSelfLearningChange: (value: boolean) => void
  githubToken?: string
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
  githubToken,
  refreshKey = 0
}: Props) {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareResult, setShareResult] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 90,
    overscan: 3
  })

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

  async function share() {
    if (!githubToken) {
      setShareResult('⚠ Укажите GitHub Token в настройках (вкладка Интеграции)')
      return
    }
    setSharing(true)
    setShareResult(null)
    try {
      const url = await window.codeviper.shareAsGist(githubToken, projectPath, 'memory')
      await navigator.clipboard.writeText(url)
      setShareResult(`✓ Скопировано: ${url}`)
    } catch (e) {
      setShareResult(`✕ Ошибка: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className={styles.panel}>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={selfLearning}
          onChange={(e) => onSelfLearningChange(e.target.checked)}
        />
        Самообучение после задач
      </label>

      <div className={styles.sectionTitle}>
        Память агента {loading ? <Skeleton inline width={28} height={14} /> : `(${entries.length})`}
        <button
          type="button"
          className={`btn ${styles.shareBtn}`}
          onClick={share}
          disabled={sharing || !entries.length}
          title={
            githubToken ? 'Создать Gist и скопировать ссылку' : 'Нужен GitHub Token в настройках'
          }
        >
          {sharing ? <Skeleton inline width={20} height={14} /> : '⬆ Поделиться'}
        </button>
      </div>
      {shareResult && <div className={styles.shareResult}>{shareResult}</div>}

      {!entries.length && (
        <div className="empty">
          Пока пусто. Агент запоминает уроки в ViperMemory.md через remember и после задач.
        </div>
      )}

      <div ref={listRef} className={styles.list}>
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index]
            return (
              <div
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingBottom: 8
                }}
              >
                <div className={styles.item}>
                  <div className={styles.itemHead}>
                    <span className={styles.badge}>{CATEGORY_LABELS[entry.category]}</span>
                    <span className={styles.scope}>{entry.scope}</span>
                    <button className={`btn ${styles.delete}`} onClick={() => remove(entry.id)}>
                      ✕
                    </button>
                  </div>
                  <div className={styles.content}>{entry.content}</div>
                  {entry.tags.length > 0 && (
                    <div className={styles.tags}>{entry.tags.join(' · ')}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
