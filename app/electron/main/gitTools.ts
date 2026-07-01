import { spawn } from 'child_process'
import { relative, resolve } from 'path'
import { isInsideProject } from './services'
import { cliSpawnBase } from './windowsGitEnv'

const MAX_OUTPUT_CHARS = 20_000
const DEFAULT_LOG_LIMIT = 20
const MAX_LOG_LIMIT = 100
const DEFAULT_COMMIT_MESSAGE_LOG_LIMIT = 50
const COMMIT_MESSAGE_LOG_FORMAT = '--format=%s'
const CONVENTIONAL_COMMIT_RE =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+/i

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolvePromise) => {
    const child = spawn('git', args, cliSpawnBase(cwd))
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => resolvePromise({ code: code ?? 1, stdout, stderr }))
    child.on('error', (error) => resolvePromise({ code: 1, stdout: '', stderr: error.message }))
  })
}

function truncateOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n… (обрезано, ${text.length} символов)`
}

function formatGitResult(result: GitResult): string {
  const parts = [`exit: ${result.code}`]
  if (result.stdout.trim()) parts.push(`stdout:\n${truncateOutput(result.stdout)}`)
  if (result.stderr.trim()) parts.push(`stderr:\n${truncateOutput(result.stderr)}`)
  return parts.join('\n')
}

async function ensureGitRepo(projectPath: string): Promise<string | null> {
  const top = await runGit(projectPath, ['rev-parse', '--show-toplevel'])
  if (top.code !== 0) {
    return 'Не git-репозиторий (git rev-parse не удался)'
  }
  return null
}

function resolvePathspec(projectPath: string, path?: string): string | { error: string } {
  const trimmed = path?.trim()
  if (!trimmed) return '.'

  const absolute = resolve(trimmed)
  if (!isInsideProject(projectPath, absolute)) {
    return { error: 'Доступ запрещён: path вне проекта' }
  }

  const rel = relative(resolve(projectPath), absolute).replace(/\\/g, '/')
  return rel || '.'
}

function parseLogLimit(value: string | undefined): number {
  const limit = Number(value)
  if (!Number.isFinite(limit)) return DEFAULT_LOG_LIMIT
  return Math.min(MAX_LOG_LIMIT, Math.max(1, Math.round(limit)))
}

function parseToolBool(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}

const SAFE_GIT_REF = /^[\w./~^@{}-]+$/

function validateGitRef(ref: string): string | null {
  const trimmed = ref.trim()
  if (!trimmed) return 'Пустая ссылка git'
  if (trimmed.length > 120) return 'Ссылка git слишком длинная'
  if (!SAFE_GIT_REF.test(trimmed)) return 'Недопустимая ссылка git'
  return null
}

export async function gitStatus(projectPath: string, path?: string): Promise<string> {
  const repoError = await ensureGitRepo(projectPath)
  if (repoError) return repoError

  const pathspec = resolvePathspec(projectPath, path)
  if (typeof pathspec !== 'string') return pathspec.error

  const result = await runGit(projectPath, ['status', '--short', '--branch', '--', pathspec])
  return formatGitResult(result)
}

export async function gitDiff(
  projectPath: string,
  options: { path?: string; staged?: string; commit?: string } = {}
): Promise<string> {
  const repoError = await ensureGitRepo(projectPath)
  if (repoError) return repoError

  const pathspec = resolvePathspec(projectPath, options.path)
  if (typeof pathspec !== 'string') return pathspec.error

  let args: string[]

  if (options.commit?.trim()) {
    const refError = validateGitRef(options.commit)
    if (refError) return refError
    args = ['show', '--stat', options.commit.trim(), '--', pathspec]
  } else {
    args = ['diff']
    if (parseToolBool(options.staged)) {
      args.push('--staged')
    }
    args.push('--', pathspec)
  }

  const result = await runGit(projectPath, args)
  return formatGitResult(result)
}

export async function gitLog(
  projectPath: string,
  options: { limit?: string; path?: string; oneline?: string } = {}
): Promise<string> {
  const repoError = await ensureGitRepo(projectPath)
  if (repoError) return repoError

  const pathspec = resolvePathspec(projectPath, options.path)
  if (typeof pathspec !== 'string') return pathspec.error

  const limit = parseLogLimit(options.limit)
  const args = parseToolBool(options.oneline)
    ? ['log', '-n', String(limit), '--oneline', '--', pathspec]
    : ['log', '-n', String(limit), '--date=short', '--pretty=format:%h %ad %an %s', '--', pathspec]

  const result = await runGit(projectPath, args)
  return formatGitResult(result)
}

export async function findCommitMessageIssues(
  projectPath: string,
  options: { limit?: string } = {}
): Promise<string> {
  const repoError = await ensureGitRepo(projectPath)
  if (repoError) return repoError

  const limit = parseLogLimit(options.limit ?? String(DEFAULT_COMMIT_MESSAGE_LOG_LIMIT))
  const result = await runGit(projectPath, ['log', '-n', String(limit), COMMIT_MESSAGE_LOG_FORMAT])
  if (result.code !== 0) return formatGitResult(result)

  const messages = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!messages.length) {
    return `Пустая история commit-сообщений за последние ${limit} коммитов.`
  }

  const issues = messages.flatMap((message, index) =>
    CONVENTIONAL_COMMIT_RE.test(message) ? [] : [`[${index + 1}] ${message}`]
  )

  const badCount = issues.length
  const goodCount = messages.length - badCount
  const header = [
    `Проверено commit-ов: ${messages.length}`,
    `Conventional Commits: ${goodCount}`,
    `Не по conventional: ${badCount}`
  ]

  if (!issues.length) {
    return [...header, 'Проблем не найдено.'].join('\n')
  }

  return [...header, '', 'Нестандартные commit-сообщения:', ...issues].join('\n')
}

const MAX_COMMIT_MESSAGE_LEN = 5000

function validateCommitMessage(message: string | undefined): string | null {
  const trimmed = message?.trim() ?? ''
  if (!trimmed) return 'Пустое сообщение коммита'
  if (trimmed.length > MAX_COMMIT_MESSAGE_LEN) return 'Сообщение коммита слишком длинное'
  if (trimmed.startsWith('-')) return 'Сообщение коммита не может начинаться с "-"'
  return null
}

/** git commit -m внутри projectPath (аргументы spawn, без shell). */
export async function gitCommit(projectPath: string, message: string): Promise<string> {
  const repoError = await ensureGitRepo(projectPath)
  if (repoError) return repoError

  const messageError = validateCommitMessage(message)
  if (messageError) return messageError

  const result = await runGit(projectPath, ['commit', '-m', message.trim()])
  return formatGitResult(result)
}

const NON_FAST_FORWARD_RE = /non-fast-forward|\[rejected\].*push|failed to push some refs/i

function formatGitPushResult(result: GitResult): string {
  const combined = `${result.stderr}\n${result.stdout}`
  if (result.code !== 0 && NON_FAST_FORWARD_RE.test(combined)) {
    const parts = [
      `exit: ${result.code}`,
      'Ошибка: push отклонён (non-fast-forward) — удалённая ветка впереди локальной.',
      'Сначала git pull --rebase (или merge), разреши конфликты, затем повтори push.',
      'Не используй git push --force без явного запроса пользователя.'
    ]
    if (result.stderr.trim()) parts.push(`stderr:\n${truncateOutput(result.stderr)}`)
    if (result.stdout.trim()) parts.push(`stdout:\n${truncateOutput(result.stdout)}`)
    return parts.join('\n')
  }
  return formatGitResult(result)
}

/** git push внутри projectPath; remote/branch опциональны (spawn, без shell). */
export async function gitPush(
  projectPath: string,
  options: { remote?: string; branch?: string } = {}
): Promise<string> {
  const repoError = await ensureGitRepo(projectPath)
  if (repoError) return repoError

  const remote = options.remote?.trim()
  const branch = options.branch?.trim()

  if (branch && !remote) {
    return 'Укажи remote вместе с branch (например remote=origin, branch=main)'
  }

  if (remote) {
    const remoteError = validateGitRef(remote)
    if (remoteError) return `Недопустимое имя remote: ${remoteError}`
  }
  if (branch) {
    const branchError = validateGitRef(branch)
    if (branchError) return `Недопустимое имя branch: ${branchError}`
  }

  const args = ['push']
  if (remote) args.push(remote)
  if (branch) args.push(branch)

  const result = await runGit(projectPath, args)
  return formatGitPushResult(result)
}

async function hasDirtyWorkingTree(projectPath: string): Promise<boolean> {
  const status = await runGit(projectPath, ['status', '--porcelain'])
  return status.code === 0 && status.stdout.trim().length > 0
}

/** git switch/checkout ветки внутри projectPath; dirty tree без force запрещён. */
export async function gitCheckout(
  projectPath: string,
  options: { branch: string; force?: string }
): Promise<string> {
  const repoError = await ensureGitRepo(projectPath)
  if (repoError) return repoError

  const branch = options.branch?.trim()
  if (!branch) return 'Не указана ветка для checkout'

  const branchError = validateGitRef(branch)
  if (branchError) return `Недопустимое имя ветки: ${branchError}`

  const force = parseToolBool(options.force)
  if (!force && (await hasDirtyWorkingTree(projectPath))) {
    return [
      'Ошибка: рабочее дерево не чистое (есть незакоммиченные изменения).',
      'Сначала commit или stash, либо передай force=true для принудительного переключения (локальные правки могут быть потеряны).'
    ].join('\n')
  }

  const switchArgs = ['switch']
  if (force) switchArgs.push('-f')
  switchArgs.push(branch)

  let result = await runGit(projectPath, switchArgs)
  if (result.code !== 0 && /unknown switch|not a git command/i.test(result.stderr)) {
    const checkoutArgs = ['checkout']
    if (force) checkoutArgs.push('-f')
    checkoutArgs.push(branch)
    result = await runGit(projectPath, checkoutArgs)
  }

  return formatGitResult(result)
}

const DEFAULT_STASH_MESSAGE = 'codeviper-stash'

/** git stash push -m внутри projectPath (spawn, без shell). */
export async function gitStash(projectPath: string, message?: string): Promise<string> {
  const repoError = await ensureGitRepo(projectPath)
  if (repoError) return repoError

  const trimmed = message?.trim()
  const stashMessage = trimmed || DEFAULT_STASH_MESSAGE
  if (trimmed) {
    const messageError = validateCommitMessage(trimmed)
    if (messageError) return messageError
  }

  const result = await runGit(projectPath, ['stash', 'push', '-m', stashMessage])
  return formatGitResult(result)
}

/** git stash pop внутри projectPath (spawn, без shell). */
export async function gitStashPop(projectPath: string): Promise<string> {
  const repoError = await ensureGitRepo(projectPath)
  if (repoError) return repoError

  const result = await runGit(projectPath, ['stash', 'pop'])
  return formatGitResult(result)
}
