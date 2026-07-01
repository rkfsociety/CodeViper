import { relative, sep } from 'path'
import { grepInTree } from './fileSearch'

const MERGE_MARKER_PATTERN = '/^(<<<<<<<|=======|>>>>>>>)/'
const MERGE_MARKER_RE = /^(<<<<<<<|=======|>>>>>>>)/

export interface MergeConflictMatch {
  path: string
  line: number
  marker: string
}

export interface MergeConflictSearchResult {
  matches: MergeConflictMatch[]
  truncated: boolean
  filesScanned: number
}

export async function findMergeConflicts(
  root: string,
  options?: { subpath?: string; onProgress?: (scanned: number) => void }
): Promise<MergeConflictSearchResult> {
  const result = await grepInTree(root, MERGE_MARKER_PATTERN, {
    subpath: options?.subpath,
    maxResults: 200,
    onProgress: options?.onProgress
  })

  const matches: MergeConflictMatch[] = result.matches.map((match) => {
    const marker = match.text.match(MERGE_MARKER_RE)?.[1] ?? match.text.trim().slice(0, 7)
    return {
      path: match.path,
      line: match.line,
      marker
    }
  })

  return {
    matches,
    truncated: result.truncated,
    filesScanned: result.filesScanned
  }
}

export function formatMergeConflictReport(
  projectPath: string,
  result: MergeConflictSearchResult
): string {
  if (!result.matches.length) {
    return `find_merge_conflicts: маркеры merge-конфликта (<<<<<<<, =======, >>>>>>>) не найдено (просмотрено файлов: ${result.filesScanned}).`
  }

  const lines = result.matches.map((item, index) => {
    const rel = relative(projectPath, item.path).split(sep).join('/')
    return `[${index + 1}] ${rel}:${item.line}`
  })

  const header = `find_merge_conflicts: найдено маркеров ${result.matches.length}${result.truncated ? '+' : ''}`
  const footer = `\n\n(Просмотрено файлов: ${result.filesScanned})`
  return `${header}\n${lines.join('\n')}${footer}`
}
