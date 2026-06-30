import { readFile, readdir, stat } from 'fs/promises'
import { createRequire } from 'module'
import { extname, join, relative, resolve } from 'path'
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

export const MAX_DEAD_CODE_ISSUES = 50

export type DeadCodeIssueKind =
  'unreachable_statement' | 'constant_condition' | 'constant_conditional_expression'

export type DeadCodeSeverity = 'high' | 'medium' | 'low'

export interface DeadCodeIssue {
  path: string
  line: number
  column: number
  kind: DeadCodeIssueKind
  severity: DeadCodeSeverity
  message: string
}

export interface DeadCodeSearchResult {
  issues: DeadCodeIssue[]
  truncated: boolean
  filesScanned: number
}

const ISSUE_LABELS: Record<DeadCodeIssueKind, string> = {
  unreachable_statement: 'недостижимый код',
  constant_condition: 'константная ветка',
  constant_conditional_expression: 'константный тернарный оператор'
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

function isTerminatingStatement(ts: typeof import('typescript'), node: Ts.Statement): boolean {
  return (
    ts.isReturnStatement(node) ||
    ts.isThrowStatement(node) ||
    ts.isContinueStatement(node) ||
    ts.isBreakStatement(node)
  )
}

function evalBooleanLike(
  ts: typeof import('typescript'),
  expr: Ts.Expression
): boolean | undefined {
  if (ts.isParenthesizedExpression(expr)) return evalBooleanLike(ts, expr.expression)
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return false
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken) {
    const inner = evalBooleanLike(ts, expr.operand)
    return inner === undefined ? undefined : !inner
  }
  return undefined
}

function analyzeTsDeadCode(sourceFile: Ts.SourceFile, filePath: string): DeadCodeIssue[] {
  const ts = getTs()
  const issues: DeadCodeIssue[] = []
  const seen = new Set<string>()

  function report(
    kind: DeadCodeIssueKind,
    severity: DeadCodeSeverity,
    node: Ts.Node,
    message: string
  ): void {
    const pos = positionOf(sourceFile, node)
    const key = `${kind}:${pos.line}:${pos.column}:${message}`
    if (seen.has(key)) return
    seen.add(key)
    issues.push({
      path: filePath,
      line: pos.line,
      column: pos.column,
      kind,
      severity,
      message
    })
  }

  function inspectStatements(statements: Ts.NodeArray<Ts.Statement>): void {
    let terminated = false
    for (const statement of statements) {
      if (terminated) {
        report(
          'unreachable_statement',
          'high',
          statement,
          'Оператор никогда не выполнится: выше по блоку уже есть return/throw/break/continue'
        )
      }

      visit(statement)

      if (isTerminatingStatement(ts, statement)) {
        terminated = true
      }
    }
  }

  function inspectStatementBody(statement: Ts.Statement): void {
    if (ts.isBlock(statement)) {
      inspectStatements(statement.statements)
    } else {
      visit(statement)
    }
  }

  function visit(node: Ts.Node): void {
    if (
      ts.isSourceFile(node) ||
      ts.isBlock(node) ||
      ts.isModuleBlock(node) ||
      ts.isCaseClause(node)
    ) {
      inspectStatements(node.statements)
      return
    }

    if (ts.isDefaultClause(node)) {
      inspectStatements(node.statements)
      return
    }

    if (ts.isIfStatement(node)) {
      const value = evalBooleanLike(ts, node.expression)
      if (value === true) {
        if (node.elseStatement) {
          report(
            'constant_condition',
            'medium',
            node.elseStatement,
            'Ветка else недостижима: условие if всегда true'
          )
        }
      } else if (value === false) {
        report(
          'constant_condition',
          'medium',
          node.thenStatement,
          'Ветка if недостижима: условие if всегда false'
        )
      }

      inspectStatementBody(node.thenStatement)
      if (node.elseStatement) inspectStatementBody(node.elseStatement)
      return
    }

    if (ts.isConditionalExpression(node)) {
      const value = evalBooleanLike(ts, node.condition)
      if (value === true) {
        report(
          'constant_conditional_expression',
          'low',
          node.whenFalse,
          'Правая ветка тернарного оператора недостижима: условие всегда true'
        )
      } else if (value === false) {
        report(
          'constant_conditional_expression',
          'low',
          node.whenTrue,
          'Левая ветка тернарного оператора недостижима: условие всегда false'
        )
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return issues
}

function isAnalyzableFile(filePath: string): boolean {
  return TS_JS_EXTENSIONS.has(extname(filePath).toLowerCase())
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

async function analyzeFile(filePath: string): Promise<DeadCodeIssue[]> {
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
  const ts = getTs()
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForExt(ext)
  )
  return analyzeTsDeadCode(sourceFile, filePath)
}

const SEVERITY_ORDER: Record<DeadCodeSeverity, number> = { high: 0, medium: 1, low: 2 }

export async function findDeadCode(
  projectPath: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<DeadCodeSearchResult> {
  const maxResults = options?.maxResults ?? MAX_DEAD_CODE_ISSUES
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

  const issues: DeadCodeIssue[] = []
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

export function formatDeadCodeReport(projectPath: string, result: DeadCodeSearchResult): string {
  const { issues, truncated, filesScanned } = result

  if (!issues.length) {
    return [
      'Мёртвый код не обнаружен (AST-анализ ts/js).',
      `Просмотрено файлов: ${filesScanned}.`,
      '',
      'Проверялись: недостижимые операторы после return/throw/break/continue, ветки if с константным true/false и тернарные операторы с константным условием.'
    ].join('\n')
  }

  const bySeverity = {
    high: issues.filter((i) => i.severity === 'high').length,
    medium: issues.filter((i) => i.severity === 'medium').length,
    low: issues.filter((i) => i.severity === 'low').length
  }

  const header = [
    `Отчёт find_dead_code (AST): ${issues.length}${truncated ? '+' : ''} находок`,
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
