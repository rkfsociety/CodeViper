import { existsSync, statSync } from 'fs'
import { readFile, readdir, stat } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, extname, join, relative, resolve } from 'path'
import type * as Ts from 'typescript'
import { MAX_WALK_FILES } from './fileSearch'
import { readTsConfigPathAliases, type TsConfigPathAlias } from './symbolIndex'

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
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']
const INDEX_FILES = ['index.ts', 'index.tsx', 'index.js', 'index.jsx', 'index.mjs']

export const MAX_IMPORT_ISSUES = 50

export interface ImportIssue {
  path: string
  line: number
  column: number
  specifier: string
  kind: 'missing_file' | 'missing_alias'
  message: string
}

export interface ImportIssueSearchResult {
  issues: ImportIssue[]
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

function collectImportSpecifiers(
  sourceFile: Ts.SourceFile
): Array<{ specifier: string; node: Ts.Node }> {
  const ts = getTs()
  const items: Array<{ specifier: string; node: Ts.Node }> = []

  function visit(node: Ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      items.push({ specifier: node.moduleSpecifier.text, node: node.moduleSpecifier })
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      items.push({ specifier: node.arguments[0].text, node: node.arguments[0] })
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return items
}

function hasExactFile(target: string): boolean {
  try {
    return existsSync(target) && statSync(target).isFile()
  } catch {
    return false
  }
}

function resolveRelativeImport(
  fromFile: string,
  specifier: string,
  projectRoot: string
): string | null {
  const base = resolve(dirname(fromFile), specifier)
  const candidates = [base]
  for (const ext of RESOLVE_EXTENSIONS) candidates.push(`${base}${ext}`)
  for (const indexFile of INDEX_FILES) candidates.push(join(base, indexFile))

  const root = resolve(projectRoot)
  for (const candidate of candidates) {
    const normalized = resolve(candidate)
    if (!normalized.startsWith(root)) continue
    if (hasExactFile(normalized)) return normalized
  }
  return null
}

function expandAliasTargets(alias: TsConfigPathAlias, specifier: string): string[] {
  const star = alias.pattern.indexOf('*')
  if (star < 0) {
    return alias.targets.map((target) => resolve(alias.baseUrl, target))
  }
  const prefix = alias.pattern.slice(0, star)
  const suffix = alias.pattern.slice(star + 1)
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return []
  const middle = specifier.slice(prefix.length, specifier.length - suffix.length)
  return alias.targets.map((target) => resolve(alias.baseUrl, target.replace('*', middle)))
}

function aliasMatchesSpecifier(alias: TsConfigPathAlias, specifier: string): boolean {
  const star = alias.pattern.indexOf('*')
  if (star < 0) return alias.pattern === specifier

  const prefix = alias.pattern.slice(0, star)
  const suffix = alias.pattern.slice(star + 1)
  return specifier.startsWith(prefix) && specifier.endsWith(suffix)
}

function resolveAliasedImport(
  projectRoot: string,
  specifier: string,
  aliases: TsConfigPathAlias[]
): string | null {
  const root = resolve(projectRoot)
  for (const alias of aliases) {
    const expanded = expandAliasTargets(alias, specifier)
    for (const base of expanded) {
      const candidates = [base]
      for (const ext of RESOLVE_EXTENSIONS) candidates.push(`${base}${ext}`)
      for (const indexFile of INDEX_FILES) candidates.push(join(base, indexFile))
      for (const candidate of candidates) {
        const normalized = resolve(candidate)
        if (!normalized.startsWith(root)) continue
        if (hasExactFile(normalized)) return normalized
      }
    }
  }
  return null
}

function resolveNodeModuleImport(fromFile: string, specifier: string): string | null {
  try {
    const localRequire = createRequire(fromFile)
    return localRequire.resolve(specifier)
  } catch {
    return null
  }
}

function looksLikeAlias(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:')
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

async function analyzeFile(
  filePath: string,
  projectRoot: string,
  aliases: TsConfigPathAlias[]
): Promise<ImportIssue[]> {
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

  const issues: ImportIssue[] = []
  for (const { specifier, node } of collectImportSpecifiers(sourceFile)) {
    if (specifier.startsWith('.')) {
      if (!resolveRelativeImport(filePath, specifier, projectRoot)) {
        const pos = positionOf(sourceFile, node)
        issues.push({
          path: filePath,
          line: pos.line,
          column: pos.column,
          specifier,
          kind: 'missing_file',
          message: 'Относительный import/require указывает на несуществующий файл'
        })
      }
      continue
    }

    if (looksLikeAlias(specifier)) {
      const matchesConfiguredAlias = aliases.some((alias) =>
        aliasMatchesSpecifier(alias, specifier)
      )
      if (!matchesConfiguredAlias && resolveNodeModuleImport(filePath, specifier)) {
        continue
      }
      const resolved = resolveAliasedImport(projectRoot, specifier, aliases)
      if (!resolved) {
        const pos = positionOf(sourceFile, node)
        issues.push({
          path: filePath,
          line: pos.line,
          column: pos.column,
          specifier,
          kind: matchesConfiguredAlias ? 'missing_file' : 'missing_alias',
          message: matchesConfiguredAlias
            ? 'Aliased import не удалось разрешить через tsconfig paths'
            : 'Bare import не найден как пакет и не совпадает с tsconfig paths alias'
        })
      }
    }
  }

  return issues
}

const SEVERITY_ORDER: Record<ImportIssue['kind'], number> = {
  missing_file: 0,
  missing_alias: 1
}

export async function findImportIssues(
  projectPath: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<ImportIssueSearchResult> {
  const maxResults = options?.maxResults ?? MAX_IMPORT_ISSUES
  const resolved = options?.subpath?.trim()
    ? resolve(projectPath, options.subpath.trim())
    : resolve(projectPath)
  const aliases = readTsConfigPathAliases(projectPath)

  let entryStat
  try {
    entryStat = await stat(resolved)
  } catch {
    return { issues: [], truncated: false, filesScanned: 0 }
  }

  if (entryStat.isFile()) {
    if (!isAnalyzableFile(resolved)) return { issues: [], truncated: false, filesScanned: 0 }
    const found = await analyzeFile(resolved, projectPath, aliases)
    return {
      issues: found.slice(0, maxResults),
      truncated: found.length > maxResults,
      filesScanned: 1
    }
  }

  const issues: ImportIssue[] = []
  let truncated = false

  const filesScanned = await walkProjectFiles(
    resolved,
    async (filePath) => {
      if (issues.length >= maxResults) {
        truncated = true
        return true
      }
      const found = await analyzeFile(filePath, projectPath, aliases)
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

  issues.sort((a, b) => {
    const kind = SEVERITY_ORDER[a.kind] - SEVERITY_ORDER[b.kind]
    if (kind !== 0) return kind
    if (a.path !== b.path) return a.path.localeCompare(b.path)
    return a.line - b.line
  })

  return { issues, truncated, filesScanned }
}

export function formatImportIssuesOutput(
  projectPath: string,
  result: ImportIssueSearchResult
): string {
  if (!result.issues.length) {
    return [
      'Проблемы с import/require не обнаружены (AST-анализ ts/js).',
      `Просмотрено файлов: ${result.filesScanned}.`,
      '',
      'Проверялись: относительные пути, tsconfig paths alias и существование целевых файлов.'
    ].join('\n')
  }

  const lines = result.issues.map((issue, index) => {
    const rel = relative(projectPath, issue.path).replace(/\\/g, '/')
    return [
      `[${index + 1}] ${rel}:${issue.line}:${issue.column}`,
      `    ${issue.specifier}`,
      `    ${issue.message}`
    ].join('\n')
  })

  const footer = result.truncated
    ? `\n\n(Результаты обрезаны; просмотрено файлов: ${result.filesScanned})`
    : `\n\n(Просмотрено файлов: ${result.filesScanned})`

  return `Отчёт find_import_issues (AST): ${result.issues.length}${result.truncated ? '+' : ''} находок\n${lines.join(
    '\n\n'
  )}${footer}`
}
