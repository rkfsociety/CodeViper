import { readFile, readdir, stat } from 'fs/promises'
import { createRequire } from 'module'
import { extname, relative, resolve } from 'path'
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

const TSX_EXTENSIONS = new Set(['.tsx'])
export const MAX_RERENDER_CANDIDATE_ISSUES = 50

export interface RerenderCandidateIssue {
  path: string
  line: number
  column: number
  name: string
  message: string
}

export interface RerenderCandidateSearchResult {
  issues: RerenderCandidateIssue[]
  truncated: boolean
  filesScanned: number
}

function scriptKindForExt(ext: string): Ts.ScriptKind {
  const ts = getTs()
  return ext === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.JS
}

function positionOf(sourceFile: Ts.SourceFile, node: Ts.Node): { line: number; column: number } {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile, false))
  return { line: pos.line + 1, column: pos.character + 1 }
}

function isAnalyzableFile(filePath: string): boolean {
  return TSX_EXTENSIONS.has(extname(filePath).toLowerCase())
}

function isPropsTypeName(name: string): boolean {
  return /Props?$/i.test(name)
}

function hasPropsParameter(
  ts: typeof import('typescript'),
  fn: Ts.FunctionLikeDeclarationBase
): boolean {
  return fn.parameters.some((param) => {
    if (!param.type) return false
    if (ts.isTypeReferenceNode(param.type) && ts.isIdentifier(param.type.typeName)) {
      return isPropsTypeName(param.type.typeName.text)
    }
    if (ts.isTypeLiteralNode(param.type)) {
      return true
    }
    return false
  })
}

function isExported(node: Ts.Node): boolean {
  const ts = getTs()
  const modifiers = (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined) ?? []
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
}

function isFunctionComponentName(name: string): boolean {
  return /^[A-Z]/.test(name)
}

function calleeName(ts: typeof import('typescript'), expr: Ts.Expression): string | null {
  if (ts.isIdentifier(expr)) return expr.text
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text
  return null
}

function functionUsesMemoHooks(
  ts: typeof import('typescript'),
  fn: Ts.FunctionLikeDeclarationBase
): boolean {
  let found = false

  function visit(node: Ts.Node): void {
    if (found) return
    if (ts.isCallExpression(node)) {
      const name = calleeName(ts, node.expression)
      if (name === 'useMemo' || name === 'useCallback') {
        found = true
        return
      }
    }
    ts.forEachChild(node, visit)
  }

  if (fn.body) visit(fn.body)
  return found
}

function initializerIsMemoizedComponent(
  ts: typeof import('typescript'),
  initializer: Ts.Expression
): boolean {
  if (!ts.isCallExpression(initializer)) return false
  return calleeName(ts, initializer.expression) === 'memo'
}

function collectCandidates(sourceFile: Ts.SourceFile, filePath: string): RerenderCandidateIssue[] {
  const ts = getTs()
  const issues: RerenderCandidateIssue[] = []

  function report(node: Ts.Node, name: string): void {
    const pos = positionOf(sourceFile, node)
    issues.push({
      path: filePath,
      line: pos.line,
      column: pos.column,
      name,
      message: 'React-компонент без memo/useMemo/useCallback выглядит кандидатом на мемоизацию'
    })
  }

  function visit(node: Ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name && isExported(node)) {
      const name = node.name.text
      if (
        isFunctionComponentName(name) &&
        hasPropsParameter(ts, node) &&
        !functionUsesMemoHooks(ts, node)
      ) {
        report(node.name, name)
      }
    } else if (ts.isVariableStatement(node) && isExported(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
        const name = decl.name.text
        if (!isFunctionComponentName(name)) continue
        if (initializerIsMemoizedComponent(ts, decl.initializer)) continue

        if (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer)) {
          if (
            hasPropsParameter(ts, decl.initializer) &&
            !functionUsesMemoHooks(ts, decl.initializer)
          ) {
            report(decl.name, name)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return issues
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

      const fullPath = resolve(dir, entry.name)
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

async function analyzeFile(filePath: string): Promise<RerenderCandidateIssue[]> {
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

  const ts = getTs()
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKindForExt(extname(filePath).toLowerCase())
  )
  return collectCandidates(sourceFile, filePath)
}

export async function findRerenderCandidates(
  projectPath: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<RerenderCandidateSearchResult> {
  const maxResults = options?.maxResults ?? MAX_RERENDER_CANDIDATE_ISSUES
  const resolved = options?.subpath?.trim()
    ? resolve(projectPath, options.subpath.trim())
    : resolve(projectPath)

  let entryStat
  try {
    entryStat = await stat(resolved)
  } catch {
    return { issues: [], truncated: false, filesScanned: 0 }
  }

  if (entryStat.isFile()) {
    if (!isAnalyzableFile(resolved)) return { issues: [], truncated: false, filesScanned: 0 }
    const found = await analyzeFile(resolved)
    return {
      issues: found.slice(0, maxResults),
      truncated: found.length > maxResults,
      filesScanned: 1
    }
  }

  const issues: RerenderCandidateIssue[] = []
  let truncated = false

  const filesScanned = await walkProjectFiles(
    resolved,
    async (filePath) => {
      if (issues.length >= maxResults) {
        truncated = true
        return true
      }
      const found = await analyzeFile(filePath)
      for (const issue of found) {
        issues.push(issue)
        if (issues.length >= maxResults) {
          truncated = true
          return true
        }
      }
      return false
    },
    options?.onProgress
  )

  return { issues, truncated, filesScanned }
}

export function formatRerenderCandidatesOutput(
  projectPath: string,
  result: RerenderCandidateSearchResult
): string {
  if (!result.issues.length) {
    return [
      'Кандидаты на мемоизацию не найдены (AST-анализ tsx).',
      `Просмотрено файлов: ${result.filesScanned}.`,
      '',
      'Проверялись export-компоненты с props и отсутствие memo/useMemo/useCallback в файле.'
    ].join('\n')
  }

  const lines = result.issues.map((issue, index) => {
    const rel = relative(projectPath, issue.path).replace(/\\/g, '/')
    return [
      `[${index + 1}] ${rel}:${issue.line}:${issue.column}`,
      `    ${issue.name}`,
      `    ${issue.message}`
    ].join('\n')
  })

  const footer = result.truncated
    ? `\n\n(Результаты обрезаны; просмотрено файлов: ${result.filesScanned})`
    : `\n\n(Просмотрено файлов: ${result.filesScanned})`

  return `Отчёт find_rerender_candidates (AST): ${result.issues.length}${result.truncated ? '+' : ''} находок\n${lines.join(
    '\n\n'
  )}${footer}`
}
