import { readFile, readdir, stat } from 'fs/promises'
import { extname, join, relative, resolve } from 'path'
import { FILE_SIZE_LIMIT_BYTES } from '../../shared/constants'
import { loadIgnorePatterns, shouldIgnorePath } from './ignorePatterns'
import { MAX_WALK_FILES } from './fileSearch'

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

const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.mts': 'TypeScript',
  '.cts': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.pyw': 'Python',
  '.java': 'Java',
  '.cs': 'C#',
  '.go': 'Go',
  '.rs': 'Rust',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.cxx': 'C++',
  '.c': 'C',
  '.h': 'C/C++ Header',
  '.hpp': 'C++ Header',
  '.md': 'Markdown',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.less': 'LESS',
  '.html': 'HTML',
  '.htm': 'HTML',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML',
  '.xml': 'XML',
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.ps1': 'PowerShell',
  '.bat': 'Batch',
  '.cmd': 'Batch'
}

const COMPLEXITY_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.pyw',
  '.java',
  '.cs',
  '.go',
  '.rs',
  '.cpp',
  '.cc',
  '.cxx',
  '.c',
  '.h',
  '.hpp',
  '.vue',
  '.svelte'
])

const METRICS_EXTENSIONS = new Set(Object.keys(EXT_TO_LANGUAGE))

export interface ProjectMetricsLineCounts {
  total: number
  code: number
  blank: number
  comment: number
}

export interface ProjectMetricsFileStat {
  relativePath: string
  language: string
  totalLines: number
  codeLines: number
  blankLines: number
  commentLines: number
  complexity: number
}

export interface ProjectMetricsLanguageStat {
  language: string
  files: number
  totalLines: number
  codeLines: number
  complexity: number
}

export interface ProjectMetricsResult {
  scopePath: string
  filesScanned: number
  truncated: boolean
  skippedLarge: number
  skippedBinary: number
  totalFiles: number
  totalLines: number
  codeLines: number
  blankLines: number
  commentLines: number
  totalComplexity: number
  avgComplexity: number
  maxComplexity: number
  maxComplexityFile: string | null
  languages: ProjectMetricsLanguageStat[]
  largestFiles: ProjectMetricsFileStat[]
}

function languageForPath(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase()
  return METRICS_EXTENSIONS.has(ext) ? (EXT_TO_LANGUAGE[ext] ?? 'Other') : null
}

function countLines(content: string): ProjectMetricsLineCounts {
  const lines = content.split('\n')
  let blank = 0
  let comment = 0
  let code = 0
  let inBlockComment = false

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      blank += 1
      continue
    }

    if (inBlockComment) {
      comment += 1
      if (line.includes('*/')) inBlockComment = false
      continue
    }

    if (line.startsWith('/*')) {
      comment += 1
      if (!line.includes('*/')) inBlockComment = true
      continue
    }

    if (
      line.startsWith('//') ||
      line.startsWith('#') ||
      line.startsWith('--') ||
      line.startsWith('<!--')
    ) {
      comment += 1
      continue
    }

    code += 1
  }

  return {
    total: lines.length,
    code,
    blank,
    comment
  }
}

function estimateComplexity(content: string): number {
  let complexity = 1
  const patterns = [
    /\bif\b/g,
    /\belse\s+if\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /&&/g,
    /\|\|/g,
    /\?/g
  ]
  for (const pattern of patterns) {
    const matches = content.match(pattern)
    if (matches) complexity += matches.length
  }
  return complexity
}

function resolveScopePath(projectPath: string, subpath?: string): string {
  const trimmed = subpath?.trim()
  if (!trimmed) return resolve(projectPath)
  return resolve(projectPath, trimmed)
}

async function walkMetricsFiles(
  root: string,
  startDir: string,
  onFile: (absolutePath: string) => Promise<boolean | void>,
  onProgress?: (scanned: number) => void
): Promise<{ scanned: number; truncated: boolean }> {
  let visited = 0
  let truncated = false
  const ignoreRules = await loadIgnorePatterns(root)

  async function walk(dir: string): Promise<boolean> {
    if (visited >= MAX_WALK_FILES) {
      truncated = true
      return true
    }

    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return false
    }

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (visited >= MAX_WALK_FILES) {
        truncated = true
        return true
      }
      if (entry.name.startsWith('.') && entry.name !== '.codeviper') continue
      if (IGNORED_DIRS.has(entry.name)) continue
      if (shouldIgnorePath(entry.name, ignoreRules)) continue

      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        const stop = await walk(fullPath)
        if (stop) return true
        continue
      }

      if (!entry.isFile()) continue
      const language = languageForPath(fullPath)
      if (!language) continue

      visited += 1
      if (onProgress && visited % 25 === 0) onProgress(visited)
      const stop = await onFile(fullPath)
      if (stop) return true
    }

    return false
  }

  await walk(startDir)
  return { scanned: visited, truncated }
}

async function analyzeMetricsFile(
  root: string,
  filePath: string
): Promise<ProjectMetricsFileStat | 'large' | 'binary' | null> {
  let info
  try {
    info = await stat(filePath)
  } catch {
    return null
  }
  if (!info.isFile()) return null

  const language = languageForPath(filePath)
  if (!language) return null
  if (info.size > FILE_SIZE_LIMIT_BYTES) return 'large'

  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    return null
  }
  if (content.includes('\0')) return 'binary'

  const lines = countLines(content)
  const ext = extname(filePath).toLowerCase()
  const complexity = COMPLEXITY_EXTENSIONS.has(ext) ? estimateComplexity(content) : 0

  return {
    relativePath: relative(root, filePath).replace(/\\/g, '/'),
    language,
    totalLines: lines.total,
    codeLines: lines.code,
    blankLines: lines.blank,
    commentLines: lines.comment,
    complexity
  }
}

function aggregateLanguages(files: ProjectMetricsFileStat[]): ProjectMetricsLanguageStat[] {
  const map = new Map<string, ProjectMetricsLanguageStat>()
  for (const file of files) {
    const prev = map.get(file.language) ?? {
      language: file.language,
      files: 0,
      totalLines: 0,
      codeLines: 0,
      complexity: 0
    }
    prev.files += 1
    prev.totalLines += file.totalLines
    prev.codeLines += file.codeLines
    prev.complexity += file.complexity
    map.set(file.language, prev)
  }
  return [...map.values()].sort(
    (a, b) => b.codeLines - a.codeLines || a.language.localeCompare(b.language, 'ru')
  )
}

export async function buildProjectMetrics(
  projectPath: string,
  options?: { subpath?: string; onProgress?: (scanned: number) => void }
): Promise<ProjectMetricsResult> {
  const scopePath = resolveScopePath(projectPath, options?.subpath)
  const files: ProjectMetricsFileStat[] = []
  let skippedLarge = 0
  let skippedBinary = 0

  let entryStat
  try {
    entryStat = await stat(scopePath)
  } catch {
    return {
      scopePath,
      filesScanned: 0,
      truncated: false,
      skippedLarge: 0,
      skippedBinary: 0,
      totalFiles: 0,
      totalLines: 0,
      codeLines: 0,
      blankLines: 0,
      commentLines: 0,
      totalComplexity: 0,
      avgComplexity: 0,
      maxComplexity: 0,
      maxComplexityFile: null,
      languages: [],
      largestFiles: []
    }
  }

  const collect = async (filePath: string) => {
    const statResult = await analyzeMetricsFile(projectPath, filePath)
    if (statResult === 'large') {
      skippedLarge += 1
      return false
    }
    if (statResult === 'binary') {
      skippedBinary += 1
      return false
    }
    if (statResult) files.push(statResult)
    return false
  }

  let filesScanned = 0
  let truncated = false

  if (entryStat.isFile()) {
    const statResult = await analyzeMetricsFile(projectPath, scopePath)
    if (statResult === 'large') skippedLarge = 1
    else if (statResult === 'binary') skippedBinary = 1
    else if (statResult) {
      files.push(statResult)
      filesScanned = 1
    }
  } else {
    const walkResult = await walkMetricsFiles(projectPath, scopePath, collect, options?.onProgress)
    filesScanned = walkResult.scanned
    truncated = walkResult.truncated
  }

  const totalLines = files.reduce((sum, file) => sum + file.totalLines, 0)
  const codeLines = files.reduce((sum, file) => sum + file.codeLines, 0)
  const blankLines = files.reduce((sum, file) => sum + file.blankLines, 0)
  const commentLines = files.reduce((sum, file) => sum + file.commentLines, 0)
  const totalComplexity = files.reduce((sum, file) => sum + file.complexity, 0)
  const complexityFiles = files.filter((file) => file.complexity > 0)
  const avgComplexity = complexityFiles.length > 0 ? totalComplexity / complexityFiles.length : 0

  let maxComplexity = 0
  let maxComplexityFile: string | null = null
  for (const file of files) {
    if (file.complexity > maxComplexity) {
      maxComplexity = file.complexity
      maxComplexityFile = file.relativePath
    }
  }

  const largestFiles = [...files]
    .sort((a, b) => b.codeLines - a.codeLines || a.relativePath.localeCompare(b.relativePath))
    .slice(0, 8)

  return {
    scopePath,
    filesScanned,
    truncated,
    skippedLarge,
    skippedBinary,
    totalFiles: files.length,
    totalLines,
    codeLines,
    blankLines,
    commentLines,
    totalComplexity,
    avgComplexity,
    maxComplexity,
    maxComplexityFile,
    languages: aggregateLanguages(files),
    largestFiles
  }
}

function pct(part: number, total: number): string {
  if (total <= 0) return '0%'
  return `${Math.round((part / total) * 100)}%`
}

export function formatProjectMetrics(projectPath: string, result: ProjectMetricsResult): string {
  const scope = result.scopePath.replace(/\\/g, '/')
  const root = projectPath.replace(/\\/g, '/').replace(/\/$/, '')
  const scopeLabel = scope.startsWith(root) ? scope.slice(root.length + 1) || '.' : scope

  const lines: string[] = [
    '# Метрики проекта',
    '',
    `**Область:** \`${scopeLabel}\``,
    `**Файлов учтено:** ${result.totalFiles}`,
    `**Просмотрено:** ${result.filesScanned}${result.truncated ? ` (лимит ${MAX_WALK_FILES}+)` : ''}`,
    ...(result.skippedLarge ? [`**Пропущено больших:** ${result.skippedLarge}`] : []),
    ...(result.skippedBinary ? [`**Пропущено бинарных:** ${result.skippedBinary}`] : []),
    '',
    '## Сводка',
    '',
    '| Метрика | Значение |',
    '| --- | ---: |',
    `| Строк (всего) | ${result.totalLines} |`,
    `| Строк кода | ${result.codeLines} |`,
    `| Пустых строк | ${result.blankLines} |`,
    `| Комментариев (оценка) | ${result.commentLines} |`,
    `| Сложность (сумма) | ${result.totalComplexity} |`,
    `| Сложность (средняя) | ${result.avgComplexity.toFixed(1)} |`,
    `| Сложность (макс.) | ${result.maxComplexity}${result.maxComplexityFile ? ` (\`${result.maxComplexityFile}\`)` : ''} |`
  ]

  if (result.languages.length > 0) {
    lines.push(
      '',
      '## Языки',
      '',
      '| Язык | Файлов | LOC | Код | Сложность | Доля |',
      '| --- | ---: | ---: | ---: | ---: | ---: |'
    )
    for (const lang of result.languages) {
      lines.push(
        `| ${lang.language} | ${lang.files} | ${lang.totalLines} | ${lang.codeLines} | ${lang.complexity} | ${pct(lang.codeLines, result.codeLines)} |`
      )
    }
  }

  if (result.largestFiles.length > 0) {
    lines.push(
      '',
      '## Крупнейшие файлы',
      '',
      '| Файл | LOC | Код | Сложность |',
      '| --- | ---: | ---: | ---: |'
    )
    for (const file of result.largestFiles) {
      lines.push(
        `| \`${file.relativePath}\` | ${file.totalLines} | ${file.codeLines} | ${file.complexity || '—'} |`
      )
    }
  }

  return lines.join('\n')
}
