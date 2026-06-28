import { spawn } from 'child_process'
import { getCodeViperSourceRoot } from './codeviperSource'
import { cliSpawnBase, resolveGhExecutable } from './windowsGitEnv'

export type CiStatus = 'success' | 'failure' | 'pending' | 'none'

export interface PullRequestInfo {
  number: number
  title: string
  headRefName: string
  url: string
  isDraft: boolean
  ciStatus: CiStatus
}

export interface PullRequestListResult {
  ok: boolean
  prs?: PullRequestInfo[]
  /** Текст ошибки для UI (gh не установлен, не авторизован, не git-репозиторий и т.п.) */
  error?: string
}

interface RawCheck {
  __typename?: string
  status?: string
  conclusion?: string
  state?: string
}

interface RawPr {
  number: number
  title: string
  headRefName: string
  url: string
  isDraft: boolean
  statusCheckRollup?: RawCheck[] | null
}

function runGh(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(resolveGhExecutable(), args, cliSpawnBase(getCodeViperSourceRoot()))
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (c: Buffer) => (stdout += c.toString()))
    child.stderr?.on('data', (c: Buffer) => (stderr += c.toString()))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
    child.on('error', (err) => resolve({ code: 127, stdout: '', stderr: err.message }))
  })
}

/** Агрегирует массив проверок statusCheckRollup в один CI-статус. */
function aggregateCi(checks?: RawCheck[] | null): CiStatus {
  if (!checks || checks.length === 0) return 'none'
  let anyPending = false
  let anyFailure = false
  let anySuccess = false

  for (const c of checks) {
    const status = (c.status ?? '').toUpperCase()
    const verdict = (c.conclusion ?? c.state ?? '').toUpperCase()

    if (
      status === 'IN_PROGRESS' ||
      status === 'QUEUED' ||
      status === 'PENDING' ||
      verdict === 'PENDING'
    ) {
      anyPending = true
    } else if (verdict === 'SUCCESS') {
      anySuccess = true
    } else if (
      verdict === 'FAILURE' ||
      verdict === 'ERROR' ||
      verdict === 'CANCELLED' ||
      verdict === 'TIMED_OUT' ||
      verdict === 'ACTION_REQUIRED'
    ) {
      anyFailure = true
    } else if (!verdict && status && status !== 'COMPLETED') {
      // незавершённый чек без явного вердикта считаем выполняющимся
      anyPending = true
    }
  }

  if (anyFailure) return 'failure'
  if (anyPending) return 'pending'
  if (anySuccess) return 'success'
  return 'none'
}

const CI_LABEL: Record<CiStatus, string> = {
  success: 'CI прошёл',
  failure: 'CI упал',
  pending: 'CI идёт',
  none: 'нет CI'
}

/** Текстовый вывод для агента (как панель PrStatusPanel). */
export function formatPullRequestListResult(result: PullRequestListResult): string {
  if (!result.ok) {
    return result.error ?? 'Не удалось получить список PR.'
  }
  const prs = result.prs ?? []
  if (prs.length === 0) {
    return 'Открытых PR нет.'
  }
  const lines = prs.map((pr) => {
    const draft = pr.isDraft ? ' [draft]' : ''
    return (
      `#${pr.number} ${pr.title}${draft}\n` +
      `  ветка: ${pr.headRefName} | ${CI_LABEL[pr.ciStatus]}\n` +
      `  ${pr.url}`
    )
  })
  return `Открытые PR (${prs.length}):\n\n${lines.join('\n\n')}`
}

export async function listPullRequests(): Promise<PullRequestListResult> {
  const check = await runGh(['--version'])
  if (check.code !== 0) {
    return {
      ok: false,
      error:
        'GitHub CLI (gh) не установлен. Установите с https://cli.github.com и выполните gh auth login.'
    }
  }

  const res = await runGh([
    'pr',
    'list',
    '--limit',
    '30',
    '--json',
    'number,title,headRefName,url,isDraft,statusCheckRollup'
  ])

  if (res.code !== 0) {
    const msg = (res.stderr || res.stdout).trim()
    if (/not.*logged in|auth/i.test(msg)) {
      return { ok: false, error: 'gh не авторизован — выполните gh auth login.' }
    }
    return { ok: false, error: msg || 'gh pr list завершился с ошибкой.' }
  }

  try {
    const raw = JSON.parse(res.stdout) as RawPr[]
    const prs: PullRequestInfo[] = raw.map((p) => ({
      number: p.number,
      title: p.title,
      headRefName: p.headRefName,
      url: p.url,
      isDraft: p.isDraft,
      ciStatus: aggregateCi(p.statusCheckRollup)
    }))
    return { ok: true, prs }
  } catch {
    return { ok: false, error: 'Не удалось разобрать ответ gh pr list.' }
  }
}
