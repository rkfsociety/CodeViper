import { useEffect, useState } from 'react'
import type {
  CodeViperAPI,
  DataflowDiagramResult,
  DependencyDiagramResult,
  ImportCycleResult
} from '../types'
import { MermaidDiagram } from './MermaidDiagram'
import styles from './ArchitecturePanel.module.css'

interface Props {
  projectPath: string | null
}

type DiagramKind = 'dependencies' | 'dataflow'

const SHELL_UPGRADE_HINT =
  'Функция недоступна в текущей оболочке. Перезапустите CodeViper.exe после git pull в source или установите последний релиз.'

function hasCodeviperApi(name: keyof CodeViperAPI): boolean {
  return typeof window.codeviper?.[name] === 'function'
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

function ArchitectureDiagramWindow({
  projectPath,
  kind,
  onClose
}: {
  projectPath: string
  kind: DiagramKind
  onClose: () => void
}) {
  const [result, setResult] = useState<DependencyDiagramResult | DataflowDiagramResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDependencies = kind === 'dependencies'

  useEffect(() => {
    setResult(null)
    setError(null)
  }, [projectPath, kind])

  const loadDiagram = () => {
    const apiName = isDependencies ? 'buildDependencyDiagram' : 'buildDataflowDiagram'
    if (!hasCodeviperApi(apiName)) {
      setError(SHELL_UPGRADE_HINT)
      return
    }
    setLoading(true)
    setError(null)
    const request = isDependencies
      ? window.codeviper.buildDependencyDiagram(projectPath)
      : window.codeviper.buildDataflowDiagram(projectPath)
    void request
      .then((diagram) => setResult(diagram))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setResult(null)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadDiagram()
    // loadDiagram closes over the current projectPath/kind pair.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, kind])

  const hasContent = result ? (isDependencies ? result.nodeCount > 0 : result.edgeCount > 0) : false
  const emptyText = isDependencies
    ? `Относительных импортов не найдено (просмотрено файлов: ${result?.filesScanned ?? 0}).`
    : `IPC/HTTP/FS потоки не найдены (просмотрено файлов: ${result?.filesScanned ?? 0}).`
  const loadingText = isDependencies ? 'Построение графа...' : 'Построение DFD...'
  const title = isDependencies
    ? 'Зависимости модулей: граф import/require'
    : 'Потоки данных: IPC / HTTP / FS'
  const icon = isDependencies ? '🧭' : '🔀'
  const truncatedText = isDependencies
    ? '. Граф обрезан по лимиту узлов/рёбер.'
    : '. DFD обрезан по лимиту узлов/потоков.'

  return (
    <div className={styles.windowOverlay} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.window}>
        <div className={styles.windowHeader}>
          <div className={styles.info}>
            <span className={styles.icon}>{icon}</span>
            <span className={styles.title}>{title}</span>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnToggle}
              onClick={loadDiagram}
              disabled={loading}
            >
              {loading ? '...' : 'Обновить'}
            </button>
            <button type="button" className={styles.btnDismiss} onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>
        <div className={styles.windowBody}>
          {loading && <div className={styles.hint}>{loadingText}</div>}
          {error && <div className={styles.error}>{error}</div>}
          {!loading && result && hasContent && (
            <>
              <MermaidDiagram chart={result.mermaid} />
              <div className={styles.hint}>
                Просмотрено файлов: {result.filesScanned}
                {result.truncated ? truncatedText : ''}
              </div>
            </>
          )}
          {!loading && result && !hasContent && <div className={styles.hint}>{emptyText}</div>}
        </div>
      </div>
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

    if (!hasCodeviperApi('findImportCycles')) {
      setCycleResult(null)
      setCyclesLoading(false)
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
    </div>
  )
}

export function ArchitectureGraphWindow({
  projectPath,
  kind,
  onClose
}: {
  projectPath: string | null
  kind: DiagramKind | null
  onClose: () => void
}) {
  if (!projectPath || !kind) return null
  return <ArchitectureDiagramWindow projectPath={projectPath} kind={kind} onClose={onClose} />
}
