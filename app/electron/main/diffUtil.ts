/** Minimal LCS-based unified diff (line level). No external deps. */

type Op = '=' | '+' | '-'
interface Edit {
  op: Op
  line: string
}

const CHECK_ABORT_EVERY = 500

function computeEdits(oldLines: string[], newLines: string[], signal?: AbortSignal): Edit[] {
  const m = oldLines.length
  const n = newLines.length

  // DP table for LCS lengths — capped to avoid huge memory on large files
  const MAX = 800
  const mo = Math.min(m, MAX)
  const no = Math.min(n, MAX)

  const dp: Uint16Array[] = Array.from({ length: mo + 1 }, () => new Uint16Array(no + 1))
  let iters = 0
  for (let i = 1; i <= mo; i++) {
    for (let j = 1; j <= no; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1
      else dp[i][j] = dp[i - 1][j] > dp[i][j - 1] ? dp[i - 1][j] : dp[i][j - 1]

      if (++iters % CHECK_ABORT_EVERY === 0 && signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
    }
  }

  const edits: Edit[] = []
  let i = mo
  let j = no
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      edits.unshift({ op: '=', line: oldLines[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.unshift({ op: '+', line: newLines[j - 1] })
      j--
    } else {
      edits.unshift({ op: '-', line: oldLines[i - 1] })
      i--
    }
  }

  // If files were truncated, mark tail lines as deleted/added
  if (m > MAX) {
    for (let k = MAX; k < m; k++) edits.push({ op: '-', line: oldLines[k] })
  }
  if (n > MAX) {
    for (let k = MAX; k < n; k++) edits.push({ op: '+', line: newLines[k] })
  }

  return edits
}

/** Простой построчный diff без LCS — O(n) по памяти, используется как fallback. */
function computeEditsLinear(oldLines: string[], newLines: string[]): Edit[] {
  const edits: Edit[] = []
  for (const line of oldLines) edits.push({ op: '-', line })
  for (const line of newLines) edits.push({ op: '+', line })
  return edits
}

export function createUnifiedDiff(
  oldText: string,
  newText: string,
  filePath: string,
  contextLines = 3,
  signal?: AbortSignal
): string {
  if (oldText === newText) return ''

  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  let edits: Edit[]
  try {
    edits = computeEdits(oldLines, newLines, signal)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      edits = computeEditsLinear(oldLines, newLines)
    } else {
      throw e
    }
  }

  // Build hunks: find ranges of non-equal edits with context
  interface Hunk {
    oldStart: number
    newStart: number
    lines: string[]
  }

  const hunks: Hunk[] = []
  let currentHunk: Hunk | null = null

  // Track line numbers for each edit position
  const positioned: Array<{ edit: Edit; oldLine: number; newLine: number }> = []
  let ol = 1
  let nl = 1
  for (const edit of edits) {
    positioned.push({ edit, oldLine: ol, newLine: nl })
    if (edit.op === '=' || edit.op === '-') ol++
    if (edit.op === '=' || edit.op === '+') nl++
  }

  for (let idx = 0; idx < positioned.length; idx++) {
    const { edit } = positioned[idx]
    if (edit.op === '=') {
      if (currentHunk) currentHunk.lines.push(` ${edit.line}`)
      continue
    }
    // Changed line — open or extend hunk
    if (!currentHunk) {
      // Include context before
      const contextStart = Math.max(0, idx - contextLines)
      const hunkOldStart = positioned[contextStart].oldLine
      const hunkNewStart = positioned[contextStart].newLine
      currentHunk = { oldStart: hunkOldStart, newStart: hunkNewStart, lines: [] }
      for (let c = contextStart; c < idx; c++) {
        currentHunk.lines.push(` ${positioned[c].edit.line}`)
      }
      hunks.push(currentHunk)
    }

    currentHunk.lines.push(`${edit.op === '+' ? '+' : '-'}${edit.line}`)

    // Look ahead: if next contextLines are all '=', close hunk
    const nextChangedOffset = positioned.slice(idx + 1).findIndex((p) => p.edit.op !== '=')
    if (nextChangedOffset === -1 || nextChangedOffset >= contextLines * 2) {
      const tailEnd = Math.min(idx + contextLines + 1, positioned.length)
      for (let t = idx + 1; t < tailEnd; t++) {
        if (positioned[t].edit.op === '=') currentHunk.lines.push(` ${positioned[t].edit.line}`)
      }
      currentHunk = null
    }
  }

  if (!hunks.length) return ''

  // Format
  let output = `--- a/${filePath}\n+++ b/${filePath}\n`
  for (const hunk of hunks) {
    const oldCount = hunk.lines.filter((l) => l[0] !== '+').length
    const newCount = hunk.lines.filter((l) => l[0] !== '-').length
    output += `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@\n`
    output += hunk.lines.map((l) => l + '\n').join('')
  }

  return output
}
