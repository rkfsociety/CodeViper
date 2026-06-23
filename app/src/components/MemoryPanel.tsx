import { useCallback, useEffect, useState } from 'react'
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

interface MemoryItemProps {
  entry: MemoryEntry
  onRemove: (id: string) => void
}

const CATEGORY_LABELS: Record<MemoryEntry['category'], string> = {
  pattern: 'паттерн',
  mistake: 'ошибка',
  preference: 'предпочтение',
  project: 'проект',
  skill: 'навык'
}

function MemoryItem({ entry, onRemove }: MemoryItemProps) {
  const isCollective = entry.source === 'collective'

  return (
    <div className={styles.item}>
      <div className={styles.itemHead}>
        <span className={styles.badge}>{CATEGORY_LABELS[entry.category]}</span>
        <span className={styles.scope}>{entry.scope}</span>
        {isCollective && <span className={styles.sourceBadge}>📚 коллектив</span>}
        <button className={`btn ${styles.delete}`} onClick={() => onRemove(entry.id)}>
          ✕
        </button>
      </div>
      <div className={styles.content}>{entry.content}</div>
      {entry.tags.length > 0 && <div className={styles.tags}>{entry.tags.join(' · ')}</div>}
    </div>
  )
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

  const localEntries = entries.filter((e) => e.source !== 'collective')
  const collectiveEntries = entries.filter((e) => e.source === 'collective')

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
        Локальная память{' '}
        {loading ? <Skeleton inline width={28} height={14} /> : `(${localEntries.length})`}
        <button
          type="button"
          className={`btn ${styles.shareBtn}`}
          onClick={share}
          disabled={sharing || !localEntries.length}
          title={
            githubToken ? 'Создать Gist и скопировать ссылку' : 'Нужен GitHub Token в настройках'
          }
        >
          {sharing ? <Skeleton inline width={20} height={14} /> : '⬆ Поделиться'}
        </button>
      </div>
      {shareResult && <div className={styles.shareResult}>{shareResult}</div>}

      {!localEntries.length && !collectiveEntries.length && (
        <div className="empty">
          Пока пусто. Агент запоминает уроки в ViperMemory.md через remember и после задач.
        </div>
      )}

      {localEntries.length > 0 && (
        <div className={styles.list}>
          {localEntries.map((entry) => (
            <div key={entry.id} style={{ paddingBottom: 8 }}>
              <MemoryItem entry={entry} onRemove={remove} />
            </div>
          ))}
        </div>
      )}

      {collectiveEntries.length > 0 && (
        <div>
          <div className={styles.sectionTitle}>
            📚 Коллективная память {collectiveEntries.length}
          </div>
          <div className={styles.list}>
            {collectiveEntries.map((entry) => (
              <div key={entry.id} style={{ paddingBottom: 8 }}>
                <MemoryItem entry={entry} onRemove={remove} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
