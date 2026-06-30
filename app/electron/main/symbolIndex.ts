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
const CLASS_DIAGRAM_EXTENSIONS = new Set([...TS_JS_EXTENSIONS, '.java', '.cs'])

export const MAX_SYMBOL_RESULTS = 40
export const MAX_IMPORT_CYCLES = 20
export const MAX_DEPENDENCY_NODES = 80
export const MAX_DEPENDENCY_EDGES = 150
export const MAX_CLASS_DIAGRAM_CLASSES = 60
export const MAX_CLASS_DIAGRAM_MEMBERS = 12
export const MAX_DATAFLOW_NODES = 60
export const MAX_DATAFLOW_EDGES = 120

const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']
const INDEX_FILENAMES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs']

export type SymbolKind =
  'function' | 'class' | 'method' | 'variable' | 'interface' | 'type' | 'enum' | 'module'

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

function isClassDiagramFile(filePath: string): boolean {
  return CLASS_DIAGRAM_EXTENSIONS.has(extname(filePath).toLowerCase())
}

async function walkProjectFiles(
  startDir: string,
  onFile: (absolutePath: string) => Promise<boolean | void>,
  onProgress?: (scanned: number) => void,
  fileFilter?: (filePath: string) => boolean
): Promise<number> {
  const acceptFile = fileFilter ?? isIndexableFile
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

      if (!entry.isFile() || !acceptFile(fullPath)) continue
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

export interface ImportGraphResult {
  graph: Map<string, string[]>
  filesScanned: number
}

export async function buildImportGraph(
  projectPath: string,
  options?: { subpath?: string; onProgress?: (scanned: number) => void }
): Promise<ImportGraphResult> {
  const startDir = options?.subpath?.trim()
    ? resolve(projectPath, options.subpath.trim())
    : resolve(projectPath)
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

  return { graph, filesScanned }
}

export interface DependencyDiagramResult {
  mermaid: string
  nodeCount: number
  edgeCount: number
  truncated: boolean
  filesScanned: number
}

function relModulePath(projectPath: string, absolutePath: string): string {
  return relative(projectPath, absolutePath).replace(/\\/g, '/')
}

function sanitizeMermaidLabel(label: string): string {
  return label.replace(/"/g, "'")
}

function toMermaidNodeId(index: number): string {
  return `N${index}`
}

function filterGraphByFocus(
  graph: Map<string, string[]>,
  focusFile: string
): Map<string, string[]> {
  const filtered = new Map<string, string[]>()
  const focusImports = graph.get(focusFile) ?? []
  const importers: string[] = []
  for (const [from, targets] of graph) {
    if (targets.includes(focusFile)) importers.push(from)
  }

  const keep = new Set<string>([focusFile, ...focusImports, ...importers])
  for (const node of keep) {
    const targets = (graph.get(node) ?? []).filter((target) => keep.has(target))
    if (targets.length || node === focusFile) filtered.set(node, targets)
  }
  return filtered
}

export function graphToMermaid(
  projectPath: string,
  graph: Map<string, string[]>,
  limits?: { maxNodes?: number; maxEdges?: number }
): Pick<DependencyDiagramResult, 'mermaid' | 'nodeCount' | 'edgeCount' | 'truncated'> {
  const maxNodes = limits?.maxNodes ?? MAX_DEPENDENCY_NODES
  const maxEdges = limits?.maxEdges ?? MAX_DEPENDENCY_EDGES
  const nodeIndex = new Map<string, number>()
  const edges: Array<[string, string]> = []
  let truncated = false

  const sortedSources = [...graph.keys()].sort()
  for (const from of sortedSources) {
    const targets = [...(graph.get(from) ?? [])].sort()
    for (const to of targets) {
      if (edges.length >= maxEdges) {
        truncated = true
        break
      }
      if (!nodeIndex.has(from)) {
        if (nodeIndex.size >= maxNodes) {
          truncated = true
          continue
        }
        nodeIndex.set(from, nodeIndex.size)
      }
      if (!nodeIndex.has(to)) {
        if (nodeIndex.size >= maxNodes) {
          truncated = true
          continue
        }
        nodeIndex.set(to, nodeIndex.size)
      }
      edges.push([from, to])
    }
    if (truncated) break
  }

  const lines = ['graph LR']
  const sortedNodes = [...nodeIndex.entries()].sort((a, b) => a[1] - b[1])
  for (const [path, idx] of sortedNodes) {
    lines.push(
      `  ${toMermaidNodeId(idx)}["${sanitizeMermaidLabel(relModulePath(projectPath, path))}"]`
    )
  }
  for (const [from, to] of edges) {
    const fromId = nodeIndex.get(from)
    const toId = nodeIndex.get(to)
    if (fromId == null || toId == null) continue
    lines.push(`  ${toMermaidNodeId(fromId)} --> ${toMermaidNodeId(toId)}`)
  }

  return {
    mermaid: lines.join('\n'),
    nodeCount: nodeIndex.size,
    edgeCount: edges.length,
    truncated
  }
}

export async function buildDependencyDiagram(
  projectPath: string,
  options?: {
    subpath?: string
    focus?: string
    maxNodes?: number
    maxEdges?: number
    onProgress?: (scanned: number) => void
  }
): Promise<DependencyDiagramResult> {
  const { graph: fullGraph, filesScanned } = await buildImportGraph(projectPath, {
    subpath: options?.subpath,
    onProgress: options?.onProgress
  })

  let graph = fullGraph
  const focus = options?.focus?.trim()
  if (focus) {
    const focusFile = resolve(projectPath, focus)
    graph = filterGraphByFocus(fullGraph, focusFile)
    if (!graph.size) {
      graph = new Map([[focusFile, fullGraph.get(focusFile) ?? []]])
    }
  }

  const diagram = graphToMermaid(projectPath, graph, {
    maxNodes: options?.maxNodes,
    maxEdges: options?.maxEdges
  })

  return { ...diagram, filesScanned }
}

export function formatDependencyDiagram(result: DependencyDiagramResult): string {
  if (!result.nodeCount) {
    return `Граф зависимостей пуст (просмотрено файлов: ${result.filesScanned})`
  }

  const header = `Граф зависимостей: ${result.nodeCount} модулей, ${result.edgeCount} связей${
    result.truncated ? ' (обрезано)' : ''
  }`

  return `${header}\n\n\`\`\`mermaid\n${result.mermaid}\n\`\`\`\n\n(просмотрено файлов: ${result.filesScanned})`
}

export async function findImportCycles(
  projectPath: string,
  options?: { subpath?: string; maxCycles?: number; onProgress?: (scanned: number) => void }
): Promise<ImportCycleResult> {
  const maxCycles = options?.maxCycles ?? MAX_IMPORT_CYCLES
  const { graph, filesScanned } = await buildImportGraph(projectPath, options)
  const { cycles, truncated } = findCyclesInGraph(graph, maxCycles)
  return {
    cycles: cycles.map((chain) => ({ chain })),
    truncated,
    filesScanned
  }
}

// ── Class diagram (TS / Java / C#) ───────────────────────────────────────────

export type ClassDiagramKind = 'class' | 'interface' | 'abstract'

export interface ClassDiagramMember {
  name: string
  visibility: '+' | '-' | '#' | '~'
}

export interface ClassDiagramClass {
  name: string
  filePath: string
  kind: ClassDiagramKind
  extends: string[]
  implements: string[]
  members: ClassDiagramMember[]
}

export interface ClassDiagramResult {
  mermaid: string
  classCount: number
  relationCount: number
  truncated: boolean
  filesScanned: number
}

const JAVA_CLASS =
  /^(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?class\s+([A-Za-z_]\w*)(?:\s+extends\s+([A-Za-z_][\w.]*))?(?:\s+implements\s+([A-Za-z_][\w.,\s]*))?/
const JAVA_INTERFACE =
  /^(?:public\s+|private\s+|protected\s+)?interface\s+([A-Za-z_]\w*)(?:\s+extends\s+([A-Za-z_][\w.,\s]*))?/
const JAVA_METHOD =
  /^\s*(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:[\w<>\x5B\x5D,\s.?]+)\s+([A-Za-z_]\w*)\s*\(/
const JAVA_FIELD =
  /^\s*(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:[\w<>\x5B\x5D,\s]+)\s+([A-Za-z_]\w*)\s*(?:=|;)/

const CS_CLASS =
  /^(?:public|private|protected|internal)?\s*(?:abstract\s+|sealed\s+|partial\s+|static\s+)*class\s+([A-Za-z_]\w*)(?:\s*:\s*([A-Za-z_][\w.,\s<>]*))?/
const CS_INTERFACE =
  /^(?:public|private|protected|internal)?\s*interface\s+([A-Za-z_]\w*)(?:\s*:\s*([A-Za-z_][\w.,\s<>]*))?/
const CS_MEMBER =
  /^\s*(?:public|private|protected|internal)\s+(?:static\s+)?(?:[\w<>\x5B\x5D,\s.?]+)\s+([A-Za-z_]\w*)\s*(?:\(|{|;)/

function tsVisibility(modifiers: Ts.NodeArray<Ts.ModifierLike> | undefined): '+' | '-' | '#' {
  const ts = getTs()
  if (!modifiers) return '+'
  for (const mod of modifiers) {
    if (mod.kind === ts.SyntaxKind.PrivateKeyword) return '-'
    if (mod.kind === ts.SyntaxKind.ProtectedKeyword) return '#'
  }
  return '+'
}

function splitTypeList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim().split(/[<.\s]/)[0])
    .filter((part) => /^[A-Za-z_]\w*$/.test(part))
}

function collectTsClasses(
  sourceFile: Ts.SourceFile,
  filePath: string,
  out: ClassDiagramClass[]
): void {
  const ts = getTs()

  function memberName(node: Ts.ClassElement | Ts.TypeElement): string | null {
    if (
      (ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) &&
      ts.isIdentifier(node.name)
    ) {
      return node.name.text
    }
    if (ts.isMethodSignature(node) || ts.isPropertySignature(node)) {
      if (ts.isIdentifier(node.name)) return node.name.text
    }
    return null
  }

  function visit(node: Ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name) {
      const info: ClassDiagramClass = {
        name: node.name.text,
        filePath,
        kind: node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AbstractKeyword)
          ? 'abstract'
          : 'class',
        extends: [],
        implements: [],
        members: []
      }
      for (const clause of node.heritageClauses ?? []) {
        const names = clause.types.map((type) => type.expression.getText(sourceFile))
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) info.extends = names
        if (clause.token === ts.SyntaxKind.ImplementsKeyword) info.implements = names
      }
      for (const member of node.members) {
        const name = memberName(member)
        if (!name || name === 'constructor') continue
        let visibility: '+' | '-' | '#' = '+'
        if (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) {
          visibility = tsVisibility(member.modifiers)
        }
        info.members.push({ name, visibility })
      }
      out.push(info)
    } else if (ts.isInterfaceDeclaration(node) && node.name) {
      const info: ClassDiagramClass = {
        name: node.name.text,
        filePath,
        kind: 'interface',
        extends: [],
        implements: [],
        members: []
      }
      for (const clause of node.heritageClauses ?? []) {
        if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
          info.extends = clause.types.map((type) => type.expression.getText(sourceFile))
        }
      }
      for (const member of node.members) {
        const name = memberName(member)
        if (!name) continue
        info.members.push({ name, visibility: '+' })
      }
      out.push(info)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

function javaVisibility(line: string): '+' | '-' | '#' | '~' {
  if (/\bprivate\b/.test(line)) return '-'
  if (/\bprotected\b/.test(line)) return '#'
  if (/\bpublic\b/.test(line)) return '+'
  return '~'
}

function collectJavaClasses(content: string, filePath: string, out: ClassDiagramClass[]): void {
  const lines = content.split('\n')
  let current: ClassDiagramClass | null = null
  let braceDepth = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!current) {
      const classMatch = trimmed.match(JAVA_CLASS)
      if (classMatch) {
        current = {
          name: classMatch[1],
          filePath,
          kind: /\babstract\b/.test(trimmed) ? 'abstract' : 'class',
          extends: classMatch[2] ? [classMatch[2].split('.').pop()!] : [],
          implements: classMatch[3] ? splitTypeList(classMatch[3]) : [],
          members: []
        }
        braceDepth = (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length
        if (braceDepth <= 0 && line.includes('{')) {
          out.push(current)
          current = null
          braceDepth = 0
        }
        continue
      }
      const ifaceMatch = trimmed.match(JAVA_INTERFACE)
      if (ifaceMatch) {
        current = {
          name: ifaceMatch[1],
          filePath,
          kind: 'interface',
          extends: ifaceMatch[2] ? splitTypeList(ifaceMatch[2]) : [],
          implements: [],
          members: []
        }
        braceDepth = (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length
        if (braceDepth <= 0 && line.includes('{')) {
          out.push(current)
          current = null
          braceDepth = 0
        }
      }
      continue
    }

    braceDepth += (line.match(/{/g) ?? []).length
    braceDepth -= (line.match(/}/g) ?? []).length

    const methodMatch = line.match(JAVA_METHOD)
    if (methodMatch?.[1] && methodMatch[1] !== current.name) {
      current.members.push({ name: methodMatch[1], visibility: javaVisibility(line) })
    } else {
      const fieldMatch = line.match(JAVA_FIELD)
      if (fieldMatch?.[1]) {
        current.members.push({ name: fieldMatch[1], visibility: javaVisibility(line) })
      }
    }

    if (braceDepth <= 0) {
      out.push(current)
      current = null
      braceDepth = 0
    }
  }
}

function csVisibility(line: string): '+' | '-' | '#' | '~' {
  if (/\bprivate\b/.test(line)) return '-'
  if (/\bprotected\b/.test(line)) return '#'
  if (/\binternal\b/.test(line)) return '~'
  return '+'
}

function collectCsClasses(content: string, filePath: string, out: ClassDiagramClass[]): void {
  const lines = content.split('\n')
  let current: ClassDiagramClass | null = null
  let braceDepth = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!current) {
      const classMatch = trimmed.match(CS_CLASS)
      if (classMatch) {
        const bases = classMatch[2] ? splitTypeList(classMatch[2]) : []
        const extendsList: string[] = []
        const implementsList: string[] = []
        for (const base of bases) {
          if (base.startsWith('I') && base.length > 1 && base[1] === base[1].toUpperCase()) {
            implementsList.push(base)
          } else {
            extendsList.push(base)
          }
        }
        current = {
          name: classMatch[1],
          filePath,
          kind: /\babstract\b/.test(trimmed) ? 'abstract' : 'class',
          extends: extendsList,
          implements: implementsList,
          members: []
        }
        braceDepth = (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length
        if (braceDepth <= 0 && line.includes('{')) {
          out.push(current)
          current = null
          braceDepth = 0
        }
        continue
      }
      const ifaceMatch = trimmed.match(CS_INTERFACE)
      if (ifaceMatch) {
        current = {
          name: ifaceMatch[1],
          filePath,
          kind: 'interface',
          extends: ifaceMatch[2] ? splitTypeList(ifaceMatch[2]) : [],
          implements: [],
          members: []
        }
        braceDepth = (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length
        if (braceDepth <= 0 && line.includes('{')) {
          out.push(current)
          current = null
          braceDepth = 0
        }
      }
      continue
    }

    braceDepth += (line.match(/{/g) ?? []).length
    braceDepth -= (line.match(/}/g) ?? []).length

    const memberMatch = line.match(CS_MEMBER)
    if (memberMatch?.[1] && !['get', 'set'].includes(memberMatch[1])) {
      current.members.push({ name: memberMatch[1], visibility: csVisibility(line) })
    }

    if (braceDepth <= 0) {
      out.push(current)
      current = null
      braceDepth = 0
    }
  }
}

async function collectFileClasses(filePath: string): Promise<ClassDiagramClass[]> {
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    return []
  }
  if (content.includes('\0')) return []

  const ext = extname(filePath).toLowerCase()
  const out: ClassDiagramClass[] = []

  if (TS_JS_EXTENSIONS.has(ext)) {
    const ts = getTs()
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForExt(ext)
    )
    collectTsClasses(sourceFile, filePath, out)
    return out
  }

  if (ext === '.java') {
    collectJavaClasses(content, filePath, out)
    return out
  }

  if (ext === '.cs') {
    collectCsClasses(content, filePath, out)
    return out
  }

  return out
}

function sanitizeClassId(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, '_')
  return cleaned || 'Class'
}

function uniqueClassIds(classes: ClassDiagramClass[]): Map<ClassDiagramClass, string> {
  const used = new Map<string, number>()
  const ids = new Map<ClassDiagramClass, string>()
  for (const cls of classes) {
    const base = sanitizeClassId(cls.name)
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    ids.set(cls, count === 0 ? base : `${base}_${count}`)
  }
  return ids
}

function resolveRelationTarget(name: string, knownNames: Set<string>): string | null {
  const simple = name.split(/[<.\s]/)[0]
  if (!simple || !knownNames.has(simple)) return null
  return simple
}

export function classesToMermaid(
  classes: ClassDiagramClass[],
  limits?: { maxClasses?: number; maxMembers?: number }
): Pick<ClassDiagramResult, 'mermaid' | 'classCount' | 'relationCount' | 'truncated'> {
  const maxClasses = limits?.maxClasses ?? MAX_CLASS_DIAGRAM_CLASSES
  const maxMembers = limits?.maxMembers ?? MAX_CLASS_DIAGRAM_MEMBERS
  const selected = classes.slice(0, maxClasses)
  const truncated = classes.length > selected.length
  const ids = uniqueClassIds(selected)
  const knownNames = new Set(selected.map((cls) => cls.name))
  const lines = ['classDiagram']
  let relationCount = 0

  for (const cls of selected) {
    const id = ids.get(cls)!
    const memberLines: string[] = []
    const members = cls.members.slice(0, maxMembers)
    for (const member of members) {
      memberLines.push(`        ${member.visibility}${member.name}()`)
    }
    if (cls.members.length > members.length) {
      memberLines.push('        ...')
    }
    if (cls.kind === 'interface') {
      memberLines.unshift('        <<interface>>')
    } else if (cls.kind === 'abstract') {
      memberLines.unshift('        <<abstract>>')
    }
    if (memberLines.length) {
      lines.push(`    class ${id} {`)
      lines.push(...memberLines)
      lines.push('    }')
    } else {
      lines.push(`    class ${id}`)
    }
  }

  for (const cls of selected) {
    const childId = ids.get(cls)!
    for (const base of cls.extends) {
      const target = resolveRelationTarget(base, knownNames)
      if (!target) continue
      const parent = selected.find((item) => item.name === target)
      if (!parent) continue
      lines.push(`    ${ids.get(parent)!} <|-- ${childId}`)
      relationCount += 1
    }
    for (const iface of cls.implements) {
      const target = resolveRelationTarget(iface, knownNames)
      if (!target) continue
      const ifaceClass = selected.find((item) => item.name === target)
      if (!ifaceClass) continue
      lines.push(`    ${ids.get(ifaceClass)!} <|.. ${childId}`)
      relationCount += 1
    }
  }

  return {
    mermaid: lines.join('\n'),
    classCount: selected.length,
    relationCount,
    truncated
  }
}

export async function buildClassDiagram(
  projectPath: string,
  options?: {
    subpath?: string
    maxClasses?: number
    maxMembers?: number
    onProgress?: (scanned: number) => void
  }
): Promise<ClassDiagramResult> {
  const startDir = options?.subpath?.trim()
    ? resolve(projectPath, options.subpath.trim())
    : resolve(projectPath)
  const classes: ClassDiagramClass[] = []
  let filesScanned = 0

  await walkProjectFiles(
    startDir,
    async (filePath) => {
      filesScanned += 1
      const found = await collectFileClasses(filePath)
      for (const cls of found) {
        classes.push(cls)
        if (classes.length >= (options?.maxClasses ?? MAX_CLASS_DIAGRAM_CLASSES) * 2) {
          return true
        }
      }
      return false
    },
    options?.onProgress,
    isClassDiagramFile
  )

  classes.sort((a, b) => a.name.localeCompare(b.name) || a.filePath.localeCompare(b.filePath))
  const diagram = classesToMermaid(classes, {
    maxClasses: options?.maxClasses,
    maxMembers: options?.maxMembers
  })

  return { ...diagram, filesScanned }
}

export function formatClassDiagram(result: ClassDiagramResult): string {
  if (!result.classCount) {
    return `Классы не найдены (просмотрено файлов: ${result.filesScanned})`
  }

  const header = `Диаграмма классов: ${result.classCount} типов, ${result.relationCount} связей${
    result.truncated ? ' (обрезано)' : ''
  }`

  return `${header}\n\n\`\`\`mermaid\n${result.mermaid}\n\`\`\`\n\n(просмотрено файлов: ${result.filesScanned})`
}

// ── Dataflow diagram (IPC / HTTP / FS) ───────────────────────────────────────

export type DataflowKind = 'ipc_out' | 'ipc_in' | 'http' | 'fs_read' | 'fs_write'

export interface DataflowDiagramResult {
  mermaid: string
  nodeCount: number
  edgeCount: number
  truncated: boolean
  filesScanned: number
}

const DATAFLOW_EXTERNAL = {
  fs: 'EXT_FS',
  http: 'EXT_HTTP',
  ipc: 'EXT_IPC'
} as const

function externalTarget(kind: DataflowKind): string {
  switch (kind) {
    case 'ipc_out':
    case 'ipc_in':
      return DATAFLOW_EXTERNAL.ipc
    case 'http':
      return DATAFLOW_EXTERNAL.http
    case 'fs_read':
    case 'fs_write':
      return DATAFLOW_EXTERNAL.fs
  }
}

function dataflowEdgeLabel(kind: DataflowKind, detail?: string): string {
  switch (kind) {
    case 'ipc_out':
      return detail ? `invoke ${detail}` : 'IPC out'
    case 'ipc_in':
      return detail ? `handle ${detail}` : 'IPC in'
    case 'http':
      return detail ?? 'HTTP'
    case 'fs_read':
      return detail ?? 'read'
    case 'fs_write':
      return detail ?? 'write'
  }
}

function isDataflowInbound(kind: DataflowKind): boolean {
  return kind === 'ipc_in' || kind === 'fs_read'
}

function detectModuleDataflows(content: string): Array<{ kind: DataflowKind; detail?: string }> {
  const seen = new Set<string>()
  const flows: Array<{ kind: DataflowKind; detail?: string }> = []

  const add = (kind: DataflowKind, detail?: string) => {
    const key = `${kind}:${detail ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    flows.push({ kind, detail })
  }

  for (const match of content.matchAll(/ipcRenderer\.invoke\s*\(\s*['"`]([^'"`]+)['"`]/g)) {
    add('ipc_out', match[1])
  }
  for (const match of content.matchAll(/ipcRenderer\.send\s*\(\s*['"`]([^'"`]+)['"`]/g)) {
    add('ipc_out', match[1])
  }
  for (const match of content.matchAll(/window\.codeviper\.(\w+)/g)) {
    add('ipc_out', match[1])
  }
  for (const match of content.matchAll(/ipcMain\.handle\s*\(\s*['"`]([^'"`]+)['"`]/g)) {
    add('ipc_in', match[1])
  }
  for (const match of content.matchAll(/ipcMain\.on\s*\(\s*['"`]([^'"`]+)['"`]/g)) {
    add('ipc_in', match[1])
  }
  for (const match of content.matchAll(
    /contextBridge\.exposeInMainWorld\s*\(\s*['"`]([^'"`]+)['"`]/g
  )) {
    add('ipc_in', match[1])
  }

  if (/\bfetch\s*\(/.test(content)) add('http', 'fetch')
  if (/axios\.\w+/.test(content)) add('http', 'axios')
  if (/\bhttps?\.(get|request|post)\s*\(/.test(content)) add('http', 'http')

  if (/\breadFile(?:Sync)?\s*\(/.test(content)) add('fs_read', 'readFile')
  if (/\bcreateReadStream\s*\(/.test(content)) add('fs_read', 'readStream')
  if (/\breaddir(?:Sync)?\s*\(/.test(content)) add('fs_read', 'readdir')
  if (/\bstat(?:Sync)?\s*\(/.test(content)) add('fs_read', 'stat')

  if (/\bwriteFile(?:Sync)?\s*\(/.test(content)) add('fs_write', 'writeFile')
  if (/\bappendFile(?:Sync)?\s*\(/.test(content)) add('fs_write', 'appendFile')
  if (/\bcreateWriteStream\s*\(/.test(content)) add('fs_write', 'writeStream')
  if (/\bunlink(?:Sync)?\s*\(/.test(content)) add('fs_write', 'unlink')

  if (/\brequests\.\w+/.test(content)) add('http', 'requests')
  if (/\bhttpx\.\w+/.test(content)) add('http', 'httpx')
  if (/\bopen\s*\(/.test(content)) add('fs_read', 'open')

  return flows
}

async function collectFileDataflows(
  filePath: string
): Promise<Array<{ kind: DataflowKind; detail?: string }>> {
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    return []
  }
  if (content.includes('\0')) return []
  return detectModuleDataflows(content)
}

export function dataflowToMermaid(
  projectPath: string,
  moduleFlows: Map<string, Array<{ kind: DataflowKind; detail?: string }>>,
  limits?: { maxNodes?: number; maxEdges?: number }
): Pick<DataflowDiagramResult, 'mermaid' | 'nodeCount' | 'edgeCount' | 'truncated'> {
  const maxNodes = limits?.maxNodes ?? MAX_DATAFLOW_NODES
  const maxEdges = limits?.maxEdges ?? MAX_DATAFLOW_EDGES
  const moduleIds = new Map<string, number>()
  const extUsed = new Set<string>()
  const edges: Array<{ from: string; to: string; label: string }> = []
  let truncated = false

  const sortedModules = [...moduleFlows.keys()].sort()
  for (const mod of sortedModules) {
    const flows = moduleFlows.get(mod) ?? []
    for (const flow of flows) {
      if (edges.length >= maxEdges) {
        truncated = true
        break
      }
      const ext = externalTarget(flow.kind)
      extUsed.add(ext)
      if (!moduleIds.has(mod)) {
        if (moduleIds.size >= maxNodes) {
          truncated = true
          continue
        }
        moduleIds.set(mod, moduleIds.size)
      }
      const label = sanitizeMermaidLabel(dataflowEdgeLabel(flow.kind, flow.detail))
      if (isDataflowInbound(flow.kind)) {
        edges.push({ from: ext, to: mod, label })
      } else {
        edges.push({ from: mod, to: ext, label })
      }
    }
    if (truncated) break
  }

  const lines = ['flowchart LR']
  if (extUsed.has(DATAFLOW_EXTERNAL.fs)) {
    lines.push(`  ${DATAFLOW_EXTERNAL.fs}[("Filesystem")]`)
  }
  if (extUsed.has(DATAFLOW_EXTERNAL.http)) {
    lines.push(`  ${DATAFLOW_EXTERNAL.http}[("HTTP")]`)
  }
  if (extUsed.has(DATAFLOW_EXTERNAL.ipc)) {
    lines.push(`  ${DATAFLOW_EXTERNAL.ipc}[["IPC"]]`)
  }

  const sortedNodes = [...moduleIds.entries()].sort((a, b) => a[1] - b[1])
  for (const [path, idx] of sortedNodes) {
    lines.push(
      `  ${toMermaidNodeId(idx)}["${sanitizeMermaidLabel(relModulePath(projectPath, path))}"]`
    )
  }

  for (const edge of edges) {
    const mod = edge.from.startsWith('EXT_') ? edge.to : edge.from
    const modIdx = moduleIds.get(mod)
    if (modIdx == null) continue
    const modNode = toMermaidNodeId(modIdx)
    if (edge.from.startsWith('EXT_')) {
      lines.push(`  ${edge.from} -->|"${edge.label}"| ${modNode}`)
    } else {
      lines.push(`  ${modNode} -->|"${edge.label}"| ${edge.to}`)
    }
  }

  return {
    mermaid: lines.join('\n'),
    nodeCount: moduleIds.size + extUsed.size,
    edgeCount: edges.length,
    truncated
  }
}

export async function buildDataflowDiagram(
  projectPath: string,
  options?: {
    subpath?: string
    focus?: string
    maxNodes?: number
    maxEdges?: number
    onProgress?: (scanned: number) => void
  }
): Promise<DataflowDiagramResult> {
  const startDir = options?.subpath?.trim()
    ? resolve(projectPath, options.subpath.trim())
    : resolve(projectPath)
  const moduleFlows = new Map<string, Array<{ kind: DataflowKind; detail?: string }>>()
  let filesScanned = 0
  const focusFile = options?.focus?.trim() ? resolve(projectPath, options.focus.trim()) : undefined

  await walkProjectFiles(
    startDir,
    async (filePath) => {
      filesScanned += 1
      if (focusFile && filePath !== focusFile) return false
      const flows = await collectFileDataflows(filePath)
      if (flows.length) moduleFlows.set(filePath, flows)
      return false
    },
    options?.onProgress
  )

  const diagram = dataflowToMermaid(projectPath, moduleFlows, {
    maxNodes: options?.maxNodes,
    maxEdges: options?.maxEdges
  })

  return { ...diagram, filesScanned }
}

export function formatDataflowDiagram(result: DataflowDiagramResult): string {
  if (!result.edgeCount) {
    return `Потоки данных не найдены (IPC/HTTP/FS; просмотрено файлов: ${result.filesScanned})`
  }

  const header = `DFD (модули): ${result.nodeCount} узлов, ${result.edgeCount} потоков${
    result.truncated ? ' (обрезано)' : ''
  }`

  return `${header}\n\n\`\`\`mermaid\n${result.mermaid}\n\`\`\`\n\n(просмотрено файлов: ${result.filesScanned})`
}
