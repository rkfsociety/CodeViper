import { readdir, readFile, stat } from 'fs/promises'
import { join, relative, resolve, sep } from 'path'
import { FILE_SIZE_LIMIT_BYTES } from '../../shared/constants'

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'release',
  'dist-electron',
  '.next',
  '__pycache__',
  '.venv',
  'venv',
  '.vitest-tmp'
])

export const MAX_WALK_FILES = 800
export const MAX_GREP_RESULTS = 60
export const MAX_FIND_RESULTS = 80
const MAX_GREP_FILE_BYTES = FILE_SIZE_LIMIT_BYTES

export interface GrepMatch {
  path: string
  line: number
  text: string
}

export interface GrepResult {
  matches: GrepMatch[]
  truncated: boolean
  filesScanned: number
  skippedLargeFiles: string[]
}

function compileLineMatcher(query: string): (line: string) => boolean {
  const trimmed = query.trim()
  if (!trimmed) return () => false

  const slash = trimmed.match(/^\/(.+)\/([a-z]*)$/i)
  if (slash) {
    try {
      const regex = new RegExp(slash[1], slash[2].includes('i') ? 'i' : undefined)
      return (line) => regex.test(line)
    } catch {
      // fallback to literal
    }
  }

  const lower = trimmed.toLowerCase()
  return (line) => line.toLowerCase().includes(lower)
}

function matchFileName(name: string, pattern: string): boolean {
  const p = pattern.trim()
  if (!p) return false

  if (p.includes('*') || p.includes('?')) {
    const escaped = p
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '§§')
      .replace(/\*/g, '[^/\\\\]*')
      .replace(/§§/g, '.*')
      .replace(/\?/g, '.')
    try {
      return new RegExp(`^${escaped}$`, 'i').test(name)
    } catch {
      return name.toLowerCase().includes(p.toLowerCase())
    }
  }

  return name.toLowerCase().includes(p.toLowerCase())
}

async function walkProjectFiles(
  startDir: string,
  onFile: (absolutePath: string) => Promise<boolean | void>,
  onProgress?: (scanned: number) => void
): Promise<number> {
  let visited = 0

  async function walk(dir: string): Promise<boolean> {
    if (visited >= MAX_WALK_FILES) return true

    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return false
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (visited >= MAX_WALK_FILES) return true
      if (entry.name.startsWith('.') && entry.name !== '.codeviper') continue
      if (IGNORED_DIRS.has(entry.name)) continue

      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        const stop = await walk(fullPath)
        if (stop) return true
        continue
      }

      if (!entry.isFile()) continue
      visited += 1
      // Сообщаем о прогрессе нечасто, чтобы не спамить IPC.
      if (onProgress && visited % 25 === 0) onProgress(visited)
      const stop = await onFile(fullPath)
      if (stop) return true
    }

    return false
  }

  await walk(startDir)
  return visited
}

export async function grepInTree(
  root: string,
  query: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<GrepResult> {
  const startDir = options?.subpath?.trim() ? resolve(options.subpath) : resolve(root)
  const maxResults = options?.maxResults ?? MAX_GREP_RESULTS
  const matcher = compileLineMatcher(query)
  const matches: GrepMatch[] = []
  const skippedLargeFiles: string[] = []
  let truncated = false

  const filesScanned = await walkProjectFiles(
    startDir,
    async (filePath) => {
      if (matches.length >= maxResults) {
        truncated = true
        return true
      }

      let info
      try {
        info = await stat(filePath)
      } catch {
        return false
      }
      if (!info.isFile()) return false
      if (info.size > MAX_GREP_FILE_BYTES) {
        skippedLargeFiles.push(filePath)
        return false
      }

      let content: string
      try {
        content = await readFile(filePath, 'utf-8')
      } catch {
        return false
      }
      if (content.includes('\0')) return false

      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (!matcher(lines[i])) continue
        matches.push({
          path: filePath,
          line: i + 1,
          text: lines[i].trimEnd().slice(0, 240)
        })
        if (matches.length >= maxResults) {
          truncated = true
          return true
        }
      }

      return false
    },
    options?.onProgress
  )

  return { matches, truncated, filesScanned, skippedLargeFiles }
}

export async function grepMultiInTree(
  root: string,
  queries: string[],
  maxResultsPerQuery: number[],
  options?: { subpath?: string; onProgress?: (scanned: number) => void }
): Promise<GrepResult[]> {
  const startDir = options?.subpath?.trim() ? resolve(options.subpath) : resolve(root)
  const matchers = queries.map(compileLineMatcher)
  const results: GrepResult[] = queries.map(() => ({
    matches: [],
    truncated: false,
    filesScanned: 0,
    skippedLargeFiles: []
  }))

  const filesScanned = await walkProjectFiles(
    startDir,
    async (filePath) => {
      if (results.every((r, i) => r.matches.length >= maxResultsPerQuery[i])) {
        results.forEach((r) => {
          r.truncated = true
        })
        return true
      }

      let info
      try {
        info = await stat(filePath)
      } catch {
        return false
      }
      if (!info.isFile()) return false
      if (info.size > MAX_GREP_FILE_BYTES) {
        results.forEach((r) => r.skippedLargeFiles.push(filePath))
        return false
      }

      let content: string
      try {
        content = await readFile(filePath, 'utf-8')
      } catch {
        return false
      }
      if (content.includes('\0')) return false

      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        for (let qi = 0; qi < matchers.length; qi++) {
          const r = results[qi]
          if (r.matches.length >= maxResultsPerQuery[qi]) continue
          if (!matchers[qi](lines[i])) continue
          r.matches.push({ path: filePath, line: i + 1, text: lines[i].trimEnd().slice(0, 240) })
          if (r.matches.length >= maxResultsPerQuery[qi]) r.truncated = true
        }
      }

      return false
    },
    options?.onProgress
  )

  results.forEach((r) => {
    r.filesScanned = filesScanned
  })
  return results
}

export function formatGrepResults(
  root: string,
  query: string,
  result: {
    matches: GrepMatch[]
    truncated: boolean
    filesScanned: number
    skippedLargeFiles: string[]
  }
): string {
  const skippedNote =
    result.skippedLargeFiles.length > 0
      ? `\nПропущено (>512KB): ${result.skippedLargeFiles.map((f) => relative(root, f).split(sep).join('/')).join(', ')} — используй search_in_file для поиска внутри них`
      : ''

  if (!result.matches.length) {
    return `Совпадений не найдено (просмотрено файлов: ${result.filesScanned}).${skippedNote}`
  }

  const lines = result.matches.map((match) => {
    const rel = relative(root, match.path).split(sep).join('/')
    return `${rel}:${match.line}: ${match.text}`
  })

  const header = `Найдено: ${result.matches.length}${result.truncated ? '+' : ''} (файлов просмотрено: ${result.filesScanned})`
  return `${header}\nЗапрос: ${query}\n\n${lines.join('\n')}${skippedNote}`
}

export async function findFilesInTree(
  root: string,
  pattern: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<{ paths: string[]; truncated: boolean; filesScanned: number }> {
  const startDir = options?.subpath?.trim() ? resolve(options.subpath) : resolve(root)
  const maxResults = options?.maxResults ?? MAX_FIND_RESULTS
  const paths: string[] = []
  let truncated = false

  const filesScanned = await walkProjectFiles(
    startDir,
    async (filePath) => {
      const name = filePath.split(sep).pop() ?? filePath
      const rel = relative(root, filePath).split(sep).join('/')
      if (!matchFileName(name, pattern) && !matchFileName(rel, pattern)) return false

      paths.push(filePath)
      if (paths.length >= maxResults) {
        truncated = true
        return true
      }
      return false
    },
    options?.onProgress
  )

  return { paths, truncated, filesScanned }
}

export async function findMultiInTree(
  root: string,
  patterns: string[],
  maxResultsPerPattern: number[],
  options?: { subpath?: string; onProgress?: (scanned: number) => void }
): Promise<{ paths: string[]; truncated: boolean; filesScanned: number }[]> {
  const startDir = options?.subpath?.trim() ? resolve(options.subpath) : resolve(root)
  const results = patterns.map(() => ({ paths: [] as string[], truncated: false, filesScanned: 0 }))

  const filesScanned = await walkProjectFiles(
    startDir,
    async (filePath) => {
      if (results.every((r, i) => r.paths.length >= maxResultsPerPattern[i])) {
        results.forEach((r) => {
          r.truncated = true
        })
        return true
      }
      const name = filePath.split(sep).pop() ?? filePath
      const rel = relative(root, filePath).split(sep).join('/')
      for (let i = 0; i < patterns.length; i++) {
        const r = results[i]
        if (r.paths.length >= maxResultsPerPattern[i]) continue
        if (matchFileName(name, patterns[i]) || matchFileName(rel, patterns[i])) {
          r.paths.push(filePath)
          if (r.paths.length >= maxResultsPerPattern[i]) r.truncated = true
        }
      }
      return false
    },
    options?.onProgress
  )

  results.forEach((r) => {
    r.filesScanned = filesScanned
  })
  return results
}

export function formatFindResults(
  root: string,
  pattern: string,
  result: { paths: string[]; truncated: boolean; filesScanned: number }
): string {
  if (!result.paths.length) {
    return `Файлы не найдены (просмотрено: ${result.filesScanned}).`
  }

  const lines = result.paths.map((path) => relative(root, path).split(sep).join('/'))
  const header = `Найдено: ${result.paths.length}${result.truncated ? '+' : ''} (просмотрено файлов: ${result.filesScanned})`
  return `${header}\nШаблон: ${pattern}\n\n${lines.join('\n')}`
}
