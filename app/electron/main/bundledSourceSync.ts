import { spawn } from 'child_process'
import { appendFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { BUNDLED_SOURCE_DIR_NAME } from '../../shared/constants'

export interface BundledSourceSyncResult {
  updated: boolean
  localHead?: string
  error?: string
}

export interface GitRunResult {
  code: number
  stdout: string
  stderr: string
}

type GitRunner = (cwd: string, args: string[]) => Promise<GitRunResult>

const GIT_TIMEOUT_MS = 60_000

let gitRunnerOverride: GitRunner | null = null

/** Только для unit-тестов — подмена вызовов git. */
export function setGitRunnerForTests(runner: GitRunner | null): void {
  gitRunnerOverride = runner
}

function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

async function logBundledSourceSync(
  message: string,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    const dir = logsDir()
    await mkdir(dir, { recursive: true })
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'bundled-source-sync',
        message,
        ...extra
      }) + '\n'
    await appendFile(join(dir, `bundled-source-${dateStamp()}.ndjson`), line, 'utf8')
  } catch {
    /* лог необязателен */
  }
}

function defaultRunGit(cwd: string, args: string[]): Promise<GitRunResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (code: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    }

    const timer = setTimeout(() => {
      child.kill()
      finish(1)
    }, GIT_TIMEOUT_MS)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => finish(code ?? 1))
    child.on('error', () => finish(1))
  })
}

function runGit(cwd: string, args: string[]): Promise<GitRunResult> {
  if (gitRunnerOverride) return gitRunnerOverride(cwd, args)
  return defaultRunGit(cwd, args)
}

/** Абсолютный путь к клону: %APPDATA%/CodeViper/source */
export function getBundledSourceRoot(): string {
  return join(app.getPath('userData'), BUNDLED_SOURCE_DIR_NAME)
}

/** git pull --ff-only в клоне; без pull если нет .git */
export async function syncBundledSource(): Promise<BundledSourceSyncResult> {
  const root = getBundledSourceRoot()

  if (!existsSync(join(root, '.git'))) {
    await logBundledSourceSync('skip: no git clone', { root })
    return { updated: false }
  }

  const before = await runGit(root, ['rev-parse', 'HEAD'])
  const headBefore = before.stdout.trim()

  const pull = await runGit(root, ['pull', '--ff-only'])
  if (pull.code !== 0) {
    const error = (pull.stderr || pull.stdout || 'git pull --ff-only failed').trim()
    await logBundledSourceSync('pull failed', { root, error, code: pull.code })
    return {
      updated: false,
      localHead: headBefore || undefined,
      error
    }
  }

  const after = await runGit(root, ['rev-parse', 'HEAD'])
  const localHead = after.stdout.trim()
  const updated = Boolean(localHead && headBefore && localHead !== headBefore)

  await logBundledSourceSync('sync complete', { root, updated, localHead })
  return { updated, localHead: localHead || undefined }
}
