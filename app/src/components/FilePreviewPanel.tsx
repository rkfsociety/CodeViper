import { useEffect, useMemo, useState } from 'react'
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/github-dark.min.css'
import {
  buildSourcePreviewLines,
  highlightSourceCode,
  languageFromPath
} from '../../shared/diffPreview'
import styles from './FilePreviewPanel.module.css'

function highlightCode(code: string, language: string): string {
  return hljs.highlight(code, { language, ignoreIllegals: true }).value
}

function highlightAuto(code: string): string {
  return hljs.highlightAuto(code).value
}

export interface FilePreviewPanelProps {
  projectPath: string
  filePath: string
  onClose: () => void
}

export function FilePreviewPanel({ projectPath, filePath, onClose }: FilePreviewPanelProps) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setContent(null)
    void window.codeviper
      .readFile(projectPath, filePath)
      .then((text) => {
        if (!cancelled) {
          setContent(text)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [projectPath, filePath])

  const language = useMemo(() => languageFromPath(filePath), [filePath])
  const lines = useMemo(() => {
    if (content == null) return []
    return buildSourcePreviewLines(content, filePath, highlightCode, highlightAuto)
  }, [content, filePath])

  const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.pathWrap}>
          <span className={styles.fileName} title={filePath}>
            {fileName}
          </span>
          <span className={styles.pathMuted} title={filePath}>
            {filePath}
          </span>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.langChip}>{language}</span>
          <button
            type="button"
            className={`btn ${styles.closeBtn}`}
            onClick={onClose}
            aria-label="Закрыть превью"
            title="Закрыть"
          >
            ✕
          </button>
        </div>
      </header>
      <div className={styles.body}>
        {loading && <div className={styles.hint}>Загрузка…</div>}
        {error && <div className={styles.error}>{error}</div>}
        {!loading && !error && content != null && (
          <pre className={styles.code}>
            {lines.map((html, i) => (
              <code
                key={i}
                className={styles.line}
                dangerouslySetInnerHTML={{ __html: html === '' ? '&nbsp;' : html }}
              />
            ))}
          </pre>
        )}
      </div>
    </div>
  )
}

/** Экспорт для unit-тестов без IPC. */
export function renderFilePreviewHtml(content: string, filePath: string): string {
  return highlightSourceCode(content, filePath, highlightCode, highlightAuto)
}
