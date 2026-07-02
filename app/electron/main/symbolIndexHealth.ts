import { readdir, readFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'
import { MAX_WALK_FILES } from './fileSearch'
import {
  collectIndexableSymbolLocations,
  findSymbolDeclarations,
  isIndexableFile,
  type SymbolLocation
} from './symbolIndex'

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

const INDEX_STORE_CANDIDATES = [
  '.codeviper/symbol-index.json',
  '.codeviper/symbol-index/index.json',
  'symbol-index.json'
]

type SymbolIndexStoreSymbol = {
  name: string
  kind?: string
}

type SymbolIndexStoreEntry = {
  path: string
  mtimeMs?: number
  symbols?: SymbolIndexStoreSymbol[]
}

type SymbolIndexStore = {
  files?:
    | SymbolIndexStoreEntry[]
    | Record<string, { mtimeMs?: number; symbols?: SymbolIndexStoreSymbol[] }>
  entries?:
    | SymbolIndexStoreEntry[]
    | Record<string, { mtimeMs?: number; symbols?: SymbolIndexStoreSymbol[] }>
  generatedAt?: string
}

export type SymbolIndexHealthIssueScope = 'static' | 'runtime' | 'smoke'
export type SymbolIndexHealthIssueType = 'missing-index' | 'stale-entry' | 'smoke-failed'

export interface SymbolIndexHealthIssue {
  scope: SymbolIndexHealthIssueScope
  type: SymbolIndexHealthIssueType
  path?: string
  message: string
}

interface CurrentFileSnapshot {
  path: string
  mtimeMs: number
  symbols: SymbolLocation[]
}

function normalizeProjectPath(projectPath: string, rawPath: string): string {
  return rawPath.match(/^[A-Za-z]:[\\/]|^\//) ? resolve(rawPath) : resolve(projectPath, rawPath)
}

function formatRelPath(projectPath: string, absPath: string): string {
  return relative(projectPath, absPath).replace(/\\/g, '/')
}

async function walkIndexableFiles(
  startDir: string,
  onFile: (absolutePath: string) => Promise<boolean | void>
): Promise<number> {
  try {
    const startInfo = await stat(startDir)
    if (startInfo.isFile()) {
      if (!isIndexableFile(startDir)) return 0
      await onFile(startDir)
      return 1
    }
  } catch {
    return 0
  }

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

      if (!entry.isFile() || !isIndexableFile(fullPath)) continue
      visited += 1
      const stop = await onFile(fullPath)
      if (stop) return true
    }

    return false
  }

  await walk(startDir)
  return visited
}

function normalizeStoreEntries(store: SymbolIndexStore | null): SymbolIndexStoreEntry[] {
  if (!store) return []

  const sections = [store.files, store.entries]
  const entries: SymbolIndexStoreEntry[] = []
  for (const section of sections) {
    if (!section) continue
    if (Array.isArray(section)) {
      for (const entry of section) {
        if (entry?.path) entries.push(entry)
      }
      continue
    }

    for (const [path, entry] of Object.entries(section)) {
      entries.push({ path, ...entry })
    }
  }

  return entries
}

async function readIndexStore(projectPath: string): Promise<SymbolIndexStoreEntry[] | null> {
  for (const candidate of INDEX_STORE_CANDIDATES) {
    const abs = resolve(projectPath, candidate)
    if (!existsSync(abs)) continue
    try {
      const raw = await readFile(abs, 'utf8')
      const parsed = JSON.parse(raw) as SymbolIndexStore
      const entries = normalizeStoreEntries(parsed)
      if (entries.length) return entries
      return []
    } catch {
      return []
    }
  }

  return null
}

function pickSmokeCandidate(
  files: CurrentFileSnapshot[]
): { file: CurrentFileSnapshot; symbol: SymbolLocation } | null {
  const candidate = files.find((file) => file.symbols.length > 0)
  if (!candidate) return null
  return { file: candidate, symbol: candidate.symbols[0]! }
}

function pushIssue(
  issues: SymbolIndexHealthIssue[],
  scope: SymbolIndexHealthIssueScope,
  type: SymbolIndexHealthIssueType,
  message: string,
  path?: string
): void {
  issues.push({ scope, type, message, ...(path ? { path } : {}) })
}

async function readCurrentFileSnapshot(filePath: string): Promise<CurrentFileSnapshot | null> {
  if (!isIndexableFile(filePath)) return null

  let info
  try {
    info = await stat(filePath)
  } catch {
    return null
  }
  if (!info.isFile()) return null

  let content = ''
  try {
    content = await readFile(filePath, 'utf8')
  } catch {
    return null
  }
  if (content.includes('\0')) return null

  return {
    path: filePath,
    mtimeMs: info.mtimeMs,
    symbols: collectIndexableSymbolLocations(filePath, content)
  }
}

function formatIssues(
  projectPath: string,
  issues: SymbolIndexHealthIssue[],
  smokeLine?: string
): string {
  if (!issues.length) {
    return [
      'find_symbol_index_issues(): символьный индекс синхронизирован.',
      smokeLine ? `Smoke: ${smokeLine}` : 'Smoke: нет подходящего символа для проверки.'
    ].join('\n')
  }

  return [
    `find_symbol_index_issues(): найдено ${issues.length} проблем symbol index:`,
    ...issues.map((issue, index) => {
      const rel = issue.path ? formatRelPath(projectPath, issue.path) : '(без path)'
      return `[${index + 1}] [${issue.scope}/${issue.type}] ${rel}\n    ${issue.message}`
    }),
    smokeLine ? `\nSmoke: ${smokeLine}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

export async function findSymbolIndexIssues(
  projectPath: string,
  options: { path?: string } = {}
): Promise<string> {
  const startDir = options.path?.trim()
    ? normalizeProjectPath(projectPath, options.path.trim())
    : resolve(projectPath)

  const currentFiles: CurrentFileSnapshot[] = []
  const issues: SymbolIndexHealthIssue[] = []

  let startInfo
  try {
    startInfo = await stat(startDir)
  } catch {
    startInfo = null
  }

  const filesScanned = startInfo?.isFile()
    ? await (async () => {
        const snapshot = await readCurrentFileSnapshot(startDir)
        if (snapshot) currentFiles.push(snapshot)
        return snapshot ? 1 : 0
      })()
    : await walkIndexableFiles(startDir, async (filePath) => {
        const snapshot = await readCurrentFileSnapshot(filePath)
        if (snapshot) currentFiles.push(snapshot)
        return false
      })

  const storeEntries = await readIndexStore(projectPath)
  const storeByPath = new Map<string, SymbolIndexStoreEntry>()
  if (storeEntries) {
    for (const entry of storeEntries) {
      storeByPath.set(resolve(projectPath, entry.path), entry)
    }
  }

  for (const file of currentFiles) {
    const storeEntry = storeEntries ? storeByPath.get(file.path) : undefined
    if (!file.symbols.length) {
      pushIssue(
        issues,
        'static',
        'missing-index',
        'Файл не дал ни одного символьного объявления для индекса.',
        file.path
      )
      continue
    }

    if (!storeEntries) continue

    if (!storeEntry) {
      pushIssue(
        issues,
        'runtime',
        'missing-index',
        'Файл есть на диске, но в runtime index store для него нет записи.',
        file.path
      )
      continue
    }

    if (typeof storeEntry.mtimeMs === 'number' && file.mtimeMs > storeEntry.mtimeMs + 1) {
      pushIssue(
        issues,
        'runtime',
        'stale-entry',
        `mtime файла новее записи индекса на ${Math.round(file.mtimeMs - storeEntry.mtimeMs)} ms.`,
        file.path
      )
    }

    if (!storeEntry.symbols?.length) {
      pushIssue(
        issues,
        'runtime',
        'missing-index',
        'В runtime index store запись есть, но список символов пуст.',
        file.path
      )
    }
  }

  if (storeEntries) {
    for (const entry of storeEntries) {
      const abs = resolve(projectPath, entry.path)
      const current = currentFiles.find((file) => file.path === abs)
      if (current) continue
      pushIssue(
        issues,
        'runtime',
        'stale-entry',
        'Запись есть в index store, но файла уже нет или он вне текущего обхода.',
        abs
      )
    }
  }

  let smokeLine: string | undefined
  const smokeCandidate = pickSmokeCandidate(currentFiles)
  if (smokeCandidate) {
    const smokeSubpath =
      startInfo?.isFile() && options.path?.trim()
        ? relative(projectPath, dirname(startDir)).replace(/\\/g, '/')
        : options.path?.trim() || undefined
    const smoke = await findSymbolDeclarations(projectPath, smokeCandidate.symbol.name, {
      subpath: smokeSubpath,
      maxResults: 10
    })
    const hit = smoke.symbols.find(
      (item) =>
        item.path === smokeCandidate.file.path &&
        item.name === smokeCandidate.symbol.name &&
        item.line === smokeCandidate.symbol.line
    )
    if (hit) {
      smokeLine = `find_symbol("${smokeCandidate.symbol.name}") -> ${formatRelPath(
        projectPath,
        hit.path
      )}:${hit.line}:${hit.column}`
    } else {
      pushIssue(
        issues,
        'smoke',
        'smoke-failed',
        `find_symbol("${smokeCandidate.symbol.name}") не вернул ожидаемый файл.`,
        smokeCandidate.file.path
      )
      smokeLine = `find_symbol("${smokeCandidate.symbol.name}") -> failed`
    }
  }

  const prefix = options.path?.trim() ? ` (scope: ${formatRelPath(projectPath, startDir)})` : ''
  const header = `find_symbol_index_issues(): просмотрено файлов: ${filesScanned}${prefix}`
  const body = formatIssues(projectPath, issues, smokeLine)
  return `${header}\n${body}`
}
