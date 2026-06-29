import { readFile, readdir, stat } from 'fs/promises'
import { extname, join, relative, resolve } from 'path'
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

export const MAX_SLOW_CODE_ISSUES = 50

export type SlowCodeIssueKind =
  | 'nested_loops'
  | 'await_in_loop'
  | 'sync_io_in_loop'
  | 'json_parse_in_loop'
  | 'array_scan_in_loop'

export type SlowCodeSeverity = 'high' | 'medium' | 'low'

export interface SlowCodeIssue {
  path: string
  line: number
  column: number
  kind: SlowCodeIssueKind
  severity: SlowCodeSeverity
  message: string
}

export interface SlowCodeSearchResult {
  issues: SlowCodeIssue[]
  truncated: boolean
  filesScanned: number
}

const SYNC_IO_CALLS = new Set([
  'readFileSync',
  'writeFileSync',
  'appendFileSync',
  'copyFileSync',
  'mkdirSync',
  'readdirSync',
  'statSync',
  'lstatSync',
  'existsSync',
  'unlinkSync',
  'rmSync',
  'readSync',
  'writeSync',
  'openSync'
])

const ARRAY_SCAN_METHODS = new Set([
  'indexOf',
  'includes',
  'find',
  'findIndex',
  'some',
  'every',
  'filter'
])

const ISSUE_LABELS: Record<SlowCodeIssueKind, string> = {
  nested_loops: 'вложенные циклы',
  await_in_loop: 'await внутри цикла',
  sync_io_in_loop: 'синхронный I/O в цикле',
  json_parse_in_loop: 'JSON.parse/loads в цикле',
  array_scan_in_loop: 'линейный поиск по массиву в цикле'
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

function isLoopNode(ts: typeof import('typescript'), node: Ts.Node): boolean {
  return (
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  )
}

function loopBody(ts: typeof import('typescript'), node: Ts.Node): Ts.Node | undefined {
  if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
    return node.statement
  }
  if (ts.isWhileStatement(node)) return node.statement
  if (ts.isDoStatement(node)) return node.statement
  return undefined
}

function visitSubtree(
  ts: typeof import('typescript'),
  root: Ts.Node,
  visitor: (node: Ts.Node) => void
): void {
  function walk(node: Ts.Node): void {
    visitor(node)
    ts.forEachChild(node, walk)
  }
  walk(root)
}

function findInSubtree(
  ts: typeof import('typescript'),
  root: Ts.Node,
  predicate: (node: Ts.Node) => boolean
): Ts.Node | undefined {
  let found: Ts.Node | undefined
  visitSubtree(ts, root, (node) => {
    if (!found && predicate(node)) found = node
  })
  return found
}

function getCallName(ts: typeof import('typescript'), expr: Ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text
  return null
}

function isJsonParseCall(ts: typeof import('typescript'), node: Ts.CallExpression): boolean {
  const expr = node.expression
  if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'parse') {
    if (ts.isIdentifier(expr.expression) && expr.expression.text === 'JSON') return true
  }
  if (ts.isIdentifier(expr) && expr.text === 'parse') return true
  return false
}

function isSyncIoCall(ts: typeof import('typescript'), node: Ts.CallExpression): boolean {
  const name = getCallName(ts, node.expression)
  return name != null && SYNC_IO_CALLS.has(name)
}

function isArrayScanCall(ts: typeof import('typescript'), node: Ts.CallExpression): boolean {
  const expr = node.expression
  if (!ts.isPropertyAccessExpression(expr)) return false
  return ARRAY_SCAN_METHODS.has(expr.name.text)
}

function analyzeTsSlowCode(sourceFile: Ts.SourceFile, filePath: string): SlowCodeIssue[] {
  const ts = getTs()
  const issues: SlowCodeIssue[] = []

  function report(
    kind: SlowCodeIssueKind,
    severity: SlowCodeSeverity,
    node: Ts.Node,
    detail: string
  ): void {
    const pos = positionOf(sourceFile, node)
    issues.push({
      path: filePath,
      line: pos.line,
      column: pos.column,
      kind,
      severity,
      message: detail
    })
  }

  function analyzeLoopBody(body: Ts.Node, loopNode: Ts.Node): void {
    const nested = findInSubtree(ts, body, (node) => node !== loopNode && isLoopNode(ts, node))
    if (nested) {
      report('nested_loops', 'high', nested, 'Вложенный цикл — возможная сложность O(n²) или выше')
    }

    const awaitNode = findInSubtree(ts, body, (node) => ts.isAwaitExpression(node))
    if (awaitNode) {
      report(
        'await_in_loop',
        'medium',
        awaitNode,
        'Последовательный await в цикле — рассмотрите Promise.all или батчинг'
      )
    }

    const syncIo = findInSubtree(
      ts,
      body,
      (node) => ts.isCallExpression(node) && isSyncIoCall(ts, node)
    )
    if (syncIo) {
      report('sync_io_in_loop', 'high', syncIo, 'Синхронный I/O в цикле блокирует event loop')
    }

    const jsonParse = findInSubtree(
      ts,
      body,
      (node) => ts.isCallExpression(node) && isJsonParseCall(ts, node)
    )
    if (jsonParse) {
      report(
        'json_parse_in_loop',
        'medium',
        jsonParse,
        'Повторный JSON.parse в цикле — кэшируйте результат'
      )
    }

    const arrayScan = findInSubtree(
      ts,
      body,
      (node) => ts.isCallExpression(node) && isArrayScanCall(ts, node)
    )
    if (arrayScan) {
      report(
        'array_scan_in_loop',
        'low',
        arrayScan,
        'Поиск по массиву в цикле — рассмотрите Set/Map для O(1) lookup'
      )
    }
  }

  function visit(node: Ts.Node): void {
    if (isLoopNode(ts, node)) {
      const body = loopBody(ts, node)
      if (body) analyzeLoopBody(body, node)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return issues
}

const PY_LOOP = /^(?:async\s+)?(?:for|while)\b/
const PY_AWAIT = /\bawait\b/
const PY_SYNC_IO = /\b(?:open|json\.loads|pickle\.loads|read|readlines)\s*\(/
const PY_ARRAY_SCAN = /\.(?:index|find|count|__contains__)\s*\(/

function lineIndent(line: string): number {
  const trimmed = line.trimStart()
  return line.length - trimmed.length
}

function analyzePySlowCode(content: string, filePath: string): SlowCodeIssue[] {
  const lines = content.split('\n')
  const issues: SlowCodeIssue[] = []
  const activeLoops: Array<{ indent: number; line: number }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const indent = lineIndent(line)
    while (activeLoops.length && indent <= activeLoops[activeLoops.length - 1].indent) {
      activeLoops.pop()
    }

    if (PY_LOOP.test(trimmed)) {
      if (activeLoops.length) {
        issues.push({
          path: filePath,
          line: i + 1,
          column: indent + 1,
          kind: 'nested_loops',
          severity: 'high',
          message: 'Вложенный цикл — возможная сложность O(n²) или выше'
        })
      }
      activeLoops.push({ indent, line: i + 1 })
      continue
    }

    if (!activeLoops.length) continue

    const col = indent + 1
    if (PY_AWAIT.test(trimmed)) {
      issues.push({
        path: filePath,
        line: i + 1,
        column: col,
        kind: 'await_in_loop',
        severity: 'medium',
        message: 'Последовательный await в цикле — рассмотрите asyncio.gather или батчинг'
      })
    }
    if (PY_SYNC_IO.test(trimmed)) {
      issues.push({
        path: filePath,
        line: i + 1,
        column: col,
        kind: 'sync_io_in_loop',
        severity: 'high',
        message: 'Синхронный I/O в цикле блокирует выполнение'
      })
    }
    if (/json\.loads\s*\(/.test(trimmed)) {
      issues.push({
        path: filePath,
        line: i + 1,
        column: col,
        kind: 'json_parse_in_loop',
        severity: 'medium',
        message: 'Повторный json.loads в цикле — кэшируйте результат'
      })
    }
    if (PY_ARRAY_SCAN.test(trimmed)) {
      issues.push({
        path: filePath,
        line: i + 1,
        column: col,
        kind: 'array_scan_in_loop',
        severity: 'low',
        message: 'Поиск по коллекции в цикле — рассмотрите set/dict для O(1) lookup'
      })
    }
  }

  return issues
}

function isAnalyzableFile(filePath: string): boolean {
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

      if (!entry.isFile() || !isAnalyzableFile(fullPath)) continue
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

async function analyzeFile(filePath: string): Promise<SlowCodeIssue[]> {
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
  if (TS_JS_EXTENSIONS.has(ext)) {
    const ts = getTs()
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKindForExt(ext)
    )
    return analyzeTsSlowCode(sourceFile, filePath)
  }
  if (PY_EXTENSIONS.has(ext)) {
    return analyzePySlowCode(content, filePath)
  }
  return []
}

const SEVERITY_ORDER: Record<SlowCodeSeverity, number> = { high: 0, medium: 1, low: 2 }

export async function findSlowCode(
  projectPath: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<SlowCodeSearchResult> {
  const maxResults = options?.maxResults ?? MAX_SLOW_CODE_ISSUES
  const sub = options?.subpath?.trim()
  const resolved = sub ? resolve(projectPath, sub) : resolve(projectPath)

  let entryStat
  try {
    entryStat = await stat(resolved)
  } catch {
    return { issues: [], truncated: false, filesScanned: 0 }
  }

  if (entryStat.isFile()) {
    if (!isAnalyzableFile(resolved)) {
      return { issues: [], truncated: false, filesScanned: 0 }
    }
    const found = await analyzeFile(resolved)
    const issues = found.slice(0, maxResults)
    return { issues, truncated: found.length > maxResults, filesScanned: 1 }
  }

  const issues: SlowCodeIssue[] = []
  let truncated = false

  const filesScanned = await walkProjectFiles(
    resolved,
    async (filePath) => {
      if (issues.length >= maxResults) {
        truncated = true
        return true
      }

      const found = await analyzeFile(filePath)
      for (const item of found) {
        issues.push(item)
        if (issues.length >= maxResults) {
          truncated = true
          return true
        }
      }
      return false
    },
    options?.onProgress
  )

  issues.sort((a, b) => {
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    if (a.path !== b.path) return a.path.localeCompare(b.path)
    return a.line - b.line
  })

  return { issues, truncated, filesScanned }
}

export function formatSlowCodeReport(projectPath: string, result: SlowCodeSearchResult): string {
  const { issues, truncated, filesScanned } = result

  if (!issues.length) {
    return [
      'Медленные участки не обнаружены (AST-анализ ts/js/py).',
      `Просмотрено файлов: ${filesScanned}.`,
      '',
      'Проверялись: вложенные циклы, await в цикле, sync I/O, JSON.parse/loads, линейный поиск в цикле.'
    ].join('\n')
  }

  const bySeverity = {
    high: issues.filter((i) => i.severity === 'high').length,
    medium: issues.filter((i) => i.severity === 'medium').length,
    low: issues.filter((i) => i.severity === 'low').length
  }

  const header = [
    `Отчёт find_slow_code (AST): ${issues.length}${truncated ? '+' : ''} находок`,
    `Просмотрено файлов: ${filesScanned}`,
    `По severity: high=${bySeverity.high}, medium=${bySeverity.medium}, low=${bySeverity.low}`,
    ''
  ].join('\n')

  const lines = issues.map((item, index) => {
    const rel = relative(projectPath, item.path).replace(/\\/g, '/')
    return [
      `[${index + 1}] ${item.severity.toUpperCase()} · ${ISSUE_LABELS[item.kind]}`,
      `    ${rel}:${item.line}:${item.column}`,
      `    ${item.message}`
    ].join('\n')
  })

  const footer = truncated
    ? '\n\n(результаты обрезаны; уточните path или исправьте находки и повторите)'
    : ''

  return `${header}${lines.join('\n\n')}${footer}`
}
