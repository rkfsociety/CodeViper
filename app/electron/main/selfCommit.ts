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

async function getCurrentBranch(cwd: string): Promise<string | null> {
  const result = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return result.code === 0 ? result.stdout.trim() || null : null
}

function sanitizeBranchName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_.]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]|[-.]$/g, '')
}

const PROTECTED_BRANCHES = new Set(['master', 'main', 'develop', 'release'])

/**
 * Создаёт ветку `agent/<name>` и переключается на неё.
 * Имя санитизируется: только строчные буквы, цифры, дефисы.
 */
export async function createCodeViperBranch(name: string): Promise<SelfCommitResult> {
  const source = getCodeViperSourceRoot()

  const top = await runGit(source, ['rev-parse', '--show-toplevel'])
  if (top.code !== 0) return { ok: false, message: 'не git-репозиторий — создание ветки пропущено' }

  const slug = sanitizeBranchName(name)
  if (!slug) return { ok: false, message: 'некорректное имя ветки — используй буквы, цифры и дефисы' }

  if (PROTECTED_BRANCHES.has(slug)) {
    return { ok: false, message: `нельзя создать ветку с защищённым именем "${slug}"` }
  }

  const branchName = `agent/${slug}`

  const result = await runGit(source, ['checkout', '-b', branchName])
  if (result.code !== 0) {
    return {
      ok: false,
      message: `git checkout -b: ${(result.stderr || result.stdout).trim()}`
    }
  }

  return { ok: true, message: `Ветка создана и активирована: ${branchName}` }
}

/**
 * Пушит текущую ветку на origin с установкой upstream.
 * Отказывает, если текущая ветка — master/main (для них используй autoPushSelfEdits).
 */
export async function pushCodeViperBranch(): Promise<SelfCommitResult> {
  const source = getCodeViperSourceRoot()

  const top = await runGit(source, ['rev-parse', '--show-toplevel'])
  if (top.code !== 0) return { ok: false, message: 'не git-репозиторий — push пропущен' }

  const branch = await getCurrentBranch(source)
  if (!branch) return { ok: false, message: 'не удалось определить текущую ветку' }

  if (PROTECTED_BRANCHES.has(branch)) {
    return {
      ok: false,
      message: `push_codeviper_branch не работает на ветке "${branch}" — используй autoPushSelfEdits`
    }
  }

  const push = await runGit(source, ['push', '--set-upstream', 'origin', branch])
  if (push.code !== 0) {
    return {
      ok: false,
      message: `push не удался (офлайн?): ${(push.stderr || push.stdout).trim()}`
    }
  }

  return { ok: true, message: `Ветка ${branch} запушена на GitHub` }
}

/**
 * Коммитит и пушит изменения исходников CodeViper (самоправки агента).
 * Best-effort: не git-репозиторий, отсутствие изменений или офлайн — не ошибка приложения.
 */
export async function commitAndPushSelfEdits(summary: string): Promise<SelfCommitResult> {
  // Все операции выполняются в каталоге исходников (app/) и ограничены им
  // через pathspec '.', чтобы не затронуть прочие файлы репозитория.
  const source = getCodeViperSourceRoot()

  const top = await runGit(source, ['rev-parse', '--show-toplevel'])
  if (top.code !== 0) {
    return { ok: false, message: 'не git-репозиторий — автокоммит пропущен' }
  }

  const status = await runGit(source, ['status', '--porcelain', '--', '.'])
  if (!status.stdout.trim()) {
    return { ok: true, message: 'нет изменений для коммита' }
  }

  const add = await runGit(source, ['add', '-A', '--', '.'])
  if (add.code !== 0) {
    return { ok: false, message: `git add: ${(add.stderr || add.stdout).trim()}` }
  }

  const shortSummary = summary.trim().replace(/\s+/g, ' ').slice(0, 80) || 'правки агента'
  const message = `chore(self): автоправки агента — ${shortSummary}`

  const commit = await runGit(source, ['commit', '-m', message, '--', '.'])
  if (commit.code !== 0) {
    return {
      ok: false,
      message: `git commit не удался: ${(commit.stderr || commit.stdout).trim()}`
    }
  }

  const push = await runGit(source, ['push'])
  if (push.code !== 0) {
    return {
      ok: false,
      message: `коммит сделан, но push не удался (офлайн?): ${(push.stderr || push.stdout).trim()}`
    }
  }

  return { ok: true, message: 'самоправки закоммичены и запушены на GitHub' }
}
