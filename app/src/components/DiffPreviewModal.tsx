import { useMemo, useState } from 'react'
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/github-dark.min.css'
import {
  attachSyntaxHighlight,
  buildSideBySideRows,
  buildUnifiedDisplayLines,
  languageFromPath,
  type DiffViewMode
} from '../../shared/diffPreview'
import styles from './DiffPreviewModal.module.css'

interface Props {
  diff: string
  path: string
}

function highlightCode(code: string, language: string): string {
  if (!code) return ''
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value
  } catch {
    return hljs.highlightAuto(code).value
  }
}

export function DiffPreviewModal({ diff, path }: Props) {
  const [mode, setMode] = useState<DiffViewMode>('side-by-side')
  const language = useMemo(() => languageFromPath(path), [path])

  const unifiedLines = useMemo(
    () => buildUnifiedDisplayLines(diff, path, highlightCode),
    [diff, path]
  )

  const sideBySideRows = useMemo(() => {
    const rows = buildSideBySideRows(diff)
    return attachSyntaxHighlight(rows, path, highlightCode)
  }, [diff, path])

  if (!diff.trim()) {
    return <div className={styles.empty}>Нет изменений</div>
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.modeSwitch} role="tablist" aria-label="Режим diff">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'unified'}
            className={`${styles.modeBtn}${mode === 'unified' ? ` ${styles.modeBtnActive}` : ''}`}
            onClick={() => setMode('unified')}
          >
            Unified
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'side-by-side'}
            className={`${styles.modeBtn}${mode === 'side-by-side' ? ` ${styles.modeBtnActive}` : ''}`}
            onClick={() => setMode('side-by-side')}
          >
            Side-by-side
          </button>
        </div>
        <span className={styles.langChip}>{language}</span>
      </div>

      <div className={styles.body}>
        {mode === 'unified' ? (
          <pre className={styles.unified}>
            {unifiedLines.map((line, i) => {
              const cls =
                line.kind === 'added'
                  ? styles.added
                  : line.kind === 'removed'
                    ? styles.removed
                    : line.kind === 'hunk'
                      ? styles.hunk
                      : line.kind === 'meta'
                        ? styles.meta
                        : ''

              if (line.html != null && line.html !== '') {
                const prefix = line.text[0] ?? ' '
                return (
                  <code
                    key={i}
                    className={`${styles.unifiedLine} ${cls}`.trim()}
                    dangerouslySetInnerHTML={{ __html: `${prefix}${line.html}\n` }}
                  />
                )
              }

              return (
                <code key={i} className={`${styles.unifiedLine} ${cls}`.trim()}>
                  {line.text}
                  {'\n'}
                </code>
              )
            })}
          </pre>
        ) : (
          <div className={styles.sideBySide}>
            <div className={`${styles.columnHeader} ${styles.columnHeaderLeft}`}>Было</div>
            <div className={styles.columnHeader}>Стало</div>
            {sideBySideRows.map((row, i) => [
              <div
                key={`${i}-l`}
                className={`${styles.cell} ${styles.cellLeft} ${
                  row.leftKind === 'removed'
                    ? styles.cellRemoved
                    : row.leftKind === 'empty'
                      ? styles.cellEmpty
                      : ''
                }`}
                dangerouslySetInnerHTML={{
                  __html: row.leftHtml ?? (row.left == null ? '&nbsp;' : '')
                }}
              />,
              <div
                key={`${i}-r`}
                className={`${styles.cell} ${
                  row.rightKind === 'added'
                    ? styles.cellAdded
                    : row.rightKind === 'empty'
                      ? styles.cellEmpty
                      : ''
                }`}
                dangerouslySetInnerHTML={{
                  __html: row.rightHtml ?? (row.right == null ? '&nbsp;' : '')
                }}
              />
            ])}
          </div>
        )}
      </div>
    </div>
  )
}
