import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  METRICS_PANEL_EVENT_DEBOUNCE_MS,
  METRICS_PANEL_POLL_INTERVAL_MS
} from '../../shared/constants'
import type { AgentStreamEvent } from '../types'
import styles from './MetricsPanel.module.css'

interface MetricRow {
  model: string
  runs: number
  successRuns: number
  avgDurationMs: number
  totalTokens: number
  toolCalls: number
  estimatedCostUsd: number
}

interface AgentMetrics {
  byModel: MetricRow[]
  topTools: Array<{ tool: string; count: number }>
  totalRuns: number
  totalSuccessRuns: number
  totalTokens: number
  totalCostUsd: number
  periodDays: number
}

const PERIODS = [7, 14, 30, 90] as const

type ModelSortKey =
  | 'model'
  | 'runs'
  | 'success'
  | 'avgDurationMs'
  | 'totalTokens'
  | 'toolCalls'
  | 'estimatedCostUsd'
type SortDir = 'asc' | 'desc'

type ToolSortKey = 'tool' | 'count'

const MODEL_COLUMNS: Array<{ key: ModelSortKey; label: string; align?: 'right' }> = [
  { key: 'model', label: 'Модель' },
  { key: 'runs', label: 'Прогонов', align: 'right' },
  { key: 'success', label: 'Успех', align: 'right' },
  { key: 'avgDurationMs', label: 'Ср. время', align: 'right' },
  { key: 'totalTokens', label: 'Токенов', align: 'right' },
  { key: 'toolCalls', label: 'Инструм.', align: 'right' },
  { key: 'estimatedCostUsd', label: 'Стоимость', align: 'right' }
]

function defaultSortDir(key: ModelSortKey | ToolSortKey): SortDir {
  return key === 'model' || key === 'tool' ? 'asc' : 'desc'
}

function compareModelRows(a: MetricRow, b: MetricRow, key: ModelSortKey): number {
  switch (key) {
    case 'model':
      return a.model.localeCompare(b.model, 'ru')
    case 'success':
      return a.runs === 0 && b.runs === 0
        ? 0
        : a.successRuns / Math.max(a.runs, 1) - b.successRuns / Math.max(b.runs, 1)
    case 'runs':
      return a.runs - b.runs
    case 'avgDurationMs':
      return a.avgDurationMs - b.avgDurationMs
    case 'totalTokens':
      return a.totalTokens - b.totalTokens
    case 'toolCalls':
      return a.toolCalls - b.toolCalls
    case 'estimatedCostUsd':
      return a.estimatedCostUsd - b.estimatedCostUsd
  }
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}мс`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}с`
  return `${Math.floor(ms / 60_000)}м ${Math.round((ms % 60_000) / 1000)}с`
}

function fmtCost(usd: number): string {
  if (usd === 0) return '—'
  if (usd < 0.001) return '<$0.001'
  return `$${usd.toFixed(3)}`
}

function fmtTokens(n: number): string {
  if (n === 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function successPct(successRuns: number, runs: number): string {
  if (runs === 0) return '—'
  return `${Math.round((successRuns / runs) * 100)}%`
}

function shouldRefreshMetricsOnStreamEvent(event: AgentStreamEvent): boolean {
  if (event.type === 'done' || event.type === 'error') return true
  if (event.type === 'tool_end' || event.type === 'generation_metrics') return true
  if (event.type !== 'trace' || !event.traceEvent) return false
  return (
    event.traceEvent.kind === 'run_end' ||
    event.traceEvent.kind === 'tool_call' ||
    event.traceEvent.kind === 'llm_response'
  )
}

export function MetricsPanel() {
  const [days, setDays] = useState<7 | 14 | 30 | 90>(30)
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null)
  const [loading, setLoading] = useState(false)
  const inFlightRef = useRef(false)
  const eventDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [modelSort, setModelSort] = useState<{ key: ModelSortKey; dir: SortDir }>({
    key: 'runs',
    dir: 'desc'
  })
  const [toolSort, setToolSort] = useState<{ key: ToolSortKey; dir: SortDir }>({
    key: 'count',
    dir: 'desc'
  })

  const loadMetrics = useCallback(
    async (opts?: { showLoading?: boolean }) => {
      if (inFlightRef.current) return
      inFlightRef.current = true
      if (opts?.showLoading) {
        setLoading(true)
        setMetrics(null)
      }
      try {
        const m = (await window.codeviper.getAgentMetrics(days)) as AgentMetrics
        setMetrics(m)
      } catch {
        if (opts?.showLoading) setMetrics(null)
      } finally {
        inFlightRef.current = false
        if (opts?.showLoading) setLoading(false)
      }
    },
    [days]
  )

  const scheduleRefresh = useCallback(() => {
    if (eventDebounceRef.current) clearTimeout(eventDebounceRef.current)
    eventDebounceRef.current = setTimeout(() => {
      eventDebounceRef.current = null
      void loadMetrics()
    }, METRICS_PANEL_EVENT_DEBOUNCE_MS)
  }, [loadMetrics])

  useEffect(() => {
    void loadMetrics({ showLoading: true })
    const timer = setInterval(() => void loadMetrics(), METRICS_PANEL_POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [loadMetrics])

  useEffect(() => {
    return () => {
      if (eventDebounceRef.current) clearTimeout(eventDebounceRef.current)
    }
  }, [])

  useEffect(() => {
    return window.codeviper.onAgentStream((event) => {
      if (shouldRefreshMetricsOnStreamEvent(event)) scheduleRefresh()
    })
  }, [scheduleRefresh])

  const sortedByModel = useMemo(() => {
    if (!metrics) return []
    const rows = [...metrics.byModel]
    const sign = modelSort.dir === 'asc' ? 1 : -1
    rows.sort((a, b) => sign * compareModelRows(a, b, modelSort.key))
    return rows
  }, [metrics, modelSort])

  const sortedTopTools = useMemo(() => {
    if (!metrics) return []
    const rows = [...metrics.topTools]
    const sign = toolSort.dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      if (toolSort.key === 'tool') return sign * a.tool.localeCompare(b.tool, 'ru')
      return sign * (a.count - b.count)
    })
    return rows
  }, [metrics, toolSort])

  function toggleModelSort(key: ModelSortKey) {
    setModelSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: defaultSortDir(key) }
    )
  }

  function toggleToolSort(key: ToolSortKey) {
    setToolSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: defaultSortDir(key) }
    )
  }

  function sortIndicator(active: boolean, dir: SortDir): string {
    if (!active) return '↕'
    return dir === 'asc' ? '↑' : '↓'
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Метрики агента</span>
        <div className={styles.periods}>
          {PERIODS.map((d) => (
            <button
              key={d}
              className={`${styles.periodBtn}${days === d ? ` ${styles.active}` : ''}`}
              onClick={() => setDays(d)}
            >
              {d}д
            </button>
          ))}
        </div>
      </div>

      {loading && <div className={styles.loading}>Загрузка…</div>}

      {!loading && metrics && (
        <div className={styles.body}>
          <div className={styles.summary}>
            <div className={styles.summaryCard}>
              <span className={styles.cardValue}>{metrics.totalRuns}</span>
              <span className={styles.cardLabel}>Прогонов</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardValue}>
                {successPct(metrics.totalSuccessRuns, metrics.totalRuns)}
              </span>
              <span className={styles.cardLabel}>Успешных</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardValue}>{fmtTokens(metrics.totalTokens)}</span>
              <span className={styles.cardLabel}>Токенов</span>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.cardValue}>{fmtCost(metrics.totalCostUsd)}</span>
              <span className={styles.cardLabel}>Стоимость</span>
            </div>
          </div>

          {metrics.byModel.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitle}>По моделям</div>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {MODEL_COLUMNS.map(({ key, label, align }) => (
                        <th
                          key={key}
                          className={`${styles.sortable}${align === 'right' ? ` ${styles.right}` : ''}${
                            modelSort.key === key ? ` ${styles.sortActive}` : ''
                          }`}
                        >
                          <button
                            type="button"
                            className={styles.sortBtn}
                            onClick={() => toggleModelSort(key)}
                            aria-sort={
                              modelSort.key === key
                                ? modelSort.dir === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            <span>{label}</span>
                            <span className={styles.sortIcon} aria-hidden>
                              {sortIndicator(modelSort.key === key, modelSort.dir)}
                            </span>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedByModel.map((row) => (
                      <tr key={row.model}>
                        <td className={styles.modelCell} title={row.model}>
                          {row.model}
                        </td>
                        <td className={styles.right}>{row.runs}</td>
                        <td className={styles.right}>{successPct(row.successRuns, row.runs)}</td>
                        <td className={styles.right}>{fmtDuration(row.avgDurationMs)}</td>
                        <td className={styles.right}>{fmtTokens(row.totalTokens)}</td>
                        <td className={styles.right}>{row.toolCalls || '—'}</td>
                        <td className={styles.right}>{fmtCost(row.estimatedCostUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {metrics.topTools.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitleRow}>
                <div className={styles.sectionTitle}>Топ инструментов</div>
                <div className={styles.toolSorts}>
                  <button
                    type="button"
                    className={`${styles.toolSortBtn}${
                      toolSort.key === 'count' ? ` ${styles.toolSortActive}` : ''
                    }`}
                    onClick={() => toggleToolSort('count')}
                  >
                    Кол-во {sortIndicator(toolSort.key === 'count', toolSort.dir)}
                  </button>
                  <button
                    type="button"
                    className={`${styles.toolSortBtn}${
                      toolSort.key === 'tool' ? ` ${styles.toolSortActive}` : ''
                    }`}
                    onClick={() => toggleToolSort('tool')}
                  >
                    Имя {sortIndicator(toolSort.key === 'tool', toolSort.dir)}
                  </button>
                </div>
              </div>
              <div className={styles.toolList}>
                {sortedTopTools.map(({ tool, count }) => {
                  const maxCount = Math.max(...sortedTopTools.map((t) => t.count), 1)
                  const pct = Math.round((count / maxCount) * 100)
                  return (
                    <div key={tool} className={styles.toolRow}>
                      <span className={styles.toolName}>{tool}</span>
                      <div className={styles.toolBar}>
                        <div className={styles.toolBarFill} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={styles.toolCount}>{count}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {metrics.totalRuns === 0 && (
            <div className={styles.empty}>Нет данных за последние {days} дней</div>
          )}
        </div>
      )}

      {!loading && !metrics && <div className={styles.empty}>Не удалось загрузить метрики</div>}
    </div>
  )
}
