import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MemoryCategory, MemoryEntry } from '../types'
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
  onVote?: (id: string, delta: 1 | -1) => void
}

const CATEGORY_LABELS: Record<MemoryEntry['category'], string> = {
  pattern: 'паттерн',
  mistake: 'ошибка',
  preference: 'предпочтение',
  project: 'проект',
  skill: 'навык'
}

const MEMORY_CATEGORIES = Object.keys(CATEGORY_LABELS) as MemoryCategory[]

function matchesMemoryFilter(
  entry: MemoryEntry,
  query: string,
  category: MemoryCategory | ''
): boolean {
  if (category && entry.category !== category) return false
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = [entry.content, entry.scope, CATEGORY_LABELS[entry.category], ...entry.tags]
    .join(' ')
    .toLowerCase()
  return haystack.includes(q)
}

function formatCount(filtered: number, total: number, hasFilter: boolean): string {
  if (!hasFilter || filtered === total) return String(filtered)
  return `${filtered}/${total}`
}

function MemoryItem({ entry, onRemove, onVote }: MemoryItemProps) {
  const isCollective = entry.source === 'collective'
  const score = entry.score ?? 0
  const dimmed = isCollective && score < 0

  return (
    <div className={styles.item} style={dimmed ? { opacity: 0.5 } : undefined}>
      <div className={styles.itemHead}>
        <span className={styles.badge}>{CATEGORY_LABELS[entry.category]}</span>
        <span className={styles.scope}>{entry.scope}</span>
        {isCollective && <span className={styles.sourceBadge}>📚 коллектив</span>}
        {isCollective && onVote && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{ padding: '0 4px', fontSize: 11, lineHeight: 1 }}
              title="Полезная запись"
              onClick={() => onVote(entry.id, 1)}
            >
              ▲
            </button>
            <span style={{ fontSize: 11, minWidth: 16, textAlign: 'center' }}>{score}</span>
            <button
              type="button"
              className="btn btn-sm"
              style={{ padding: '0 4px', fontSize: 11, lineHeight: 1 }}
              title="Бесполезная запись"
              onClick={() => onVote(entry.id, -1)}
            >
              ▼
            </button>
          </span>
        )}
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
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<MemoryCategory | ''>('')

  const localEntries = entries.filter((e) => e.source !== 'collective')
  const collectiveEntries = entries.filter((e) => e.source === 'collective')
  const hasFilter = searchQuery.trim().length > 0 || categoryFilter !== ''

  const filteredLocalEntries = useMemo(
    () => localEntries.filter((e) => matchesMemoryFilter(e, searchQuery, categoryFilter)),
    [localEntries, searchQuery, categoryFilter]
  )
  const filteredCollectiveEntries = useMemo(
    () => collectiveEntries.filter((e) => matchesMemoryFilter(e, searchQuery, categoryFilter)),
    [collectiveEntries, searchQuery, categoryFilter]
  )

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

  async function vote(id: string, delta: 1 | -1) {
    const newScore = await window.codeviper.voteMemory(id, delta)
    setEntries((prev) =>
      prev
        .map((e) => (e.id === id ? { ...e, score: newScore } : e))
        .filter((e) => e.source !== 'collective' || (e.score ?? 0) > -2)
    )
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

      {(localEntries.length > 0 || collectiveEntries.length > 0) && (
        <div className={styles.filters}>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по тексту, тегам, области…"
            aria-label="Поиск в памяти"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as MemoryCategory | '')}
            aria-label="Фильтр по категории"
          >
            <option value="">Все категории</option>
            {MEMORY_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.sectionTitle}>
        Локальная память{' '}
        {loading ? (
          <Skeleton inline width={28} height={14} />
        ) : (
          `(${formatCount(filteredLocalEntries.length, localEntries.length, hasFilter)})`
        )}
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

      {hasFilter &&
        localEntries.length + collectiveEntries.length > 0 &&
        filteredLocalEntries.length + filteredCollectiveEntries.length === 0 && (
          <div className="empty">Ничего не найдено.</div>
        )}

      {localEntries.length > 0 && filteredLocalEntries.length > 0 && (
        <div className={styles.list}>
          {filteredLocalEntries.map((entry) => (
            <div key={entry.id} style={{ paddingBottom: 8 }}>
              <MemoryItem entry={entry} onRemove={remove} />
            </div>
          ))}
        </div>
      )}

      {collectiveEntries.length > 0 && (
        <div>
          <div className={styles.sectionTitle}>
            📚 Коллективная память{' '}
            {formatCount(filteredCollectiveEntries.length, collectiveEntries.length, hasFilter)}
          </div>
          {filteredCollectiveEntries.length > 0 && (
            <div className={styles.list}>
              {filteredCollectiveEntries.map((entry) => (
                <div key={entry.id} style={{ paddingBottom: 8 }}>
                  <MemoryItem entry={entry} onRemove={remove} onVote={vote} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
