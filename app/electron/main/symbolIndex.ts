import { readFile, readdir, stat } from 'fs/promises'
import { dirname, extname, join, relative, resolve } from 'path'
import { createRequire } from 'module'
import type * as Ts from 'typescript'
import { MAX_WALK_FILES } from './fileSearch'

const nodeRequire = createRequire(import.meta.url)
let typescriptModule: typeof import('typescript') | undefined

function getTs(): typeof import('typescript') {
  if (!typescriptModule) {
    typescriptModule = nodeRequire('typescript') as typeof import('typescript')
  }
  return typescriptModule
}

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

const TS_JS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'])
const PY_EXTENSIONS = new Set(['.py', '.pyw'])

export const MAX_SYMBOL_RESULTS = 40
export const MAX_IMPORT_CYCLES = 20

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']
const INDEX_FILENAMES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs']

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'variable'
  | 'interface'
  | 'type'
  | 'enum'
  | 'module'

export interface SymbolLocation {
  path: string
  line: number
  column: number
  kind: SymbolKind
  name: string
}

export interface SymbolSearchResult {
  symbols: SymbolLocation[]
  truncated: boolean
  filesScanned: number
}

function scriptKindForExt(ext: string): Ts.ScriptKind {
  const ts = getTs()
  switch (ext) {
    case '.tsx':
      return ts.ScriptKind.TSX
    case '.ts':
    case '.mts':
    case '.cts':
      return ts.ScriptKind.TS
    case '.jsx':
      return ts.ScriptKind.JSX
    default:
      return ts.ScriptKind.JS
  }
}

function positionOf(sourceFile: Ts.SourceFile, node: Ts.Node): { line: number; column: number } {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile, false))
  return { line: pos.line + 1, column: pos.character + 1 }
}

function pushDeclaration(
  out: SymbolLocation[],
  filePath: string,
  nameNode: Ts.Identifier,
  sourceFile: Ts.SourceFile,
  kind: SymbolKind,
  symbolName: string
): void {
  const pos = positionOf(sourceFile, nameNode)
  out.push({
    path: filePath,
    line: pos.line,
    column: pos.column,
    kind,
    name: symbolName
  })
}

function collectTsDeclarations(
  sourceFile: Ts.SourceFile,
  symbolName: string,
  filePath: string,
  out: SymbolLocation[]
): void {
  const ts = getTs()
  function visit(node: Ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name?.text === symbolName) {
      pushDeclaration(out, filePath, node.name, sourceFile, 'function', symbolName)
    } else if (ts.isClassDeclaration(node) && node.name?.text === symbolName) {
      pushDeclaration(out, filePath, node.name, sourceFile, 'class', symbolName)
    } else if (ts.isInterfaceDeclaration(node) && node.name.text === symbolName) {
      pushDeclaration(out, filePath, node.name, sourceFile, 'interface', symbolName)
    } else if (ts.isTypeAliasDeclaration(node) && node.name.text === symbolName) {
      pushDeclaration(out, filePath, node.name, sourceFile, 'type', symbolName)
    } else if (ts.isEnumDeclaration(node) && node.name.text === symbolName) {
      pushDeclaration(out, filePath, node.name, sourceFile, 'enum', symbolName)
    } else if (
      ts.isMethodDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === symbolName
    ) {
      pushDeclaration(out, filePath, node.name, sourceFile, 'method', symbolName)
    } else if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || decl.name.text !== symbolName) continue
        const isFn =
          decl.initializer != null &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        pushDeclaration(
          out,
          filePath,
          decl.name,
          sourceFile,
          isFn ? 'function' : 'variable',
          symbolName
        )
      }
    } else if (
      ts.isModuleDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === symbolName
    ) {
      pushDeclaration(out, filePath, node.name, sourceFile, 'module', symbolName)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

function collectTsReferences(
  sourceFile: Ts.SourceFile,
  symbolName: string,
  filePath: string,
  out: SymbolLocation[]
): void {
  const ts = getTs()
  function visit(node: Ts.Node): void {
    if (ts.isIdentifier(node) && node.text === symbolName) {
      const pos = positionOf(sourceFile, node)
      out.push({
        path: filePath,
        line: pos.line,
        column: pos.column,
        kind: 'variable',
        name: symbolName
      })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

const PY_DEF = /^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/
const PY_CLASS = /^class\s+([A-Za-z_]\w*)\s*(?:\(|:)/

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function collectPyDeclarations(
  content: string,
  symbolName: string,
  filePath: string,
  out: SymbolLocation[]
) {
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const defMatch = line.match(PY_DEF)
    if (defMatch?.[1] === symbolName) {
      const col = line.indexOf(defMatch[1]) + 1
      out.push({ path: filePath, line: i + 1, column: col, kind: 'function', name: symbolName })
      continue
    }
    const classMatch = line.match(PY_CLASS)
    if (classMatch?.[1] === symbolName) {
      const col = line.indexOf(classMatch[1]) + 1
      out.push({ path: filePath, line: i + 1, column: col, kind: 'class', name: symbolName })
    }
  }
}

function collectPyReferences(
  content: string,
  symbolName: string,
  filePath: string,
  out: SymbolLocation[]
) {
  const regex = new RegExp(`\\b${escapeRegex(symbolName)}\\b`, 'g')
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let match: RegExpExecArray | null
    regex.lastIndex = 0
    while ((match = regex.exec(line)) !== null) {
      out.push({
        path: filePath,
        line: i + 1,
        column: match.index + 1,
        kind: 'variable',
        name: symbolName
      })
    }
  }
}

function isIndexableFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return TS_JS_EXTENSIONS.has(ext) || PY_EXTENSIONS.has(ext)
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

      if (!entry.isFile() || !isIndexableFile(fullPath)) continue
      visited += 1
      if (onProgress && visited % 25 === 0) onProgress(visited)
      const stop = await onFile(fullPath)
      if (stop) return true
    }

    return false
  }

  await walk(startDir)
  return visited
}

async function indexFile(
  filePath: string,
  symbolName: string,
  mode: 'declaration' | 'reference'
): Promise<SymbolLocation[]> {
  let info
  try {
    info = await stat(filePath)
  } catch {
    return []
  }
  if (!info.isFile()) return []

  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    return []
  }
  if (content.includes('\0')) return []

  const ext = extname(filePath).toLowerCase()
  const out: SymbolLocation[] = []

  if (TS_JS_EXTENSIONS.has(ext)) {
    const ts = getTs()
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForExt(ext)
    )
    if (mode === 'declaration') {
      collectTsDeclarations(sourceFile, symbolName, filePath, out)
    } else {
      collectTsReferences(sourceFile, symbolName, filePath, out)
    }
    return out
  }

  if (PY_EXTENSIONS.has(ext)) {
    if (mode === 'declaration') {
      collectPyDeclarations(content, symbolName, filePath, out)
    } else {
      collectPyReferences(content, symbolName, filePath, out)
    }
  }

  return out
}

async function searchSymbols(
  projectPath: string,
  symbolName: string,
  mode: 'declaration' | 'reference',
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<SymbolSearchResult> {
  const trimmed = symbolName.trim()
  if (!trimmed) return { symbols: [], truncated: false, filesScanned: 0 }

  const startDir = options?.subpath?.trim()
    ? resolve(projectPath, options.subpath.trim())
    : resolve(projectPath)
  const maxResults = options?.maxResults ?? MAX_SYMBOL_RESULTS
  const symbols: SymbolLocation[] = []
  let truncated = false

  const filesScanned = await walkProjectFiles(
    startDir,
    async (filePath) => {
      if (symbols.length >= maxResults) {
        truncated = true
        return true
      }

      const found = await indexFile(filePath, trimmed, mode)
      for (const item of found) {
        symbols.push(item)
        if (symbols.length >= maxResults) {
          truncated = true
          return true
        }
      }
      return false
    },
    options?.onProgress
  )

  return { symbols, truncated, filesScanned }
}

export function formatSymbolResults(
  projectPath: string,
  symbolName: string,
  result: SymbolSearchResult,
  mode: 'declaration' | 'reference'
): string {
  if (!result.symbols.length) {
    return mode === 'declaration'
      ? `Объявление «${symbolName}» не найдено (просмотрено файлов: ${result.filesScanned})`
      : `Ссылки на «${symbolName}» не найдены (просмотрено файлов: ${result.filesScanned})`
  }

  const header =
    mode === 'declaration'
      ? `Объявления «${symbolName}» (${result.symbols.length}${result.truncated ? '+' : ''}):`
      : `Ссылки на «${symbolName}» (${result.symbols.length}${result.truncated ? '+' : ''}):`

  const lines = result.symbols.map((item, i) => {
    const rel = relative(projectPath, item.path).replace(/\\/g, '/')
    return `[${i + 1}] ${rel}:${item.line}:${item.column}  ${item.kind}  ${item.name}`
  })

  const footer = result.truncated
    ? `\n\n(результаты обрезаны; просмотрено файлов: ${result.filesScanned})`
    : `\n\n(просмотрено файлов: ${result.filesScanned})`

  return `${header}\n${lines.join('\n')}${footer}`
}

export async function findSymbolDeclarations(
  projectPath: string,
  symbolName: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<SymbolSearchResult> {
  return searchSymbols(projectPath, symbolName, 'declaration', options)
}

export async function findSymbolReferences(
  projectPath: string,
  symbolName: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<SymbolSearchResult> {
  return searchSymbols(projectPath, symbolName, 'reference', options)
}

export interface ImportCycle {
  chain: string[]
}

export interface ImportCycleResult {
  cycles: ImportCycle[]
  truncated: boolean
  filesScanned: number
}

function collectTsImportSpecifiers(sourceFile: Ts.SourceFile): string[] {
  const ts = getTs()
  const specifiers: string[] = []

  function visit(node: Ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.Identifier &&
      (node.expression as Ts.Identifier).text === 'require' &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return specifiers
}

async function resolveImportPath(
  fromFile: string,
  specifier: string,
  projectRoot: string
): Promise<string | null> {
  if (!specifier.startsWith('.')) return null

  const root = resolve(projectRoot)
  const base = resolve(dirname(fromFile), specifier)
  const candidates: string[] = [base]

  for (const ext of RESOLVE_EXTENSIONS) {
    candidates.push(`${base}${ext}`)
  }
  for (const indexName of INDEX_FILENAMES) {
    candidates.push(join(base, indexName))
  }

  for (const candidate of candidates) {
    const normalized = resolve(candidate)
    if (!normalized.startsWith(root)) continue
    try {
      const info = await stat(normalized)
      if (info.isFile()) return normalized
    } catch {
      // try next candidate
    }
  }

  return null
}

async function collectFileImports(filePath: string, projectRoot: string): Promise<string[]> {
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    return []
  }
  if (content.includes('\0')) return []

  const ext = extname(filePath).toLowerCase()
  if (!TS_JS_EXTENSIONS.has(ext)) return []

  const ts = getTs()
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForExt(ext)
  )
  const specifiers = collectTsImportSpecifiers(sourceFile)
  const resolved: string[] = []

  for (const specifier of specifiers) {
    const target = await resolveImportPath(filePath, specifier, projectRoot)
    if (target) resolved.push(target)
  }

  return resolved
}

function normalizeCycleKey(chain: string[]): string {
  if (!chain.length) return ''
  let start = 0
  for (let i = 1; i < chain.length; i++) {
    if (chain[i] < chain[start]) start = i
  }
  const rotated = [...chain.slice(start), ...chain.slice(0, start)]
  return rotated.join('\0')
}

function findCyclesInGraph(
  graph: Map<string, string[]>,
  maxCycles: number
): { cycles: string[][]; truncated: boolean } {
  const cycles: string[][] = []
  const seen = new Set<string>()
  let truncated = false

  function dfs(node: string, stack: string[], stackSet: Set<string>): void {
    if (truncated) return
    if (stackSet.has(node)) {
      const idx = stack.indexOf(node)
      if (idx >= 0) {
        const chain = stack.slice(idx)
        if (chain.length > 1) {
          const key = normalizeCycleKey(chain)
          if (!seen.has(key)) {
            seen.add(key)
            cycles.push(chain)
            if (cycles.length >= maxCycles) truncated = true
          }
        }
      }
      return
    }

    stackSet.add(node)
    stack.push(node)
    for (const next of graph.get(node) ?? []) {
      dfs(next, stack, stackSet)
      if (truncated) break
    }
    stack.pop()
    stackSet.delete(node)
  }

  for (const node of [...graph.keys()].sort()) {
    dfs(node, [], new Set())
    if (truncated) break
  }

  return { cycles, truncated }
}

export function formatImportCycles(projectPath: string, result: ImportCycleResult): string {
  if (!result.cycles.length) {
    return `Циклических импортов не найдено (просмотрено файлов: ${result.filesScanned})`
  }

  const lines = result.cycles.map((cycle, index) => {
    const chain = cycle.chain
      .map((item) => relative(projectPath, item).replace(/\\/g, '/'))
      .join(' → ')
    return `[${index + 1}] ${chain}`
  })

  const footer = result.truncated
    ? `\n\n(результаты обрезаны; просмотрено файлов: ${result.filesScanned})`
    : `\n\n(просмотрено файлов: ${result.filesScanned})`

  return `Найдено циклов импорта: ${result.cycles.length}${result.truncated ? '+' : ''}\n${lines.join('\n')}${footer}`
}

export async function findImportCycles(
  projectPath: string,
  options?: { subpath?: string; maxCycles?: number; onProgress?: (scanned: number) => void }
): Promise<ImportCycleResult> {
  const startDir = options?.subpath?.trim()
    ? resolve(projectPath, options.subpath.trim())
    : resolve(projectPath)
  const maxCycles = options?.maxCycles ?? MAX_IMPORT_CYCLES
  const graph = new Map<string, string[]>()
  let filesScanned = 0

  await walkProjectFiles(
    startDir,
    async (filePath) => {
      filesScanned += 1
      const imports = await collectFileImports(filePath, projectPath)
      graph.set(filePath, imports)
      return false
    },
    options?.onProgress
  )

  const { cycles, truncated } = findCyclesInGraph(graph, maxCycles)
  return {
    cycles: cycles.map((chain) => ({ chain })),
    truncated,
    filesScanned
  }
}
