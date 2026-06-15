import { spawn } from 'child_process'
import { getCodeViperSourceRoot } from './codeviperSource'

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

export interface SelfCommitResult {
  ok: boolean
  message: string
}

/**
 * Коммитит и пушит изменения исходников CodeViper (самоправки агента).
 * Best-effort: не git-репозиторий, отсутствие изменений или офлайн — не ошибка приложения.
 */
export async function commitAndPushSelfEdits(summary: string): Promise<SelfCommitResult> {
  const source = getCodeViperSourceRoot()

  const top = await runGit(source, ['rev-parse', '--show-toplevel'])
  if (top.code !== 0) {
    return { ok: false, message: 'не git-репозиторий — автокоммит пропущен' }
  }
  const root = top.stdout.trim()

  const status = await runGit(root, ['status', '--porcelain'])
  if (!status.stdout.trim()) {
    return { ok: true, message: 'нет изменений для коммита' }
  }

  const add = await runGit(root, ['add', '-A'])
  if (add.code !== 0) {
    return { ok: false, message: `git add: ${(add.stderr || add.stdout).trim()}` }
  }

  const shortSummary = summary.trim().replace(/\s+/g, ' ').slice(0, 80) || 'правки агента'
  const message = `chore(self): автоправки агента — ${shortSummary}`

  const commit = await runGit(root, ['commit', '-m', message])
  if (commit.code !== 0) {
    return { ok: false, message: `git commit не удался: ${(commit.stderr || commit.stdout).trim()}` }
  }

  const push = await runGit(root, ['push'])
  if (push.code !== 0) {
    return {
      ok: false,
      message: `коммит сделан, но push не удался (офлайн?): ${(push.stderr || push.stdout).trim()}`
    }
  }

  return { ok: true, message: 'самоправки закоммичены и запушены на GitHub' }
}
