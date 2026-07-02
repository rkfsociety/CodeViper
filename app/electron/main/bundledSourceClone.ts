import { spawn } from 'child_process'
import { appendFile, mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import { Mutex } from 'async-mutex'
import {
  BUNDLED_SOURCE_DIR_NAME,
  CODEVIPER_GITHUB_CLONE_URL,
  CODEVIPER_RUNTIME_SYNC_BRANCH
} from '../../shared/constants'
import { loadSettings, saveSettings } from './settings'
import { cliSpawnBase } from './windowsGitEnv'
import type { GitRunResult } from './bundledGit'
import { getBundledSourceRoot } from './bundledSourcePaths'

type GitRunner = (cwd: string, args: string[]) => Promise<GitRunResult>

const GIT_TIMEOUT_MS = 60_000
/** Первый clone репозитория может занять больше минуты на медленной сети */
const GIT_CLONE_TIMEOUT_MS = 300_000

let gitRunnerOverride: GitRunner | null = null
const ensureCloneMutex = new Mutex()
/** Не повторять git clone чаще раза в 5 минут после неудачи */
const CLONE_RETRY_COOLDOWN_MS = 5 * 60 * 1000
let lastCloneFailureAt = 0

/** Только для unit-тестов — сброс cooldown после неудачного clone. */
export function resetBundledSourceCloneStateForTests(): void {
  lastCloneFailureAt = 0
}

/** Только для unit-тестов — подмена вызовов git (clone). */
export function setBundledSourceCloneGitRunnerForTests(runner: GitRunner | null): void {
  gitRunnerOverride = runner
}

function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

async function logBundledSourceClone(
  message: string,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    const dir = logsDir()
    await mkdir(dir, { recursive: true })
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        event: 'bundled-source-clone',
        message,
        ...extra
      }) + '\n'
    await appendFile(join(dir, `bundled-source-${dateStamp()}.ndjson`), line, 'utf8')
  } catch {
    /* лог необязателен */
  }
}

function defaultRunGit(
  cwd: string,
  args: string[],
  timeoutMs = GIT_TIMEOUT_MS
): Promise<GitRunResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, cliSpawnBase(cwd))
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
    }, timeoutMs)

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

function runGit(cwd: string, args: string[], timeoutMs = GIT_TIMEOUT_MS): Promise<GitRunResult> {
  if (gitRunnerOverride) return gitRunnerOverride(cwd, args)
  return defaultRunGit(cwd, args, timeoutMs)
}

async function persistGitRepoRootIfUnset(root: string): Promise<void> {
  try {
    const settings = await loadSettings()
    if (settings.gitRepoRoot?.trim()) return
    await saveSettings({ ...settings, gitRepoRoot: root })
  } catch {
    /* настройки недоступны — клон всё равно на диске */
  }
}

async function isDirectoryEmpty(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir)
    return entries.length === 0
  } catch {
    return true
  }
}

/**
 * Клонирует https://github.com/rkfsociety/CodeViper в %APPDATA%/CodeViper/source,
 * если клона ещё нет. Нужен git в PATH (и сеть). При успехе прописывает gitRepoRoot в настройки.
 */
export async function ensureBundledSourceClone(): Promise<string | null> {
  return ensureCloneMutex.runExclusive(async () => {
    const root = getBundledSourceRoot()
    if (existsSync(join(root, '.git'))) return root

    if (Date.now() - lastCloneFailureAt < CLONE_RETRY_COOLDOWN_MS) {
      return null
    }

    const gitVersion = await runGit(process.cwd(), ['--version'])
    if (gitVersion.code !== 0) {
      await logBundledSourceClone('clone skip: git not in PATH')
      return null
    }

    if (existsSync(root) && !(await isDirectoryEmpty(root))) {
      await logBundledSourceClone('clone skip: source dir exists without .git', { root })
      return null
    }

    const parent = dirname(root)
    await mkdir(parent, { recursive: true })

    await logBundledSourceClone('clone start', { root, url: CODEVIPER_GITHUB_CLONE_URL })
    const clone = await runGit(
      parent,
      [
        'clone',
        '--depth',
        '1',
        '--branch',
        CODEVIPER_RUNTIME_SYNC_BRANCH,
        CODEVIPER_GITHUB_CLONE_URL,
        BUNDLED_SOURCE_DIR_NAME
      ],
      GIT_CLONE_TIMEOUT_MS
    )

    if (clone.code !== 0 || !existsSync(join(root, '.git'))) {
      const error = (clone.stderr || clone.stdout || 'git clone failed').trim()
      lastCloneFailureAt = Date.now()
      await logBundledSourceClone('clone failed', { root, error, code: clone.code })
      return null
    }

    await logBundledSourceClone('clone ok', { root })
    await persistGitRepoRootIfUnset(root)
    return root
  })
}
