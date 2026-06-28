import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flattenFileTree } from '../../shared/fileMentions'
import { filterQuickOpenFiles } from '../../shared/quickOpen'
import { useModalA11y } from '../hooks/useModalA11y'
import styles from './QuickOpenPalette.module.css'

interface Props {
  open: boolean
  projectPath: string
  onClose: () => void
  onFileOpen: (relativePath: string) => void
}

function splitPath(relativePath: string): { name: string; dir: string } {
  const normalized = relativePath.replace(/\\/g, '/')
  const slash = normalized.lastIndexOf('/')
  if (slash < 0) return { name: normalized, dir: '' }
  return { name: normalized.slice(slash + 1), dir: normalized.slice(0, slash + 1) }
}

export function QuickOpenPalette({ open, projectPath, onClose, onFileOpen }: Props) {
  const modalRef = useModalA11y<HTMLDivElement>(open)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [allFiles, setAllFiles] = useState<{ relativePath: string; isDirectory: boolean }[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)
    setLoadError(null)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timer)
  }, [open, projectPath])

  useEffect(() => {
    if (!open || !projectPath.trim()) {
      setAllFiles([])
      return
    }

    let cancelled = false
    setLoading(true)
    setLoadError(null)
    void window.codeviper
      .getProjectTree(projectPath, 12)
      .then((tree) => {
        if (cancelled) return
        setAllFiles(flattenFileTree(tree))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setAllFiles([])
        setLoadError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, projectPath])

  const matches = useMemo(() => filterQuickOpenFiles(allFiles, query), [allFiles, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, matches.length])

  const openSelected = useCallback(
    (index: number) => {
      const item = matches[index]
      if (!item) return
      onFileOpen(item.relativePath)
      onClose()
    },
    [matches, onClose, onFileOpen]
  )

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, Math.max(0, matches.length - 1)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        openSelected(selectedIndex)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, matches.length, onClose, openSelected, selectedIndex])

  if (!open) return null

  const noProject = !projectPath.trim()

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        className={`modal ${styles.modal}`}
        role="dialog"
        aria-modal="true"
        aria-label="Быстрое открытие файла"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.searchRow}>
          <input
            ref={inputRef}
            type="search"
            className={styles.searchInput}
            value={query}
            placeholder={noProject ? 'Сначала выберите проект в чате' : 'Введите имя файла…'}
            disabled={noProject}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                e.preventDefault()
              }
            }}
            aria-autocomplete="list"
            aria-controls="quick-open-list"
          />
          <span className={styles.hint}>Ctrl+P</span>
        </div>

        {noProject ? (
          <div className={styles.empty}>Откройте проект в активном чате, чтобы искать файлы.</div>
        ) : loading ? (
          <div className={styles.loading}>Загрузка дерева проекта…</div>
        ) : loadError ? (
          <div className={styles.empty}>Ошибка: {loadError}</div>
        ) : matches.length === 0 ? (
          <div className={styles.empty}>
            {query.trim() ? 'Ничего не найдено.' : 'Нет файлов в проекте.'}
          </div>
        ) : (
          <ul id="quick-open-list" className={styles.list} role="listbox">
            {matches.map((item, index) => {
              const { name, dir } = splitPath(item.relativePath)
              const active = index === selectedIndex
              return (
                <li
                  key={item.relativePath}
                  role="option"
                  aria-selected={active}
                  className={`${styles.item}${active ? ` ${styles.itemActive}` : ''}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => openSelected(index)}
                >
                  <span className={styles.itemPath}>
                    {dir ? <span className={styles.itemDir}>{dir}</span> : null}
                    <span className={styles.itemName}>{name}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
