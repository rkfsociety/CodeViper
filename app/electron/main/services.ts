import { access, appendFile, mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises'
import { constants } from 'fs'
import { dirname, join, resolve, sep } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import type { FileNode, TerminalResult } from '../../src/types'
import { applySearchReplace, FileEditError } from '../../shared/fileEdit'

const COMMAND_TIMEOUT_MS = 120_000
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

export async function buildFileTree(dirPath: string, depth = 0, maxDepth = 3): Promise<FileNode[]> {
  if (depth > maxDepth) return []

  const entries = await readdir(dirPath, { withFileTypes: true })
  const nodes: FileNode[] = []

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || IGNORED.has(entry.name)) continue

    const fullPath = join(dirPath, entry.name)
    const node: FileNode = {
      name: entry.name,
      path: fullPath,
      isDirectory: entry.isDirectory()
    }

    if (entry.isDirectory()) {
      node.children = await buildFileTree(fullPath, depth + 1, maxDepth)
    }

    nodes.push(node)
  }

  return nodes
}

export async function safeReadFile(projectPath: string, filePath: string): Promise<string> {
  if (!isInsideProject(projectPath, filePath)) {
    throw new Error('Доступ запрещён: файл вне проекта')
  }

  const info = await stat(filePath)
  if (!info.isFile()) throw new Error('Это не файл')
  if (info.size > 512_000) throw new Error('Файл слишком большой (>500 KB)')

  return readFile(filePath, 'utf-8')
}

export async function safeWriteFile(
  projectPath: string,
  filePath: string,
  content: string
): Promise<void> {
  if (!isInsideProject(projectPath, filePath)) {
    throw new Error('Доступ запрещён: файл вне проекта')
  }

  const dir = dirname(filePath)
  if (!isInsideProject(projectPath, dir)) {
    throw new Error('Доступ запрещён: путь вне проекта')
  }

  await mkdir(dir, { recursive: true })
  await writeFile(filePath, content, 'utf-8')
}

function assertPathInsideProject(projectPath: string, filePath: string, label = 'файл'): void {
  if (!isInsideProject(projectPath, filePath)) {
    throw new Error(`Доступ запрещён: ${label} вне проекта`)
  }
}

export async function safeCreateFile(
  projectPath: string,
  filePath: string,
  content: string
): Promise<void> {
  assertPathInsideProject(projectPath, filePath)

  const dir = dirname(filePath)
  assertPathInsideProject(projectPath, dir, 'папка')

  try {
    await access(filePath, constants.F_OK)
    throw new Error('Файл уже существует — используйте edit_file или write_file')
  } catch (error) {
    if (error instanceof Error && error.message.includes('уже существует')) throw error
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') throw error
  }

  await mkdir(dir, { recursive: true })
  await writeFile(filePath, content, 'utf-8')
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
  assertPathInsideProject(projectPath, filePath)

  try {
    await access(filePath, constants.F_OK)
  } catch {
    throw new Error('Файл не найден — используйте create_file для нового файла')
  }

  const info = await stat(filePath)
  if (!info.isFile()) throw new Error('Это не файл')
  if (info.size + Buffer.byteLength(content, 'utf-8') > 512_000) {
    throw new Error('После добавления файл превысит лимит 500 KB')
  }

  await appendFile(filePath, content, 'utf-8')
}

export async function safeDeleteFile(projectPath: string, filePath: string): Promise<void> {
  assertPathInsideProject(projectPath, filePath)

  const info = await stat(filePath).catch(() => null)
  if (!info) throw new Error('Файл не найден')
  if (!info.isFile()) throw new Error('Это не файл (удаление папок не поддерживается)')

  await unlink(filePath)
}

export async function safeMoveFile(
  projectPath: string,
  fromPath: string,
  toPath: string
): Promise<void> {
  assertPathInsideProject(projectPath, fromPath, 'исходный файл')
  assertPathInsideProject(projectPath, toPath, 'целевой файл')

  const info = await stat(fromPath).catch(() => null)
  if (!info) throw new Error('Исходный файл не найден')
  if (!info.isFile()) throw new Error('Это не файл (перенос папок не поддерживается)')

  const targetDir = dirname(toPath)
  assertPathInsideProject(projectPath, targetDir, 'целевая папка')

  const targetExists = await access(toPath, constants.F_OK).then(
    () => true,
    () => false
  )
  if (targetExists) throw new Error('Целевой файл уже существует')

  await mkdir(targetDir, { recursive: true })
  await rename(fromPath, toPath)
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
