import { useMemo, useState } from 'react'
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/github-dark.min.css'
import {
  attachSyntaxHighlight,
  buildSideBySideRows,
  buildUnifiedDisplayLines,
  languageFromPath,
  parseDiffHunks,
  type DiffHunk,
  type DiffViewMode
} from '../../shared/diffPreview'
import styles from './DiffPreviewModal.module.css'

interface Props {
  diff: string
  path: string
  /** Если передан — показывает чекбоксы и вызывается при клике «Применить выбранное» */
  onApplyPartial?: (selectedHunkIndices: number[]) => void
}

function highlightCode(code: string, language: string): string {
  if (!code) return ''
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value
  } catch {
    return hljs.highlightAuto(code).value
  }
}

function HunkCheckbox({
  hunk,
  checked,
  onChange
}: {
  hunk: DiffHunk
  checked: boolean
  onChange: (idx: number, val: boolean) => void
}) {
  const added = hunk.lines.filter((l) => l[0] === '+').length
  const removed = hunk.lines.filter((l) => l[0] === '-').length
  return (
    <label className={styles.hunkCheckbox}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(hunk.index, e.target.checked)}
      />
      <span className={styles.hunkHeader}>{hunk.header}</span>
      <span className={styles.hunkStat}>
        {added > 0 && <span className={styles.statAdded}>+{added}</span>}
        {removed > 0 && <span className={styles.statRemoved}>-{removed}</span>}
      </span>
    </label>
  )
}

export function DiffPreviewModal({ diff, path, onApplyPartial }: Props) {
  const [mode, setMode] = useState<DiffViewMode>('side-by-side')
  const language = useMemo(() => languageFromPath(path), [path])

  const hunks = useMemo(() => parseDiffHunks(diff), [diff])
  const [selectedHunks, setSelectedHunks] = useState<Set<number>>(
    () => new Set(hunks.map((h) => h.index))
  )

  const toggleHunk = (idx: number, val: boolean) => {
    setSelectedHunks((prev) => {
      const next = new Set(prev)
      if (val) next.add(idx)
      else next.delete(idx)
      return next
    })
  }

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

  const allSelected = selectedHunks.size === hunks.length
  const noneSelected = selectedHunks.size === 0

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

      {/* Hunk-selection панель — только когда передан onApplyPartial и есть >1 ханка */}
      {onApplyPartial && hunks.length > 1 && (
        <div className={styles.hunkPanel}>
          <div className={styles.hunkPanelHeader}>
            <span>Выбрать куски изменений:</span>
            <button
              type="button"
              className={styles.hunkToggleAll}
              onClick={() =>
                setSelectedHunks(allSelected ? new Set() : new Set(hunks.map((h) => h.index)))
              }
            >
              {allSelected ? 'Снять все' : 'Выбрать все'}
            </button>
          </div>
          {hunks.map((hunk) => (
            <HunkCheckbox
              key={hunk.index}
              hunk={hunk}
              checked={selectedHunks.has(hunk.index)}
              onChange={toggleHunk}
            />
          ))}
          {onApplyPartial && (
            <button
              type="button"
              className={`btn ${styles.applyPartialBtn}`}
              disabled={noneSelected}
              onClick={() => onApplyPartial(Array.from(selectedHunks))}
            >
              {allSelected
                ? '✅ Применить всё'
                : `✅ Применить выбранное (${selectedHunks.size}/${hunks.length})`}
            </button>
          )}
        </div>
      )}

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
