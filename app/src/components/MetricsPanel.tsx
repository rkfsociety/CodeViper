import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  METRICS_PANEL_EVENT_DEBOUNCE_MS,
  METRICS_PANEL_POLL_INTERVAL_MS
} from '../../shared/constants'
import type { AgentStreamEvent, ProjectMetricsResult } from '../types'
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
  'model' | 'runs' | 'success' | 'avgDurationMs' | 'totalTokens' | 'toolCalls' | 'estimatedCostUsd'
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

function successPctNumber(successRuns: number, runs: number): number | '' {
  if (runs === 0) return ''
  return Math.round((successRuns / runs) * 100)
}

function csvCell(value: string | number): string {
  const s = String(value)
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function csvRow(cells: Array<string | number>): string {
  return cells.map(csvCell).join(';')
}

function metricsCsvFilename(days: number): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `codeviper-metrics-${days}d-${stamp}.csv`
}

function buildMetricsCsv(
  metrics: AgentMetrics,
  byModel: MetricRow[],
  topTools: Array<{ tool: string; count: number }>
): string {
  const lines: string[] = [
    csvRow(['Период (дн)', metrics.periodDays]),
    csvRow(['Прогонов', metrics.totalRuns]),
    csvRow(['Успешных (%)', successPctNumber(metrics.totalSuccessRuns, metrics.totalRuns)]),
    csvRow(['Токенов', metrics.totalTokens]),
    csvRow(['Стоимость (USD)', metrics.totalCostUsd.toFixed(6)]),
    '',
    csvRow([
      'Модель',
      'Прогонов',
      'Успех (%)',
      'Ср. время (мс)',
      'Токенов',
      'Инструментов',
      'Стоимость (USD)'
    ])
  ]

  for (const row of byModel) {
    lines.push(
      csvRow([
        row.model,
        row.runs,
        successPctNumber(row.successRuns, row.runs),
        row.avgDurationMs,
        row.totalTokens,
        row.toolCalls,
        row.estimatedCostUsd.toFixed(6)
      ])
    )
  }

  lines.push('', csvRow(['Инструмент', 'Количество']))

  for (const { tool, count } of topTools) {
    lines.push(csvRow([tool, count]))
  }

  return `\uFEFF${lines.join('\r\n')}`
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
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

function fmtComplexity(value: number): string {
  if (value === 0) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function ProjectMetricsSection({ projectPath }: { projectPath: string }) {
  const [metrics, setMetrics] = useState<ProjectMetricsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMetrics(null)
    setError(null)
    setExpanded(false)
  }, [projectPath])

  const loadMetrics = () => {
    setLoading(true)
    setError(null)
    void window.codeviper
      .buildProjectMetrics(projectPath)
      .then((result) => setMetrics(result))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setMetrics(null)
      })
      .finally(() => setLoading(false))
  }

  const toggleExpanded = () => {
    setExpanded((open) => {
      const next = !open
      if (next && !metrics && !loading) loadMetrics()
      return next
    })
  }

  const summary = metrics
    ? `${metrics.totalFiles} файлов, ${metrics.codeLines} LOC${metrics.truncated ? '+' : ''}`
    : 'LOC, языки, сложность'

  return (
    <section className={styles.projectSection}>
      <div className={styles.projectHeader}>
        <div className={styles.projectInfo}>
          <span className={styles.projectIcon}>📊</span>
          <span className={styles.projectTitle}>Кодовая база: {summary}</span>
        </div>
        <div className={styles.projectActions}>
          <button type="button" className={styles.projectBtn} onClick={toggleExpanded}>
            {expanded ? 'Скрыть' : 'Показать'}
          </button>
          {expanded && (
            <button
              type="button"
              className={styles.projectBtn}
              onClick={loadMetrics}
              disabled={loading}
            >
              {loading ? '…' : 'Обновить'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className={styles.projectBody}>
          {loading && <div className={styles.projectHint}>Сканирование проекта…</div>}
          {error && <div className={styles.projectError}>{error}</div>}
          {!loading && metrics && (
            <>
              <div className={styles.projectSummary}>
                <div className={styles.summaryCard}>
                  <span className={styles.cardValue}>{metrics.totalFiles}</span>
                  <span className={styles.cardLabel}>Файлов</span>
                </div>
                <div className={styles.summaryCard}>
                  <span className={styles.cardValue}>{metrics.codeLines}</span>
                  <span className={styles.cardLabel}>LOC</span>
                </div>
                <div className={styles.summaryCard}>
                  <span className={styles.cardValue}>{fmtComplexity(metrics.avgComplexity)}</span>
                  <span className={styles.cardLabel}>Ср. сложность</span>
                </div>
                <div className={styles.summaryCard}>
                  <span className={styles.cardValue}>{metrics.languages.length}</span>
                  <span className={styles.cardLabel}>Языков</span>
                </div>
              </div>

              {metrics.languages.length > 0 && (
                <div className={styles.projectLangList}>
                  {metrics.languages.map((lang) => {
                    const maxCode = Math.max(...metrics.languages.map((item) => item.codeLines), 1)
                    const pct = Math.round((lang.codeLines / maxCode) * 100)
                    return (
                      <div key={lang.language} className={styles.toolRow}>
                        <span className={styles.toolName}>{lang.language}</span>
                        <div className={styles.toolBar}>
                          <div className={styles.toolBarFill} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={styles.toolCount}>
                          {lang.files} · {lang.codeLines}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              <div className={styles.projectHint}>
                Просмотрено: {metrics.filesScanned}
                {metrics.truncated ? '+' : ''}. Сложность (сумма): {metrics.totalComplexity}
                {metrics.maxComplexityFile
                  ? `, макс. ${metrics.maxComplexity} (${metrics.maxComplexityFile})`
                  : ''}
                .
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export function MetricsPanel({ projectPath }: { projectPath?: string | null }) {
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

  function exportCsv() {
    if (!metrics) return
    const csv = buildMetricsCsv(metrics, sortedByModel, sortedTopTools)
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), metricsCsvFilename(days))
  }

  const canExport =
    metrics !== null &&
    !loading &&
    (metrics.byModel.length > 0 || metrics.topTools.length > 0 || metrics.totalRuns > 0)

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Метрики агента</span>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.exportBtn}
            onClick={exportCsv}
            disabled={!canExport}
            title="Скачать CSV (по моделям и топ инструментов)"
          >
            CSV
          </button>
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

      {projectPath ? <ProjectMetricsSection projectPath={projectPath} /> : null}
    </div>
  )
}
