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

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
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
