import { spawn } from 'child_process'
import { relative, resolve } from 'path'
import { isInsideProject } from './services'

const MAX_OUTPUT_CHARS = 20_000
const DEFAULT_LOG_LIMIT = 20
const MAX_LOG_LIMIT = 100

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolvePromise) => {
    const child = spawn('git', args, { cwd, windowsHide: true })
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
    : [
        'log',
        '-n',
        String(limit),
        '--date=short',
        '--pretty=format:%h %ad %an %s',
        '--',
        pathspec
      ]

  const result = await runGit(projectPath, args)
  return formatGitResult(result)
}
