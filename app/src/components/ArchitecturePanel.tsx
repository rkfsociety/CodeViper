import { useEffect, useState } from 'react'
import type { ImportCycleResult } from '../types'
import styles from './ArchitecturePanel.module.css'

interface Props {
  projectPath: string | null
}

function formatCycleChain(projectPath: string, chain: string[]): string {
  const root = projectPath.replace(/\\/g, '/').replace(/\/$/, '')
  return chain
    .map((filePath) => {
      const normalized = filePath.replace(/\\/g, '/')
      if (normalized.startsWith(`${root}/`)) return normalized.slice(root.length + 1)
      return normalized
    })
    .join(' → ')
}

export function ArchitecturePanel({ projectPath }: Props) {
  const [result, setResult] = useState<ImportCycleResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setDismissed(false)
    setExpanded(false)
    if (!projectPath) {
      setResult(null)
      return
    }

    let cancelled = false
    setLoading(true)
    void window.codeviper
      .findImportCycles(projectPath)
      .then((scan) => {
        if (!cancelled) setResult(scan)
      })
      .catch(() => {
        if (!cancelled) setResult(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [projectPath])

  if (loading || dismissed || !result?.cycles.length || !projectPath) return null

  const countLabel = `${result.cycles.length}${result.truncated ? '+' : ''}`

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.header}>
        <div className={styles.info}>
          <span className={styles.icon}>⚠️</span>
          <span className={styles.title}>Циклические импорты: {countLabel}</span>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnToggle}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? 'Скрыть' : 'Показать'}
          </button>
          <button type="button" className={styles.btnDismiss} onClick={() => setDismissed(true)}>
            Закрыть
          </button>
        </div>
      </div>
      {expanded && (
        <ol className={styles.cycles}>
          {result.cycles.map((cycle, index) => (
            <li key={`${index}-${cycle.chain[0]}`}>{formatCycleChain(projectPath, cycle.chain)}</li>
          ))}
        </ol>
      )}
      <div className={styles.hint}>
        Просмотрено файлов: {result.filesScanned}. Разорвите цикл, вынеся общий код в отдельный
        модуль.
      </div>
    </div>
  )
}
