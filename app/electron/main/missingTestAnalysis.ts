import { statSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { basename, dirname, extname, join, relative, resolve } from 'path'
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

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const TEST_SUFFIXES = ['.test.ts', '.spec.ts', '.test.tsx', '.spec.tsx']
const CONFIG_PATTERNS = [
  /\.config\.[^.]+$/i,
  /(?:^|[\\/])(?:vite|vitest|jest|playwright|eslint|prettier|postcss|tailwind|webpack|rollup|typedoc)\.config\.[^.]+$/i,
  /(?:^|[\\/])electron\.vite\.config\.[^.]+$/i,
  /(?:^|[\\/])tsconfig(?:\.[^.]+)?\.json$/i
] as const

export const MAX_MISSING_TESTS = 50

export interface MissingTestIssue {
  path: string
  expectedTests: string[]
}

export interface MissingTestSearchResult {
  missing: MissingTestIssue[]
  truncated: boolean
  filesScanned: number
}

function isTestFile(filePath: string): boolean {
  return TEST_SUFFIXES.some((suffix) => filePath.toLowerCase().endsWith(suffix))
}

function isConfigLike(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  return CONFIG_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isSourceCandidate(filePath: string): boolean {
  const lower = filePath.toLowerCase()
  const ext = extname(lower)
  if (!SOURCE_EXTENSIONS.has(ext)) return false
  if (lower.endsWith('.d.ts')) return false
  if (isTestFile(lower)) return false
  if (isConfigLike(lower)) return false
  return true
}

function stripSourceExtension(filePath: string): string {
  return filePath.replace(/\.[^.]+$/, '')
}

function buildExpectedTests(projectRoot: string, absolutePath: string): string[] {
  const rel = relative(projectRoot, absolutePath).replace(/\\/g, '/')
  const withoutExt = stripSourceExtension(rel)
  const dir = dirname(withoutExt).replace(/\\/g, '/')
  const base = basename(withoutExt)
  const expected = new Set<string>()

  for (const suffix of TEST_SUFFIXES) {
    expected.add(`${withoutExt}${suffix.slice(0)}`)
    expected.add(`${dir === '.' ? 'tests' : `tests/${dir}`}/${base}${suffix}`)
  }

  return [...expected]
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

      if (!entry.isFile()) continue
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

export async function findMissingTests(
  projectPath: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<MissingTestSearchResult> {
  const maxResults = options?.maxResults ?? MAX_MISSING_TESTS
  const resolved = options?.subpath?.trim()
    ? resolve(projectPath, options.subpath.trim())
    : resolve(projectPath)

  let entryStat
  try {
    entryStat = await stat(resolved)
  } catch {
    return { missing: [], truncated: false, filesScanned: 0 }
  }

  if (entryStat.isFile()) {
    if (!isSourceCandidate(resolved)) return { missing: [], truncated: false, filesScanned: 0 }
    const expectedTests = buildExpectedTests(projectPath, resolved)
    const hasTest = expectedTests.some((candidate) => {
      try {
        return statSyncSafe(resolve(projectPath, candidate))
      } catch {
        return false
      }
    })
    return {
      missing: hasTest
        ? []
        : [{ path: relative(projectPath, resolved).replace(/\\/g, '/'), expectedTests }],
      truncated: false,
      filesScanned: 1
    }
  }

  const sourceFiles: string[] = []
  const knownTests = new Set<string>()

  const scanRoot = resolve(projectPath)
  const sourceRoot = resolved

  const filesScanned = await walkProjectFiles(
    scanRoot,
    async (filePath) => {
      const rel = relative(projectPath, filePath).replace(/\\/g, '/')
      if (isTestFile(rel)) {
        knownTests.add(rel)
      } else if (isSourceCandidate(rel) && filePath.startsWith(sourceRoot)) {
        sourceFiles.push(resolve(projectPath, rel))
      }
      return false
    },
    options?.onProgress
  )

  const missing: MissingTestIssue[] = []
  let truncated = false

  for (const filePath of sourceFiles.sort((a, b) => a.localeCompare(b))) {
    const expectedTests = buildExpectedTests(projectPath, filePath)
    const hasTest = expectedTests.some((candidate) => knownTests.has(candidate))
    if (hasTest) continue
    missing.push({
      path: relative(projectPath, filePath).replace(/\\/g, '/'),
      expectedTests
    })
    if (missing.length >= maxResults) {
      truncated = sourceFiles.length > missing.length
      break
    }
  }

  return { missing, truncated, filesScanned }
}

function statSyncSafe(filePath: string): boolean {
  try {
    const info = statSync(filePath)
    return info.isFile()
  } catch {
    return false
  }
}

export function formatMissingTestsOutput(
  _projectPath: string,
  result: MissingTestSearchResult
): string {
  if (!result.missing.length) {
    return [
      'Исходники без тестов не обнаружены.',
      `Просмотрено файлов: ${result.filesScanned}.`,
      '',
      'Проверялись пары `*.test.ts` / `*.spec.ts` рядом с исходником и зеркально в `tests/`.'
    ].join('\n')
  }

  const lines = result.missing.map((item, index) =>
    [`[${index + 1}] ${item.path}`, `    ожидается один из: ${item.expectedTests.join(', ')}`].join(
      '\n'
    )
  )

  return `Отчёт find_missing_tests: ${result.missing.length}${result.truncated ? '+' : ''} файлов без тестов\n${lines.join(
    '\n\n'
  )}\n\n(Просмотрено файлов: ${result.filesScanned})`
}
