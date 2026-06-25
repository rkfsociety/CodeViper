import { useEffect, useState } from 'react'
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

export function MetricsPanel() {
  const [days, setDays] = useState<7 | 14 | 30 | 90>(30)
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    setMetrics(null)
    window.codeviper
      .getAgentMetrics(days)
      .then((m) => setMetrics(m as AgentMetrics))
      .catch(() => setMetrics(null))
      .finally(() => setLoading(false))
  }, [days])

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
                      <th>Модель</th>
                      <th className={styles.right}>Прогонов</th>
                      <th className={styles.right}>Успех</th>
                      <th className={styles.right}>Ср. время</th>
                      <th className={styles.right}>Токенов</th>
                      <th className={styles.right}>Инструм.</th>
                      <th className={styles.right}>Стоимость</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.byModel.map((row) => (
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
              <div className={styles.sectionTitle}>Топ инструментов</div>
              <div className={styles.toolList}>
                {metrics.topTools.map(({ tool, count }) => {
                  const maxCount = metrics.topTools[0]?.count ?? 1
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
