import { spawn } from 'child_process'

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
    child.on('error', (error) => resolve({ code: 1, stdout: '', stderr: error.message }))
  })
}

export interface RunCheckpoint {
  chatId: string
  projectPath: string
  /** SHA от `git stash create -u`, если на момент снимка были локальные изменения */
  stashRef: string | null
  /** HEAD на момент снимка (для чистого дерева) */
  headRef: string
}

const checkpoints = new Map<string, RunCheckpoint>()

export function clearRunCheckpoint(chatId: string): void {
  checkpoints.delete(chatId)
}

export function hasRunCheckpoint(chatId: string): boolean {
  return checkpoints.has(chatId)
}

export async function isGitRepo(projectPath: string): Promise<boolean> {
  const result = await runGit(projectPath, ['rev-parse', '--is-inside-work-tree'])
  return result.code === 0 && result.stdout.trim() === 'true'
}

/** Снимок состояния проекта перед первым mutating-инструментом прогона. */
export async function ensureRunCheckpoint(chatId: string, projectPath: string): Promise<boolean> {
  if (checkpoints.has(chatId)) return true
  if (!(await isGitRepo(projectPath))) return false

  const head = await runGit(projectPath, ['rev-parse', 'HEAD'])
  if (head.code !== 0) return false
  const headRef = head.stdout.trim()

  const status = await runGit(projectPath, ['status', '--porcelain'])
  const hasLocalChanges = status.stdout.trim().length > 0

  let stashRef: string | null = null
  if (hasLocalChanges) {
    const stash = await runGit(projectPath, [
      'stash',
      'create',
      '-u',
      '-m',
      `codeviper-run:${chatId}`
    ])
    if (stash.code !== 0) return false
    const ref = stash.stdout.trim()
    if (ref) stashRef = ref
  }

  checkpoints.set(chatId, { chatId, projectPath, stashRef, headRef })
  return true
}

export interface RollbackResult {
  ok: boolean
  message: string
}

/** Откат всех правок прогона к состоянию чекпоинта. */
export async function rollbackRunCheckpoint(chatId: string): Promise<RollbackResult> {
  const checkpoint = checkpoints.get(chatId)
  if (!checkpoint) {
    return { ok: false, message: 'Нет сохранённого чекпоинта для этого чата' }
  }

  const { projectPath, stashRef, headRef } = checkpoint
  if (!(await isGitRepo(projectPath))) {
    checkpoints.delete(chatId)
    return { ok: false, message: 'Проект больше не является git-репозиторием' }
  }

  const resetTarget = stashRef ?? headRef
  const reset = await runGit(projectPath, ['reset', '--hard', resetTarget])
  if (reset.code !== 0) {
    const detail = (reset.stderr || reset.stdout).trim()
    return { ok: false, message: `git reset не удался: ${detail}` }
  }

  const clean = await runGit(projectPath, ['clean', '-fd'])
  if (clean.code !== 0) {
    const detail = (clean.stderr || clean.stdout).trim()
    return { ok: false, message: `git clean не удался: ${detail}` }
  }

  checkpoints.delete(chatId)
  return { ok: true, message: 'Все правки прогона отменены' }
}
