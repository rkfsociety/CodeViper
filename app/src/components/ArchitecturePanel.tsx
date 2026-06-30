import { useEffect, useState } from 'react'
import type { DataflowDiagramResult, DependencyDiagramResult, ImportCycleResult } from '../types'
import { MermaidDiagram } from './MermaidDiagram'
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

function ImportCyclesBanner({
  projectPath,
  result,
  onDismiss
}: {
  projectPath: string
  result: ImportCycleResult
  onDismiss: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const countLabel = `${result.cycles.length}${result.truncated ? '+' : ''}`

  return (
    <div className={`${styles.section} ${styles.sectionWarning}`} role="alert">
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
          <button type="button" className={styles.btnDismiss} onClick={onDismiss}>
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

function DependencyDiagramSection({ projectPath }: { projectPath: string }) {
  const [result, setResult] = useState<DependencyDiagramResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setResult(null)
    setError(null)
    setExpanded(false)
  }, [projectPath])

  const loadDiagram = () => {
    setLoading(true)
    setError(null)
    void window.codeviper
      .buildDependencyDiagram(projectPath)
      .then((diagram) => setResult(diagram))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setResult(null)
      })
      .finally(() => setLoading(false))
  }

  const toggleExpanded = () => {
    setExpanded((open) => {
      const next = !open
      if (next && !result && !loading) loadDiagram()
      return next
    })
  }

  const summary = result
    ? `${result.nodeCount} модулей, ${result.edgeCount} связей${result.truncated ? '+' : ''}`
    : 'граф import/require'

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <div className={styles.info}>
          <span className={styles.icon}>🧭</span>
          <span className={styles.title}>Зависимости модулей: {summary}</span>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnToggle} onClick={toggleExpanded}>
            {expanded ? 'Скрыть' : 'Показать'}
          </button>
          {expanded && (
            <button
              type="button"
              className={styles.btnToggle}
              onClick={loadDiagram}
              disabled={loading}
            >
              {loading ? '…' : 'Обновить'}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className={styles.diagramWrap}>
          {loading && <div className={styles.hint}>Построение графа…</div>}
          {error && <div className={styles.error}>{error}</div>}
          {!loading && result && result.nodeCount > 0 && (
            <>
              <MermaidDiagram chart={result.mermaid} />
              <div className={styles.hint}>
                Просмотрено файлов: {result.filesScanned}
                {result.truncated ? '. Граф обрезан по лимиту узлов/рёбер.' : ''}
              </div>
            </>
          )}
          {!loading && result && result.nodeCount === 0 && (
            <div className={styles.hint}>
              Относительных импортов не найдено (просмотрено файлов: {result.filesScanned}).
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DataflowDiagramSection({ projectPath }: { projectPath: string }) {
  const [result, setResult] = useState<DataflowDiagramResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setResult(null)
    setError(null)
    setExpanded(false)
  }, [projectPath])

  const loadDiagram = () => {
    setLoading(true)
    setError(null)
    void window.codeviper
      .buildDataflowDiagram(projectPath)
      .then((diagram) => setResult(diagram))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setResult(null)
      })
      .finally(() => setLoading(false))
  }

  const toggleExpanded = () => {
    setExpanded((open) => {
      const next = !open
      if (next && !result && !loading) loadDiagram()
      return next
    })
  }

  const summary = result
    ? `${result.nodeCount} узлов, ${result.edgeCount} потоков${result.truncated ? '+' : ''}`
    : 'IPC / HTTP / FS'

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <div className={styles.info}>
          <span className={styles.icon}>🔀</span>
          <span className={styles.title}>Потоки данных: {summary}</span>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btnToggle} onClick={toggleExpanded}>
            {expanded ? 'Скрыть' : 'Показать'}
          </button>
          {expanded && (
            <button
              type="button"
              className={styles.btnToggle}
              onClick={loadDiagram}
              disabled={loading}
            >
              {loading ? '…' : 'Обновить'}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className={styles.diagramWrap}>
          {loading && <div className={styles.hint}>Построение DFD…</div>}
          {error && <div className={styles.error}>{error}</div>}
          {!loading && result && result.edgeCount > 0 && (
            <>
              <MermaidDiagram chart={result.mermaid} />
              <div className={styles.hint}>
                Просмотрено файлов: {result.filesScanned}
                {result.truncated ? '. DFD обрезан по лимиту узлов/потоков.' : ''}
              </div>
            </>
          )}
          {!loading && result && result.edgeCount === 0 && (
            <div className={styles.hint}>
              IPC/HTTP/FS потоки не найдены (просмотрено файлов: {result.filesScanned}).
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ArchitecturePanel({ projectPath }: Props) {
  const [cycleResult, setCycleResult] = useState<ImportCycleResult | null>(null)
  const [cyclesLoading, setCyclesLoading] = useState(false)
  const [cyclesDismissed, setCyclesDismissed] = useState(false)

  useEffect(() => {
    setCyclesDismissed(false)
    if (!projectPath) {
      setCycleResult(null)
      return
    }

    let cancelled = false
    setCyclesLoading(true)
    void window.codeviper
      .findImportCycles(projectPath)
      .then((scan) => {
        if (!cancelled) setCycleResult(scan)
      })
      .catch(() => {
        if (!cancelled) setCycleResult(null)
      })
      .finally(() => {
        if (!cancelled) setCyclesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [projectPath])

  if (!projectPath) return null

  const showCycles =
    !cyclesLoading && !cyclesDismissed && (cycleResult?.cycles.length ?? 0) > 0 && cycleResult

  return (
    <div className={styles.panel}>
      {showCycles && (
        <ImportCyclesBanner
          projectPath={projectPath}
          result={cycleResult}
          onDismiss={() => setCyclesDismissed(true)}
        />
      )}
      <DependencyDiagramSection projectPath={projectPath} />
      <DataflowDiagramSection projectPath={projectPath} />
    </div>
  )
}
