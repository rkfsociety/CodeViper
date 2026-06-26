import { spawn, type ChildProcess } from 'child_process'
import type { TerminalResult } from '../../src/types'
import {
  DEFAULT_COMMAND_TIMEOUT_SEC,
  COMMAND_OUTPUT_BUFFER_LIMIT_BYTES
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

/** Раскодирует \\xNN, \\uNNNN и %NN перед проверкой блок-листа. */
export function normalizeCommand(cmd: string): string {
  let s = cmd
  s = s.replace(/\\x([0-9a-fA-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
  s = s.replace(/\\u([0-9a-fA-F]{4})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
  try {
    s = decodeURIComponent(s)
  } catch {
    // malformed URI sequence — оставляем как есть
  }
  return s
}

export function validateCommand(
  command: string,
  extraBlocklist?: string[],
  extraAllowlist?: string[]
): string | null {
  const trimmed = command.trim()
  if (!trimmed) return 'Пустая команда'
  if (trimmed.length > MAX_COMMAND_LEN) return 'Команда слишком длинная'

  const normalized = normalizeCommand(trimmed)

  if (extraAllowlist) {
    for (const raw of extraAllowlist) {
      const pat = raw.trim()
      if (!pat) continue
      try {
        if (new RegExp(pat, 'i').test(normalized)) return null
      } catch {
        if (normalized.toLowerCase().includes(pat.toLowerCase())) return null
      }
    }
  }

  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return 'Команда заблокирована из соображений безопасности'
  }
  if (extraBlocklist) {
    for (const raw of extraBlocklist) {
      const pat = raw.trim()
      if (!pat) continue
      try {
        if (new RegExp(pat, 'i').test(normalized))
          return `Команда заблокирована пользовательским правилом: ${pat}`
      } catch {
        if (normalized.toLowerCase().includes(pat.toLowerCase()))
          return `Команда заблокирована пользовательским правилом: ${pat}`
      }
    }
  }
  return null
}

function spawnShell(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env
): ChildProcess {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/d', '/s', '/c', command], {
      cwd,
      windowsHide: true,
      shell: false,
      env
    })
  }

  return spawn('/bin/sh', ['-c', command], {
    cwd,
    shell: false,
    env
  })
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
  timeoutMs = COMMAND_TIMEOUT_MS,
  extraBlocklist?: string[],
  env: NodeJS.ProcessEnv = process.env,
  extraAllowlist?: string[]
): Promise<TerminalResult> {
  const blocked = validateCommand(command, extraBlocklist, extraAllowlist)
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

    const child = spawnShell(command, cwd, env)
    let outputBytes = 0

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
      outputBytes += chunk.byteLength
      if (outputBytes > COMMAND_OUTPUT_BUFFER_LIMIT_BYTES) {
        killProcessTree(child)
        const limitMsg = `[CodeViper] Вывод обрезан: превышен лимит ${COMMAND_OUTPUT_BUFFER_LIMIT_BYTES / 1024 / 1024} МБ`
        finish({
          stdout: stdout.slice(0, 20_000),
          stderr: `${stderr}\n${limitMsg}`.trim().slice(0, 20_000),
          exitCode: 1
        })
        return
      }
      stdout += chunk.toString()
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength
      if (outputBytes > COMMAND_OUTPUT_BUFFER_LIMIT_BYTES) {
        killProcessTree(child)
        const limitMsg = `[CodeViper] Вывод обрезан: превышен лимит ${COMMAND_OUTPUT_BUFFER_LIMIT_BYTES / 1024 / 1024} МБ`
        finish({
          stdout: stdout.slice(0, 20_000),
          stderr: `${stderr}\n${limitMsg}`.trim().slice(0, 20_000),
          exitCode: 1
        })
        return
      }
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
