import { useCallback, useEffect, useRef, useState } from 'react'
import { Skeleton } from './Skeleton'
import type { CiStatus, PullRequestListResult } from '../types'
import styles from './PrStatusPanel.module.css'

const POLL_INTERVAL_MS = 300_000

const CI_LABEL: Record<CiStatus, string> = {
  success: '✓ CI прошёл',
  failure: '✕ CI упал',
  pending: '⏳ CI идёт',
  none: '— нет CI'
}

export function PrStatusPanel({
  isOpen,
  manualRefresh
}: {
  isOpen: boolean
  manualRefresh?: boolean
}) {
  const [result, setResult] = useState<PullRequestListResult | null>(null)
  const [loading, setLoading] = useState(false)
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      setResult(await window.codeviper.listPullRequests())
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return
    void load()
    if (manualRefresh) return
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [isOpen, manualRefresh, load])

  const prs = result?.prs ?? []

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>
          Pull Requests {loading ? <Skeleton inline width={28} height={14} /> : `(${prs.length})`}
        </span>
        <button type="button" className="btn" onClick={() => void load()} disabled={loading}>
          Обновить
        </button>
      </div>

      {result && !result.ok && <div className="hint">{result.error}</div>}

      {result?.ok && prs.length === 0 && <div className="empty">Открытых PR нет.</div>}

      {prs.length > 0 && (
        <ul className={styles.list}>
          {prs.map((pr) => (
            <li key={pr.number} className={styles.item}>
              <div className={styles.itemMain}>
                <div className={styles.itemTitle}>
                  <span className={styles.number}>#{pr.number}</span> {pr.title}
                  {pr.isDraft && <span className={styles.draft}>draft</span>}
                </div>
                <div className={styles.itemMeta}>
                  <span className={styles.branch}>{pr.headRefName}</span>
                  <span className={`${styles.ci} ${styles[pr.ciStatus]}`}>
                    {CI_LABEL[pr.ciStatus]}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => window.codeviper.openExternal(pr.url)}
                title="Открыть PR на GitHub"
              >
                Открыть на GitHub
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
