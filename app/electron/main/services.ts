import {
  access,
  appendFile,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile
} from 'fs/promises'
import { constants, watch as fsWatch } from 'fs'
import { dirname, join, resolve, sep } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import type { FileNode, TerminalResult } from '../../src/types'
import { applySearchReplace, FileEditError } from '../../shared/fileEdit'
import { readLargeFileQueued } from './largeFileQueue'
import { loadIgnorePatterns, shouldIgnorePath, clearIgnorePatternsCache } from './ignorePatterns'
import {
  FILE_SIZE_LIMIT_BYTES,
  FILE_PREVIEW_THRESHOLD_BYTES,
  FILE_PREVIEW_HEAD_TAIL_LINES,
  READ_DEFAULT_LINE_LIMIT,
  DEFAULT_COMMAND_TIMEOUT_SEC
} from '../../shared/constants'

const COMMAND_TIMEOUT_MS = DEFAULT_COMMAND_TIMEOUT_SEC * 1000
const MAX_COMMAND_LEN = 4096

const BLOCKED_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/i,
  /\brmdir\s+\/s\b/i,
  /\bdel\s+\/[sfq]/i,
  /\bformat\s+[a-z]:/i,
  /\bshutdown\b/i,
  /\brestart\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\b:\(\)\s*\{\s*:\|:&\s*\};:/,
  /\bwget\s+[^\n|]*\|\s*(sh|bash|powershell)/i,
  /\bcurl\s+[^\n|]*\|\s*(sh|bash|powershell)/i,
  /\bpowershell(?:\.exe)?\s+.*-(?:enc|encodedcommand)\b/i,
  /\breg\s+(add|delete)\b/i,
  /\bbcdedit\b/i,
  /\bdiskpart\b/i,
  /\btaskkill\s+\/(?:f|im)\s+.*(?:explorer|csrss|winlogon)/i,
  /\bchmod\s+[0-7]*777\b/i,
  /\bsudo\s+/i,
  /\bnet\s+user\b/i,
  /\bnet\s+localgroup\b/i
]

export function validateCommand(command: string): string | null {
  const trimmed = command.trim()
  if (!trimmed) return 'Пустая команда'
  if (trimmed.length > MAX_COMMAND_LEN) return 'Команда слишком длинная'
  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return 'Команда заблокирована из соображений безопасности'
  }
  return null
}

function spawnShell(command: string, cwd: string): ChildProcess {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', command], {
      cwd,
      windowsHide: true,
      shell: false
    })
  }

  return spawn('/bin/sh', ['-c', command], {
    cwd,
    shell: false
  })
}

const IGNORED = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  '.next',
  '__pycache__',
  '.venv',
  'venv'
])

export function isInsideProject(projectPath: string, targetPath: string): boolean {
  const root = resolve(projectPath).toLowerCase()
  const target = resolve(targetPath).toLowerCase()
  return target === root || target.startsWith(root + sep)
}

const FILE_TREE_CACHE_TTL_MS = 8_000

interface FileTreeCacheEntry {
  nodes: FileNode[]
  expiresAt: number
}

const fileTreeCache = new Map<string, FileTreeCacheEntry>()

export function invalidateFileTreeCache(dirPath?: string): void {
  if (dirPath) {
    for (const key of fileTreeCache.keys()) {
      if (key.startsWith(dirPath)) fileTreeCache.delete(key)
    }
    clearIgnorePatternsCache(dirPath)
  } else {
    fileTreeCache.clear()
    clearIgnorePatternsCache()
  }
}

const watchedDirs = new Set<string>()

export function watchProjectForCacheInvalidation(dirPath: string): void {
  if (watchedDirs.has(dirPath)) return
  watchedDirs.add(dirPath)
  try {
    fsWatch(dirPath, { recursive: true }, () => {
      invalidateFileTreeCache(dirPath)
    })
  } catch {
    // fs.watch may fail on some network drives or permission-restricted paths
  }
}

async function buildFileTreeRaw(
  dirPath: string,
  depth: number,
  maxDepth: number,
  rootPath?: string,
  ignoreRulesPromise?: Promise<any>
): Promise<FileNode[]> {
  if (depth > maxDepth) return []

  const entries = await readdir(dirPath, { withFileTypes: true })
  const nodes: FileNode[] = []

  // Загружаем ignore-правила один раз из корня проекта
  let ignoreRules: any = null
  if (depth === 0) {
    ignoreRules = await loadIgnorePatterns(dirPath)
  } else if (ignoreRulesPromise) {
    ignoreRules = await ignoreRulesPromise
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    // Пропускаем скрытые файлы и папки (кроме .codeviper)
    if (entry.name.startsWith('.') && entry.name !== '.codeviper') continue

    // Проверяем hardcoded ignored
    if (IGNORED.has(entry.name)) continue

    // Проверяем ignore-файлы (.gitignore, .claudeignore, .cursorignore)
    if (ignoreRules && shouldIgnorePath(entry.name, ignoreRules)) continue

    const fullPath = join(dirPath, entry.name)
    const node: FileNode = {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory()
    }

    if (entry.isDirectory()) {
      node.children = await buildFileTreeRaw(
        fullPath,
        depth + 1,
        maxDepth,
        rootPath,
        ignoreRulesPromise
      )
    }

    nodes.push(node)
  }

  return nodes
}

export async function buildFileTree(dirPath: string, depth = 0, maxDepth = 3): Promise<FileNode[]> {
  const cacheKey = `${dirPath}:${maxDepth}`
  if (depth === 0) {
    const cached = fileTreeCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return cached.nodes
    watchProjectForCacheInvalidation(dirPath)
  }

  // Загружаем ignore-правила заранее для использования в buildFileTreeRaw
  const ignoreRulesPromise = depth === 0 ? loadIgnorePatterns(dirPath) : undefined

  const nodes = await buildFileTreeRaw(dirPath, depth, maxDepth, dirPath, ignoreRulesPromise)

  if (depth === 0) {
    fileTreeCache.set(cacheKey, { nodes, expiresAt: Date.now() + FILE_TREE_CACHE_TTL_MS })
  }

  return nodes
}

export async function safeReadFile(projectPath: string, filePath: string): Promise<string> {
  const absPath = resolve(projectPath, filePath)
  if (!isInsideProject(projectPath, absPath)) {
    throw new Error('Доступ запрещён: файл вне проекта')
  }

  const info = await stat(absPath)
  if (!info.isFile()) throw new Error('Это не файл')
  if (info.size > FILE_SIZE_LIMIT_BYTES) throw new Error('Файл слишком большой (>500 KB)')

  return readFile(absPath, 'utf-8')
}

// LRU-кэш read_file / read_codeviper_file: ключ {path, offset, limit}, инвалидация по mtime
const READ_CACHE_MAX = 500
type ReadCacheEntry = { result: string; mtimeMs: number }
const readFileCache = new Map<string, ReadCacheEntry>()

function readCacheKey(filePath: string, offset: number, limit: number | undefined): string {
  return `${filePath}\0${offset}\0${limit ?? ''}`
}

function readCacheEvict(): void {
  if (readFileCache.size >= READ_CACHE_MAX) {
    readFileCache.delete(readFileCache.keys().next().value!)
  }
}

export function invalidateReadCache(filePath: string): void {
  for (const key of readFileCache.keys()) {
    if (key.startsWith(filePath + '\0')) readFileCache.delete(key)
  }
}

export async function safeReadFilePartial(
  projectPath: string,
  filePath: string,
  offset = 0,
  limit?: number
): Promise<string> {
  const absPath = resolve(projectPath, filePath)
  if (!isInsideProject(projectPath, absPath)) {
    throw new Error('Доступ запрещён: файл вне проекта')
  }

  const info = await stat(absPath)
  if (!info.isFile()) throw new Error('Это не файл')

  const isLarge = info.size > FILE_SIZE_LIMIT_BYTES

  // Большие файлы не кэшируем — они идут через worker
  if (isLarge) {
    return readLargeFileQueued(absPath, offset, limit ?? null, READ_DEFAULT_LINE_LIMIT)
  }

  const cacheKey = readCacheKey(absPath, offset, limit)
  const cached = readFileCache.get(cacheKey)
  if (cached && cached.mtimeMs === info.mtimeMs) {
    // Обновляем позицию в LRU
    readFileCache.delete(cacheKey)
    readFileCache.set(cacheKey, cached)
    return cached.result
  }

  const usePartial = offset > 0 || limit != null

  let result: string
  if (!usePartial && info.size > FILE_PREVIEW_THRESHOLD_BYTES) {
    const raw = await readFile(absPath, 'utf-8')
    const allLines = raw.split('\n')
    const totalLines = allLines.length
    const n = FILE_PREVIEW_HEAD_TAIL_LINES
    if (totalLines > n * 2) {
      const head = allLines.slice(0, n).join('\n')
      const tail = allLines.slice(totalLines - n).join('\n')
      const skipped = totalLines - n * 2
      result =
        `[Файл: ${absPath} | ${totalLines} строк, показаны первые ${n} и последние ${n}]\n` +
        head +
        `\n... (${skipped} строк обрезано) ...\n` +
        tail
    } else {
      result = raw
    }
  } else if (!usePartial) {
    result = await readFile(absPath, 'utf-8')
  } else {
    const raw = await readFile(absPath, 'utf-8')
    const allLines = raw.split('\n')
    const totalLines = allLines.length
    const from = Math.max(0, offset)
    const count = limit != null ? Math.max(1, limit) : READ_DEFAULT_LINE_LIMIT
    const to = Math.min(from + count, totalLines)
    const chunk = allLines.slice(from, to).join('\n')
    const remaining = totalLines - to
    const header = `[Файл: ${absPath} | строки ${from + 1}–${to} из ${totalLines}]`
    const footer =
      remaining > 0 ? `\n[Ещё ${remaining} строк. Читай дальше: offset=${to}]` : `\n[Конец файла]`
    result = `${header}\n${chunk}${footer}`
  }

  readCacheEvict()
  readFileCache.set(cacheKey, { result, mtimeMs: info.mtimeMs })
  return result
}

export async function safeWriteFile(
  projectPath: string,
  filePath: string,
  content: string
): Promise<void> {
  const absPath = resolve(projectPath, filePath)
  if (!isInsideProject(projectPath, absPath)) {
    throw new Error('Доступ запрещён: файл вне проекта')
  }

  const dir = dirname(absPath)
  if (!isInsideProject(projectPath, dir)) {
    throw new Error('Доступ запрещён: путь вне проекта')
  }

  await mkdir(dir, { recursive: true })
  await writeFile(absPath, content, 'utf-8')
  invalidateReadCache(absPath)
}

function assertPathInsideProject(projectPath: string, filePath: string, label = 'файл'): string {
  const absPath = resolve(projectPath, filePath)
  if (!isInsideProject(projectPath, absPath)) {
    throw new Error(`Доступ запрещён: ${label} вне проекта`)
  }
  return absPath
}

export async function safeCreateFile(
  projectPath: string,
  filePath: string,
  content: string
): Promise<void> {
  const absPath = assertPathInsideProject(projectPath, filePath)

  const dir = dirname(absPath)
  assertPathInsideProject(projectPath, dir, 'папка')

  try {
    await access(absPath, constants.F_OK)
    throw new Error('Файл уже существует — используйте edit_file или write_file')
  } catch (error) {
    if (error instanceof Error && error.message.includes('уже существует')) throw error
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') throw error
  }

  await mkdir(dir, { recursive: true })
  await writeFile(absPath, content, 'utf-8')
  invalidateReadCache(absPath)
}

export async function safeEditFile(
  projectPath: string,
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll = false
): Promise<number> {
  const content = await safeReadFile(projectPath, filePath)

  let result
  try {
    result = applySearchReplace(content, oldString, newString, replaceAll)
  } catch (error) {
    if (error instanceof FileEditError) throw error
    throw error
  }

  await safeWriteFile(projectPath, filePath, result.content)
  return result.replacements
}

export async function safeAppendFile(
  projectPath: string,
  filePath: string,
  content: string
): Promise<void> {
  const absPath = assertPathInsideProject(projectPath, filePath)

  try {
    await access(absPath, constants.F_OK)
  } catch {
    throw new Error('Файл не найден — используйте create_file для нового файла')
  }

  const info = await stat(absPath)
  if (!info.isFile()) throw new Error('Это не файл')
  if (info.size + Buffer.byteLength(content, 'utf-8') > FILE_SIZE_LIMIT_BYTES) {
    throw new Error('После добавления файл превысит лимит 500 KB')
  }

  await appendFile(absPath, content, 'utf-8')
  invalidateReadCache(absPath)
}

export async function safeDeleteFile(projectPath: string, filePath: string): Promise<void> {
  const absPath = assertPathInsideProject(projectPath, filePath)

  const info = await stat(absPath).catch(() => null)
  if (!info) throw new Error('Файл не найден')
  if (!info.isFile()) throw new Error('Это не файл (удаление папок не поддерживается)')

  await unlink(absPath)
}

export async function safeMoveFile(
  projectPath: string,
  fromPath: string,
  toPath: string
): Promise<void> {
  const absFrom = assertPathInsideProject(projectPath, fromPath, 'исходный файл')
  const absTo = assertPathInsideProject(projectPath, toPath, 'целевой файл')

  const info = await stat(absFrom).catch(() => null)
  if (!info) throw new Error('Исходный файл не найден')
  if (!info.isFile()) throw new Error('Это не файл (перенос папок не поддерживается)')

  const targetDir = dirname(absTo)
  assertPathInsideProject(projectPath, targetDir, 'целевая папка')

  const targetExists = await access(absTo, constants.F_OK).then(
    () => true,
    () => false
  )
  if (targetExists) throw new Error('Целевой файл уже существует')

  await mkdir(targetDir, { recursive: true })
  await rename(absFrom, absTo)
}

export async function safeCopyFile(
  projectPath: string,
  fromPath: string,
  toPath: string
): Promise<void> {
  const absFrom = assertPathInsideProject(projectPath, fromPath, 'исходный файл')
  const absTo = assertPathInsideProject(projectPath, toPath, 'целевой файл')

  const info = await stat(absFrom).catch(() => null)
  if (!info) throw new Error('Исходный файл не найден')
  if (!info.isFile()) throw new Error('Это не файл (копирование папок не поддерживается)')

  const targetDir = dirname(absTo)
  assertPathInsideProject(projectPath, targetDir, 'целевая папка')

  const targetExists = await access(toPath, constants.F_OK).then(
    () => true,
    () => false
  )
  if (targetExists) throw new Error('Целевой файл уже существует')

  await mkdir(targetDir, { recursive: true })
  await cp(absFrom, absTo, { force: false, errorOnExist: true })
}

export async function safeCopyFolder(
  projectPath: string,
  fromPath: string,
  toPath: string
): Promise<void> {
  const absFrom = assertPathInsideProject(projectPath, fromPath, 'исходная папка')
  const absTo = assertPathInsideProject(projectPath, toPath, 'целeвая папка')

  const info = await stat(absFrom).catch(() => null)
  if (!info) throw new Error('Исходная папка не найдена')
  if (!info.isDirectory()) throw new Error('Это не папка')

  const targetExists = await access(absTo, constants.F_OK).then(
    () => true,
    () => false
  )
  if (targetExists) throw new Error('Целевая папка уже существует')

  await mkdir(dirname(absTo), { recursive: true })
  await cp(absFrom, absTo, { recursive: true, force: false, errorOnExist: true })
}

export async function safeMoveFolder(
  projectPath: string,
  fromPath: string,
  toPath: string
): Promise<void> {
  const absFrom = assertPathInsideProject(projectPath, fromPath, 'исходная папка')
  const absTo = assertPathInsideProject(projectPath, toPath, 'целeвая папка')

  const info = await stat(absFrom).catch(() => null)
  if (!info) throw new Error('Исходная папка не найдена')
  if (!info.isDirectory()) throw new Error('Это не папка')

  const targetExists = await access(absTo, constants.F_OK).then(
    () => true,
    () => false
  )
  if (targetExists) throw new Error('Целевая папка уже существует')

  await mkdir(dirname(absTo), { recursive: true })
  await rename(absFrom, absTo)
}

function killProcessTree(child: ChildProcess): void {
  if (!child.pid) {
    child.kill()
    return
  }

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    return
  }

  child.kill('SIGTERM')
  setTimeout(() => {
    if (!child.killed) child.kill('SIGKILL')
  }, 1000)
}

export async function runCommand(
  cwd: string,
  command: string,
  timeoutMs = COMMAND_TIMEOUT_MS
): Promise<TerminalResult> {
  const blocked = validateCommand(command)
  if (blocked) {
    return {
      stdout: '',
      stderr: blocked,
      exitCode: 1
    }
  }

  return new Promise((resolvePromise) => {
    let settled = false
    let stdout = ''
    let stderr = ''

    const finish = (result: TerminalResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise(result)
    }

    const child = spawnShell(command, cwd)

    const timer = setTimeout(() => {
      killProcessTree(child)
      const timeoutMsg = `[CodeViper] Команда прервана: превышен таймаут ${timeoutMs / 1000} с`
      finish({
        stdout: stdout.slice(0, 20_000),
        stderr: `${stderr}\n${timeoutMsg}`.trim().slice(0, 20_000),
        exitCode: 124
      })
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('close', (code) => {
      finish({
        stdout: stdout.slice(0, 20_000),
        stderr: stderr.slice(0, 20_000),
        exitCode: code
      })
    })

    child.on('error', (error) => {
      finish({
        stdout: '',
        stderr: error.message,
        exitCode: 1
      })
    })
  })
}
