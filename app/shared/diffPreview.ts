export type DiffViewMode = 'unified' | 'side-by-side'

export type DiffLineKind = 'context' | 'removed' | 'added' | 'empty' | 'hunk' | 'meta'

export interface UnifiedDiffLine {
  text: string
  kind: DiffLineKind
}

export interface SideBySideRow {
  left: string | null
  right: string | null
  leftKind: 'context' | 'removed' | 'empty'
  rightKind: 'context' | 'added' | 'empty'
  leftHtml: string | null
  rightHtml: string | null
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  cs: 'csharp',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  json: 'json',
  md: 'markdown',
  css: 'css',
  scss: 'scss',
  html: 'xml',
  xml: 'xml',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  ps1: 'powershell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  vue: 'xml'
}

export function languageFromPath(path: string): string {
  const ext = path.replace(/\\/g, '/').split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_BY_EXT[ext] ?? 'plaintext'
}

export function parseUnifiedDiffLines(diff: string): UnifiedDiffLine[] {
  const lines: UnifiedDiffLine[] = []
  for (const rawLine of diff.split('\n')) {
    if (!rawLine) continue
    if (rawLine.startsWith('---') || rawLine.startsWith('+++')) {
      lines.push({ text: rawLine, kind: 'meta' })
      continue
    }
    if (rawLine.startsWith('@@')) {
      lines.push({ text: rawLine, kind: 'hunk' })
      continue
    }
    if (rawLine.startsWith('+')) {
      lines.push({ text: rawLine, kind: 'added' })
      continue
    }
    if (rawLine.startsWith('-')) {
      lines.push({ text: rawLine, kind: 'removed' })
      continue
    }
    lines.push({ text: rawLine, kind: 'context' })
  }
  return lines
}

export function reconstructDiffSides(diff: string): { oldText: string; newText: string } {
  const oldLines: string[] = []
  const newLines: string[] = []

  for (const rawLine of diff.split('\n')) {
    if (
      !rawLine ||
      rawLine.startsWith('---') ||
      rawLine.startsWith('+++') ||
      rawLine.startsWith('@@')
    ) {
      continue
    }
    const prefix = rawLine[0]
    const content = rawLine.slice(1)
    if (prefix === ' ') {
      oldLines.push(content)
      newLines.push(content)
    } else if (prefix === '-') {
      oldLines.push(content)
    } else if (prefix === '+') {
      newLines.push(content)
    }
  }

  return { oldText: oldLines.join('\n'), newText: newLines.join('\n') }
}

export function buildSideBySideRows(diff: string): SideBySideRow[] {
  const rows: SideBySideRow[] = []

  for (const rawLine of diff.split('\n')) {
    if (
      !rawLine ||
      rawLine.startsWith('---') ||
      rawLine.startsWith('+++') ||
      rawLine.startsWith('@@')
    ) {
      continue
    }

    const prefix = rawLine[0]
    const content = rawLine.slice(1)

    if (prefix === ' ') {
      rows.push({
        left: content,
        right: content,
        leftKind: 'context',
        rightKind: 'context',
        leftHtml: null,
        rightHtml: null
      })
    } else if (prefix === '-') {
      rows.push({
        left: content,
        right: null,
        leftKind: 'removed',
        rightKind: 'empty',
        leftHtml: null,
        rightHtml: null
      })
    } else if (prefix === '+') {
      rows.push({
        left: null,
        right: content,
        leftKind: 'empty',
        rightKind: 'added',
        leftHtml: null,
        rightHtml: null
      })
    }
  }

  return rows
}

function splitHighlightedLines(html: string): string[] {
  return html.split('\n')
}

export function attachSyntaxHighlight(
  rows: SideBySideRow[],
  path: string,
  highlight: (code: string, language: string) => string
): SideBySideRow[] {
  const language = languageFromPath(path)
  const { oldText, newText } = reconstructDiffSidesFromRows(rows)
  const oldLines = splitHighlightedLines(highlight(oldText, language))
  const newLines = splitHighlightedLines(highlight(newText, language))

  let oldIdx = 0
  let newIdx = 0

  return rows.map((row) => {
    const next = { ...row }
    if (row.leftKind !== 'empty') {
      next.leftHtml = oldLines[oldIdx] ?? escapeHtml(row.left ?? '')
      oldIdx += 1
    }
    if (row.rightKind !== 'empty') {
      next.rightHtml = newLines[newIdx] ?? escapeHtml(row.right ?? '')
      newIdx += 1
    }
    return next
  })
}

function reconstructDiffSidesFromRows(rows: SideBySideRow[]): { oldText: string; newText: string } {
  const oldLines: string[] = []
  const newLines: string[] = []
  for (const row of rows) {
    if (row.leftKind !== 'empty' && row.left != null) oldLines.push(row.left)
    if (row.rightKind !== 'empty' && row.right != null) newLines.push(row.right)
  }
  return { oldText: oldLines.join('\n'), newText: newLines.join('\n') }
}

// ── Hunk-level operations ─────────────────────────────────────────────────────

export interface DiffHunk {
  header: string
  lines: string[]
  /** Номер ханка (0-based) */
  index: number
}

/** Разбивает unified diff на массив ханков. Мета-строки (--- / +++) не включаются. */
export function parseDiffHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let current: DiffHunk | null = null

  for (const line of diff.split('\n')) {
    if (line.startsWith('---') || line.startsWith('+++')) continue
    if (line.startsWith('@@')) {
      if (current) hunks.push(current)
      current = { header: line, lines: [], index: hunks.length }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current) hunks.push(current)
  return hunks
}

/**
 * Применяет только выбранные ханки к `originalContent`.
 * Невыбранные ханки пропускаются — соответствующие строки оригинала остаются без изменений.
 */
export function applySelectedHunks(
  originalContent: string,
  diff: string,
  selectedIndices: number[]
): string {
  const selected = new Set(selectedIndices)
  const hunks = parseDiffHunks(diff)
  const origLines = originalContent.split('\n')
  const result: string[] = []

  // Последняя строка оригинала, которую мы уже включили в result (1-based)
  let lastOrigLine = 0

  for (const hunk of hunks) {
    // Парсим заголовок: @@ -oldStart,oldCount +newStart,newCount @@
    const m = hunk.header.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (!m) continue
    const oldStart = parseInt(m[1]) // 1-based
    const oldCount = m[2] !== undefined ? parseInt(m[2]) : 1

    if (selected.has(hunk.index)) {
      // Включаем строки оригинала до начала ханка
      for (let i = lastOrigLine; i < oldStart - 1; i++) {
        result.push(origLines[i] ?? '')
      }
      lastOrigLine = oldStart - 1 + oldCount

      // Применяем ханк: контекст и добавленные строки попадают в результат; удалённые — нет
      for (const line of hunk.lines) {
        if (!line) continue
        const prefix = line[0]
        if (prefix === ' ' || prefix === '+') result.push(line.slice(1))
      }
    }
    // Невыбранный ханк: пропускаем — origLines до следующего ханка будут добавлены позже
  }

  // Остаток оригинала после последнего ханка
  for (let i = lastOrigLine; i < origLines.length; i++) {
    result.push(origLines[i] ?? '')
  }

  // Убираем trailing newline артефакт — diff обычно заканчивается на '\n'
  if (result.length > 0 && result[result.length - 1] === '') {
    // сохраняем trailing newline как в оригинале
    if (!originalContent.endsWith('\n')) result.pop()
  }

  return result.join('\n')
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export type SourceHighlightFn = (code: string, language: string) => string

/** Подсветка исходника по расширению пути (как в DiffPreviewModal). */
export function highlightSourceCode(
  code: string,
  path: string,
  highlight: SourceHighlightFn,
  highlightAuto?: (code: string) => string
): string {
  if (!code) return ''
  const language = languageFromPath(path)
  try {
    return highlight(code, language)
  } catch {
    if (highlightAuto) return highlightAuto(code)
    return escapeHtml(code)
  }
}

export function splitHighlightedHtmlLines(html: string): string[] {
  return html.split('\n')
}

/** Строки HTML для read-only превью файла. */
export function buildSourcePreviewLines(
  content: string,
  path: string,
  highlight: SourceHighlightFn,
  highlightAuto?: (code: string) => string
): string[] {
  return splitHighlightedHtmlLines(highlightSourceCode(content, path, highlight, highlightAuto))
}

export interface UnifiedDiffLineWithHtml extends UnifiedDiffLine {
  html?: string
}

export function buildUnifiedDisplayLines(
  diff: string,
  path: string,
  highlight: (code: string, language: string) => string
): UnifiedDiffLineWithHtml[] {
  const language = languageFromPath(path)
  const parsed = parseUnifiedDiffLines(diff)

  return parsed.map((line) => {
    if (line.kind === 'added' || line.kind === 'removed' || line.kind === 'context') {
      const content = line.text.slice(1)
      return {
        ...line,
        html: content ? highlight(content, language) : ''
      }
    }
    return line
  })
}
