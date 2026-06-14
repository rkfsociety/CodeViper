import { mkdir, readdir, readFile, writeFile, stat } from 'fs/promises'
import { dirname, join, resolve, sep } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import type { FileNode, TerminalResult } from '../../src/types'

const COMMAND_TIMEOUT_MS = 120_000

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

export async function buildFileTree(dirPath: string, depth = 0): Promise<FileNode[]> {
  if (depth > 3) return []

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
      node.children = await buildFileTree(fullPath, depth + 1)
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
  const blocked = /\b(rm\s+-rf|format\s+[a-z]:|del\s+\/[sf]|shutdown|restart)\b/i
  if (blocked.test(command)) {
    return {
      stdout: '',
      stderr: 'Команда заблокирована из соображений безопасности',
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

    const child = spawn(command, [], {
      cwd,
      shell: true,
      windowsHide: true
    })

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
