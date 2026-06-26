import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { CODEVIPER_GITHUB_OWNER, CODEVIPER_GITHUB_REPO } from '../../shared/constants'
import { getCodeViperSourceRoot } from './codeviperSource'
import { loadSettings } from './settings'

export interface GitHubAuthStatus {
  ghInstalled: boolean
  ghLoggedIn: boolean
  tokenConfigured: boolean
  tokenValid: boolean
  login?: string
  gitRepoRoot: string | null
  hints: string[]
}

interface GhRunResult {
  code: number
  stdout: string
  stderr: string
}

function runGh(args: string[], cwd?: string): Promise<GhRunResult> {
  return new Promise((resolveRun) => {
    const child = spawn('gh', args, {
      cwd: cwd ?? getCodeViperSourceRoot(),
      windowsHide: true
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (c: Buffer) => (stdout += c.toString()))
    child.stderr?.on('data', (c: Buffer) => (stderr += c.toString()))
    child.on('close', (code) => resolveRun({ code: code ?? 1, stdout, stderr }))
    child.on('error', (err) => resolveRun({ code: 127, stdout: '', stderr: err.message }))
  })
}

function runGit(cwd: string, args: string[]): Promise<GhRunResult> {
  return new Promise((resolveRun) => {
    const child = spawn('git', args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (c: Buffer) => (stdout += c.toString()))
    child.stderr?.on('data', (c: Buffer) => (stderr += c.toString()))
    child.on('close', (code) => resolveRun({ code: code ?? 1, stdout, stderr }))
    child.on('error', (err) => resolveRun({ code: 127, stdout: '', stderr: err.message }))
  })
}

async function tryGitRepoRoot(cwd: string): Promise<string | null> {
  const result = await runGit(cwd, ['rev-parse', '--show-toplevel'])
  if (result.code !== 0) return null
  const root = result.stdout.trim()
  return root || null
}

/** Ищет корень git-репозитория CodeViper (клон), не папку установки .exe. */
export async function resolveGitRepoRoot(): Promise<string | null> {
  const settings = await loadSettings()
  const seen = new Set<string>()
  const candidates: string[] = []

  const add = (p: string) => {
    const abs = resolve(p)
    if (!seen.has(abs)) {
      seen.add(abs)
      candidates.push(abs)
    }
  }

  if (settings.gitRepoRoot?.trim()) add(settings.gitRepoRoot.trim())

  const source = getCodeViperSourceRoot()
  add(source)
  add(join(source, '..'))

  if (settings.sourceRootOverride?.trim()) {
    const override = resolve(settings.sourceRootOverride.trim())
    add(override)
    add(join(override, '..'))
  }

  for (const cwd of candidates) {
    if (!existsSync(cwd)) continue
    const root = await tryGitRepoRoot(cwd)
    if (root && existsSync(join(root, '.git'))) return root
  }
  return null
}

async function githubFetch(
  token: string,
  apiPath: string,
  init?: Parameters<typeof fetch>[1]
): Promise<Response> {
  return fetch(`https://api.github.com${apiPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })
}

async function validateGitHubToken(token: string): Promise<{ ok: boolean; login?: string }> {
  try {
    const res = await githubFetch(token, '/user')
    if (!res.ok) return { ok: false }
    const data = (await res.json()) as { login?: string }
    return { ok: true, login: data.login }
  } catch {
    return { ok: false }
  }
}

export async function getGitHubAuthStatus(): Promise<GitHubAuthStatus> {
  const settings = await loadSettings()
  const hints: string[] = []
  const gitRepoRoot = await resolveGitRepoRoot()

  const ghVersion = await runGh(['--version'])
  const ghInstalled = ghVersion.code === 0

  let ghLoggedIn = false
  if (ghInstalled) {
    const status = await runGh(['auth', 'status'])
    ghLoggedIn = status.code === 0
    if (!ghLoggedIn) {
      hints.push('Выполните в терминале: gh auth login')
    }
  } else {
    hints.push('Установите GitHub CLI: https://cli.github.com')
  }

  const tokenConfigured = Boolean(settings.githubToken?.trim())
  let tokenValid = false
  let login: string | undefined
  if (tokenConfigured) {
    const check = await validateGitHubToken(settings.githubToken!.trim())
    tokenValid = check.ok
    login = check.login
    if (!tokenValid) {
      hints.push(
        'GitHub Token в настройках недействителен — нужен scope repo (и gist для «Поделиться»)'
      )
    }
  } else if (!ghLoggedIn) {
    hints.push(
      'Добавьте GitHub Token (Настройки → Интеграции) с правом repo — для синхронизации знаний без локального git'
    )
  }

  if (!gitRepoRoot) {
    hints.push(
      'Укажите корень git-клона (Настройки → Поведение → «Корень git-репозитория», например F:\\github\\CodeViper) или app/ в «Путь к исходникам»'
    )
  }

  return {
    ghInstalled,
    ghLoggedIn,
    tokenConfigured,
    tokenValid,
    login,
    gitRepoRoot,
    hints
  }
}

export function formatGitHubAuthStatus(status: GitHubAuthStatus): string {
  const lines = [
    `GitHub CLI: ${status.ghInstalled ? (status.ghLoggedIn ? 'авторизован' : 'не авторизован') : 'не установлен'}`,
    `Token: ${status.tokenConfigured ? (status.tokenValid ? `OK (${status.login ?? 'user'})` : 'недействителен') : 'не задан'}`,
    `Git-репозиторий: ${status.gitRepoRoot ?? 'не найден'}`
  ]
  if (status.hints.length) lines.push('', 'Что сделать:', ...status.hints.map((h) => `• ${h}`))
  return lines.join('\n')
}

interface RepoFileContent {
  content: string
  sha: string
}

export async function getRepoFileViaApi(
  token: string,
  repoPath: string,
  branch: string,
  owner = CODEVIPER_GITHUB_OWNER,
  repo = CODEVIPER_GITHUB_REPO
): Promise<RepoFileContent | null> {
  const encoded = repoPath
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')
  const res = await githubFetch(
    token,
    `/repos/${owner}/${repo}/contents/${encoded}?ref=${encodeURIComponent(branch)}`
  )
  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub GET contents: ${res.status} ${text}`)
  }
  const data = (await res.json()) as { content?: string; sha?: string; encoding?: string }
  if (!data.content || !data.sha) throw new Error('GitHub: пустой ответ contents')
  const raw = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8')
  return { content: raw, sha: data.sha }
}

async function ensureRemoteBranch(
  token: string,
  branch: string,
  baseBranch: string,
  owner = CODEVIPER_GITHUB_OWNER,
  repo = CODEVIPER_GITHUB_REPO
): Promise<void> {
  const headRes = await githubFetch(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`)
  if (headRes.ok) return

  const baseRes = await githubFetch(token, `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`)
  if (!baseRes.ok) {
    const text = await baseRes.text().catch(() => '')
    throw new Error(`Не удалось найти базовую ветку ${baseBranch}: ${baseRes.status} ${text}`)
  }
  const base = (await baseRes.json()) as { object: { sha: string } }
  const createRes = await githubFetch(token, `/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha })
  })
  if (!createRes.ok && createRes.status !== 422) {
    const text = await createRes.text().catch(() => '')
    throw new Error(`Создание ветки ${branch}: ${createRes.status} ${text}`)
  }
}

export async function upsertRepoFileViaApi(
  token: string,
  repoPath: string,
  branch: string,
  content: string,
  message: string,
  owner = CODEVIPER_GITHUB_OWNER,
  repo = CODEVIPER_GITHUB_REPO
): Promise<{ ok: boolean; message: string }> {
  await ensureRemoteBranch(token, branch, 'master', owner, repo)

  let sha: string | undefined
  try {
    const existing = await getRepoFileViaApi(token, repoPath, branch, owner, repo)
    sha = existing?.sha
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }
  }

  const encoded = repoPath
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')
  const body: Record<string, string> = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch
  }
  if (sha) body.sha = sha

  const res = await githubFetch(token, `/repos/${owner}/${repo}/contents/${encoded}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, message: `GitHub PUT contents: ${res.status} ${text}` }
  }

  return { ok: true, message: `файл ${repoPath} обновлён в ветке ${branch} через GitHub API` }
}
