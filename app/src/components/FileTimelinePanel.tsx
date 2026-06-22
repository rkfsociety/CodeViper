import { useEffect, useRef, useState } from 'react'
import { useModalA11y } from '../hooks/useModalA11y'
import type { FileHistoryEntry } from '../types'
import styles from './FileTimelinePanel.module.css'

interface Props {
  open: boolean
  filePath: string
  projectPath: string
  onClose: () => void
}

const TOOL_LABELS: Record<FileHistoryEntry['tool'], string> = {
  edit_file: 'Правка',
  write_file: 'Перезапись',
  create_file: 'Создан',
  append_file: 'Добавление',
  delete_file: 'Удалён',
  move_file: 'Перемещён'
}

const TOOL_COLORS: Record<FileHistoryEntry['tool'], string> = {
  edit_file: 'var(--blue-bright)',
  write_file: 'var(--purple-light)',
  create_file: 'var(--green-medium)',
  append_file: 'var(--blue-bright)',
  delete_file: 'var(--red)',
  move_file: 'var(--text-muted)'
}

function formatTs(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function basename(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() ?? path
}

function DiffBlock({ diff }: { diff: string }) {
  const [open, setOpen] = useState(false)
  if (!diff.trim()) return null
  return (
    <div className={styles.diffWrap}>
      <button className={styles.diffToggle} onClick={() => setOpen((v) => !v)}>
        {open ? '▼ Скрыть diff' : '▶ Показать diff'}
      </button>
      {open && <pre className={styles.diff}>{diff}</pre>}
    </div>
  )
}

export function FileTimelinePanel({ open, filePath, projectPath, onClose }: Props) {
  const modalRef = useModalA11y<HTMLDivElement>(open)
  const [entries, setEntries] = useState<FileHistoryEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    if (!open || !filePath || !projectPath) return
    abortRef.current = false
    setLoading(true)
    setError(null)
    setEntries([])
    window.codeviper
      .readFileHistory(projectPath, filePath)
      .then((result) => {
        if (abortRef.current) return
        setEntries([...result].reverse())
      })
      .catch((e: unknown) => {
        if (abortRef.current) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!abortRef.current) setLoading(false)
      })
    return () => {
      abortRef.current = true
    }
  }, [open, filePath, projectPath])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const name = basename(filePath)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        className={`modal ${styles.modal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="timeline-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="timeline-title" className={styles.title}>
            <span className={styles.titleIcon}>📋</span>
            <span className={styles.titleFile} title={filePath}>
              {name}
            </span>
          </h2>
          <button type="button" className="btn modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className={`modal-body ${styles.body}`}>
          {loading && <div className={styles.empty}>Загружаю историю…</div>}

          {error && <div className={styles.errorMsg}>Ошибка: {error}</div>}

          {!loading && !error && entries.length === 0 && (
            <div className={styles.empty}>
              Изменений не найдено. История пишется с момента, когда агент начал работать с этим
              файлом.
            </div>
          )}

          {entries.length > 0 && (
            <ol className={styles.timeline}>
              {entries.map((entry, i) => (
                <li key={i} className={styles.entry}>
                  <div
                    className={styles.dot}
                    style={{ background: TOOL_COLORS[entry.tool] }}
                    aria-hidden="true"
                  />
                  <div className={styles.entryContent}>
                    <div className={styles.entryHeader}>
                      <span
                        className={styles.badge}
                        style={{
                          color: TOOL_COLORS[entry.tool],
                          borderColor: `color-mix(in srgb, ${TOOL_COLORS[entry.tool]} 35%, transparent)`
                        }}
                      >
                        {TOOL_LABELS[entry.tool]}
                      </span>
                      <span className={styles.ts}>{formatTs(entry.ts)}</span>
                    </div>
                    <DiffBlock diff={entry.diff} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}
