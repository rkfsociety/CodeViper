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

const TS_JS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'])

export const MAX_MAGIC_NUMBER_ISSUES = 50

export interface MagicNumberIssue {
  path: string
  line: number
  column: number
  value: string
  message: string
}

export interface MagicNumberSearchResult {
  issues: MagicNumberIssue[]
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

function isAnalyzableFile(filePath: string): boolean {
  return (
    TS_JS_EXTENSIONS.has(extname(filePath).toLowerCase()) &&
    !/[\\/]shared[\\/]constants\.ts$/.test(filePath)
  )
}

function unwrapNegativeLiteral(
  ts: typeof import('typescript'),
  node: Ts.Node
): {
  literal: Ts.NumericLiteral
  signedText: string
  value: number
} | null {
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    if (ts.isNumericLiteral(node.operand)) {
      return {
        literal: node.operand,
        signedText: `-${node.operand.text}`,
        value: -Number(node.operand.text)
      }
    }
  }
  if (ts.isNumericLiteral(node)) {
    return {
      literal: node,
      signedText: node.text,
      value: Number(node.text)
    }
  }
  return null
}

function isArrayIndexLiteral(ts: typeof import('typescript'), node: Ts.Node): boolean {
  const parent = node.parent
  if (!parent || !ts.isElementAccessExpression(parent)) return false
  return parent.argumentExpression === node
}

function isConstDeclaration(ts: typeof import('typescript'), node: Ts.Node): boolean {
  const parent = node.parent
  if (!parent || !ts.isVariableDeclaration(parent)) return false
  const list = parent.parent
  return !!list && ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0
}

function hasAncestorEnumMember(ts: typeof import('typescript'), node: Ts.Node): boolean {
  let current: Ts.Node | undefined = node.parent
  while (current) {
    if (current.kind === ts.SyntaxKind.EnumMember || current.kind === ts.SyntaxKind.EnumDeclaration)
      return true
    current = current.parent
  }
  return false
}

function isAllowedMagicNumber(
  ts: typeof import('typescript'),
  node: Ts.Node,
  value: number
): boolean {
  if (value === 0 || value === 1 || value === -1) return true
  if (isArrayIndexLiteral(ts, node)) return true
  if (isConstDeclaration(ts, node)) return true
  if (hasAncestorEnumMember(ts, node)) return true
  return false
}

function analyzeTsMagicNumbers(sourceFile: Ts.SourceFile, filePath: string): MagicNumberIssue[] {
  const ts = getTs()
  const issues: MagicNumberIssue[] = []

  function visit(node: Ts.Node): void {
    const numeric = unwrapNegativeLiteral(ts, node)
    if (numeric && !isAllowedMagicNumber(ts, node, numeric.value)) {
      const pos = positionOf(sourceFile, node)
      issues.push({
        path: filePath,
        line: pos.line,
        column: pos.column,
        value: numeric.signedText,
        message: 'Числовой литерал без именованной константы рядом'
      })
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

async function analyzeFile(filePath: string): Promise<MagicNumberIssue[]> {
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
  return analyzeTsMagicNumbers(sourceFile, filePath)
}

export async function findMagicNumbers(
  projectPath: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<MagicNumberSearchResult> {
  const maxResults = options?.maxResults ?? MAX_MAGIC_NUMBER_ISSUES
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

  const issues: MagicNumberIssue[] = []
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

  return { issues, truncated, filesScanned }
}

export function formatMagicNumbersOutput(
  projectPath: string,
  result: MagicNumberSearchResult
): string {
  if (!result.issues.length) {
    return [
      'Магические числовые литералы не обнаружены (AST-скан ts/js).',
      `Просмотрено файлов: ${result.filesScanned}.`,
      '',
      'Проверялись: числа вне shared/constants.ts, вне const/enum и не индексы массива.'
    ].join('\n')
  }

  const lines = result.issues.map((item, index) => {
    const rel = relative(projectPath, item.path).replace(/\\/g, '/')
    return `[${index + 1}] ${rel}:${item.line}:${item.column}  ${item.value}  ${item.message}`
  })

  const footer = result.truncated
    ? `\n\n(результаты обрезаны; просмотрено файлов: ${result.filesScanned})`
    : `\n\n(просмотрено файлов: ${result.filesScanned})`

  return `Отчёт find_magic_numbers (AST): ${result.issues.length}${
    result.truncated ? '+' : ''
  } находок\n${lines.join('\n')}${footer}`
}
