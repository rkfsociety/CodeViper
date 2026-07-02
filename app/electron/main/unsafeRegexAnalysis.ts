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

export const MAX_UNSAFE_REGEX_ISSUES = 50

export interface UnsafeRegexIssue {
  path: string
  line: number
  column: number
  pattern: string
  message: string
}

export interface UnsafeRegexSearchResult {
  issues: UnsafeRegexIssue[]
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
  return TS_JS_EXTENSIONS.has(extname(filePath).toLowerCase())
}

function analyzePattern(pattern: string): string | null {
  const normalized = pattern.replace(/\\./g, '_')
  const nestedQuantifier = /\((?:[^()\\]|\\.)*[+*?](?:[^()\\]|\\.)*\)[+*?{]/.test(normalized)
  if (nestedQuantifier) return 'Вложенные квантификаторы создают риск catastrophic backtracking'

  const repeatedAlternationMatch = pattern.match(
    /\(((?:[^()\\]|\\.)*\|(?:[^()\\]|\\.)*)\)([+*?]|\{\d+(?:,\d*)?\})/
  )
  if (repeatedAlternationMatch) {
    const inside = repeatedAlternationMatch[1]
    const parts = inside
      .split('|')
      .map((part) => part.replace(/\\./g, '_').trim())
      .filter(Boolean)
    for (let i = 0; i < parts.length; i++) {
      for (let j = 0; j < parts.length; j++) {
        if (i === j) continue
        if (parts[i] === parts[j]) return 'Похоже на неоднозначную alternation под квантификатором'
        if (parts[i].startsWith(parts[j]) || parts[j].startsWith(parts[i])) {
          return 'Похоже на неоднозначную alternation под квантификатором'
        }
      }
    }
  }
  return null
}

function extractRegexPattern(
  ts: typeof import('typescript'),
  node: Ts.Node
): { pattern: string; node: Ts.Node } | null {
  if (ts.isRegularExpressionLiteral(node)) {
    const raw = node.getText()
    const match = raw.match(/^\/(.+)\/[a-z]*$/i)
    if (match) return { pattern: match[1], node }
  }

  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'RegExp' &&
    node.arguments?.length
  ) {
    const arg = node.arguments[0]
    if (ts.isStringLiteralLike(arg)) {
      return { pattern: arg.text, node: arg }
    }
  }

  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'RegExp' &&
    node.arguments.length
  ) {
    const arg = node.arguments[0]
    if (ts.isStringLiteralLike(arg)) {
      return { pattern: arg.text, node: arg }
    }
  }

  return null
}

function analyzeTsUnsafeRegex(sourceFile: Ts.SourceFile, filePath: string): UnsafeRegexIssue[] {
  const ts = getTs()
  const issues: UnsafeRegexIssue[] = []
  const seen = new Set<string>()

  function report(node: Ts.Node, pattern: string, message: string): void {
    const pos = positionOf(sourceFile, node)
    const key = `${pos.line}:${pos.column}:${pattern}:${message}`
    if (seen.has(key)) return
    seen.add(key)
    issues.push({
      path: filePath,
      line: pos.line,
      column: pos.column,
      pattern,
      message
    })
  }

  function visit(node: Ts.Node): void {
    const regex = extractRegexPattern(ts, node)
    if (regex) {
      const risk = analyzePattern(regex.pattern)
      if (risk) report(regex.node, regex.pattern, risk)
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

async function analyzeFile(filePath: string): Promise<UnsafeRegexIssue[]> {
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
  return analyzeTsUnsafeRegex(sourceFile, filePath)
}

export async function findUnsafeRegex(
  projectPath: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<UnsafeRegexSearchResult> {
  const maxResults = options?.maxResults ?? MAX_UNSAFE_REGEX_ISSUES
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

  const issues: UnsafeRegexIssue[] = []
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

export function formatUnsafeRegexOutput(
  projectPath: string,
  result: UnsafeRegexSearchResult
): string {
  if (!result.issues.length) {
    return [
      'Поведение regex с вероятным catastrophic backtracking не обнаружено (AST-анализ ts/js).',
      `Протронуто файлов: ${result.filesScanned}.`,
      '',
      'Проверялись: вложенные квантификаторы и неоднозначные alternation-паттерны под квантификаторами.'
    ].join('\n')
  }

  const lines = result.issues.map((item, index) => {
    const rel = relative(projectPath, item.path).replace(/\\/g, '/')
    return [
      `[${index + 1}] ${rel}:${item.line}:${item.column}`,
      `    /${item.pattern}/`,
      `    ${item.message}`
    ].join('\n')
  })

  const footer = result.truncated
    ? `\n\n(Результаты обрезаны; просмотрено файлов: ${result.filesScanned})`
    : `\n\n(Просмотрено файлов: ${result.filesScanned})`

  return `Отчёт find_unsafe_regex (AST): ${result.issues.length}${result.truncated ? '+' : ''} находок\n${lines.join(
    '\n\n'
  )}${footer}`
}
