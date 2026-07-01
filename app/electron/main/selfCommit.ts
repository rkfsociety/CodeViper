import { spawn } from 'child_process'
import { CODEVIPER_RUNTIME_SYNC_BRANCH } from '../../shared/constants'
import { resolveCollectiveMemoryBranch } from '../../shared/constants'
import { getCodeViperSourceRoot } from './codeviperSource'
import { resolveGitRepoRoot } from './githubAuth'
import { cliSpawnBase, resolveGhExecutable, resolveGitExecutable } from './windowsGitEnv'

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

function isGitSpawnEnoent(result: GitResult): boolean {
  return result.code !== 0 && /spawn .* ENOENT/i.test(result.stderr)
}

function runCmd(cmd: string, cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, cliSpawnBase(cwd))
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

type GitRunner = (cwd: string, args: string[]) => Promise<GitResult>

let gitRunnerOverride: GitRunner | null = null

/** Только для unit-тестов. */
export function setSelfCommitGitRunnerForTests(runner: GitRunner | null): void {
  gitRunnerOverride = runner
}

function runGit(cwd: string, args: string[]): Promise<GitResult> {
  if (gitRunnerOverride) return gitRunnerOverride(cwd, args)
  return runCmd(resolveGitExecutable(), cwd, args)
}

/**
 * Выполняет git-операцию с retry + exponential backoff.
 * Задержки между попытками: 1с → 2с. Всего 3 попытки.
 * При исчерпании попыток выбрасывает ошибку с деталями.
 */
async function runGitWithRetry(cwd: string, args: string[], label: string): Promise<GitResult> {
  const delays = [1000, 2000, 4000]
  let last: GitResult | undefined

  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await runGit(cwd, args)
    if (last.code === 0) return last
    if (isGitSpawnEnoent(last)) {
      throw new Error(
        'Git не найден — установите Git for Windows (https://git-scm.com) и перезапустите CodeViper'
      )
    }

    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, delays[attempt - 1]))
    }
  }

  const detail = (last!.stderr || last!.stdout).trim()
  throw new Error(`Git operation '${label}' failed after 3 attempts: ${detail}`)
}

/**
 * Пушит ветку, при non-fast-forward ошибке выполняет pull --rebase и повторяет попытку.
 * Возвращает результат последней попытки push.
 */
async function pushWithRebaseOnConflict(cwd: string, branch: string): Promise<GitResult> {
  let lastPushResult = await runGit(cwd, ['push', '--set-upstream', 'origin', branch])
  if (lastPushResult.code === 0) return lastPushResult

  const errorOutput = (lastPushResult.stderr || lastPushResult.stdout).toLowerCase()
  const isNonFastForward =
    errorOutput.includes('non-fast-forward') ||
    errorOutput.includes('rejected') ||
    errorOutput.includes('failed to push')

  if (!isNonFastForward) {
    return lastPushResult
  }

  // Пытаемся pull --rebase и повторить push
  const rebaseResult = await runGitWithRetry(
    cwd,
    ['pull', '--rebase', 'origin', branch],
    'pull-rebase'
  )
  if (rebaseResult.code !== 0) {
    return rebaseResult // Rebase не удался, возвращаем ошибку
  }

  // Повторяем push после rebase
  lastPushResult = await runGitWithRetry(
    cwd,
    ['push', '--set-upstream', 'origin', branch],
    'push-after-rebase'
  )
  return lastPushResult
}

export interface SelfCommitResult {
  ok: boolean
  message: string
}

async function getCurrentBranch(cwd: string): Promise<string | null> {
  try {
    const result = await runGitWithRetry(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'], 'rev-parse')
    return result.stdout.trim() || null
  } catch {
    return null
  }
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

async function localBranchExists(cwd: string, branch: string): Promise<boolean> {
  const result = await runGit(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])
  return result.code === 0
}

async function remoteBranchExists(cwd: string, remoteRef: string): Promise<boolean> {
  const result = await runGit(cwd, ['show-ref', '--verify', '--quiet', `refs/remotes/${remoteRef}`])
  return result.code === 0
}

export interface SyncSelfImproveBranchResult {
  ok: boolean
  rebased: boolean
  behindCount: number
  message?: string
}

/**
 * Rebase текущей ветки agent/* на origin/master — ROADMAP и runtime не отстают от master.
 * --autostash: незакоммиченные правки в app/ временно откладываются на время rebase.
 */
export async function syncSelfImproveBranchWithOriginMaster(
  repoRoot: string,
  baseBranch: string = CODEVIPER_RUNTIME_SYNC_BRANCH
): Promise<SyncSelfImproveBranchResult> {
  const remoteRef = `origin/${baseBranch}`

  try {
    await runGitWithRetry(repoRoot, ['fetch', 'origin', baseBranch, '--quiet'], 'fetch')
  } catch (err) {
    return {
      ok: false,
      rebased: false,
      behindCount: 0,
      message: `fetch ${remoteRef} не удался: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  if (!(await remoteBranchExists(repoRoot, remoteRef))) {
    return {
      ok: false,
      rebased: false,
      behindCount: 0,
      message: `${remoteRef} не найден после fetch`
    }
  }

  const behindRes = await runGit(repoRoot, ['rev-list', '--count', `HEAD..${remoteRef}`])
  const behindCount = parseInt(behindRes.stdout.trim(), 10) || 0
  if (behindCount === 0) {
    return { ok: true, rebased: false, behindCount: 0 }
  }

  try {
    await runGitWithRetry(
      repoRoot,
      ['rebase', '--autostash', remoteRef],
      'rebase-onto-origin-master'
    )
    return { ok: true, rebased: true, behindCount }
  } catch (err) {
    await runGit(repoRoot, ['rebase', '--abort'])
    return {
      ok: false,
      rebased: false,
      behindCount,
      message: `rebase на ${remoteRef} не удался (конфликт?): ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

function formatBranchSyncMessage(
  branch: string,
  prefix: string,
  sync: SyncSelfImproveBranchResult
): string {
  if (sync.rebased && sync.behindCount > 0) {
    return `${prefix} ${branch}, подтянут origin/master (+${sync.behindCount} комм.)`
  }
  return `${prefix} ${branch}`
}

/**
 * Переключает репозиторий на ветку самоулучшения (создаёт agent/* при отсутствии).
 * Незакоммиченные правки переносятся вместе с checkout; затем rebase на origin/master.
 */
export async function ensureSelfImproveBranch(
  configuredBranch?: string,
  cwd?: string
): Promise<SelfCommitResult & { branch?: string }> {
  const source = cwd ?? getCodeViperSourceRoot()
  const branch = resolveCollectiveMemoryBranch(configuredBranch)
  const baseBranch = CODEVIPER_RUNTIME_SYNC_BRANCH
  const remoteRef = `origin/${baseBranch}`

  if (PROTECTED_BRANCHES.has(branch)) {
    return { ok: false, message: `ветка самоулучшения не может называться «${branch}»` }
  }
  if (!branch.startsWith('agent/')) {
    return { ok: false, message: 'ветка самоулучшения должна начинаться с agent/' }
  }

  const repoRoot = await getRepoRoot(source)
  if (!repoRoot) {
    return {
      ok: false,
      message:
        'не git-репозиторий — переключение ветки пропущено. Укажите корень git-клона в Настройках (Поведение) или GitHub Token (Интеграции) для API-синхронизации.'
    }
  }

  const current = await getCurrentBranch(repoRoot)
  if (current === branch) {
    const sync = await syncSelfImproveBranchWithOriginMaster(repoRoot, baseBranch)
    if (!sync.ok) {
      return {
        ok: false,
        message: sync.message ?? `не удалось подтянуть ${remoteRef}`,
        branch
      }
    }
    return {
      ok: true,
      message: formatBranchSyncMessage(branch, 'уже на ветке', sync),
      branch
    }
  }

  try {
    if (await localBranchExists(repoRoot, branch)) {
      await runGitWithRetry(repoRoot, ['checkout', branch], 'checkout')
    } else {
      try {
        await runGitWithRetry(repoRoot, ['fetch', 'origin', baseBranch, '--quiet'], 'fetch')
      } catch {
        await runGitWithRetry(repoRoot, ['checkout', '-b', branch], 'checkout')
        return {
          ok: true,
          message: `переключено на новую ветку ${branch} (fetch origin/${baseBranch} недоступен)`,
          branch
        }
      }
      if (await remoteBranchExists(repoRoot, remoteRef)) {
        await runGitWithRetry(repoRoot, ['checkout', '-b', branch, remoteRef], 'checkout')
      } else {
        await runGitWithRetry(repoRoot, ['checkout', '-b', branch], 'checkout')
      }
    }
  } catch (err) {
    return {
      ok: false,
      message: `не удалось переключиться на ${branch}: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const sync = await syncSelfImproveBranchWithOriginMaster(repoRoot, baseBranch)
  if (!sync.ok) {
    return {
      ok: false,
      message: `переключено на ${branch}, но ${sync.message ?? `не удалось подтянуть ${remoteRef}`}`,
      branch
    }
  }

  return {
    ok: true,
    message: formatBranchSyncMessage(branch, 'переключено на ветку', sync),
    branch
  }
}

/** Корень git-репозитория (родитель app/ при разработке из исходников). */
export async function getRepoRoot(cwd?: string): Promise<string | null> {
  if (cwd) {
    const result = await runGit(cwd, ['rev-parse', '--show-toplevel'])
    if (result.code === 0) {
      const root = result.stdout.trim()
      if (root) return root
    }
  }
  return resolveGitRepoRoot()
}

/**
 * Коммитит и пушит указанные пути от корня репозитория (например docs/collective/*).
 */
export async function commitAndPushRepoPaths(
  summary: string,
  paths: string[],
  configuredBranch?: string
): Promise<SelfCommitResult & { branch?: string }> {
  const source = getCodeViperSourceRoot()
  const branchResult = await ensureSelfImproveBranch(configuredBranch, source)
  if (!branchResult.ok) return branchResult

  const branch = branchResult.branch ?? resolveCollectiveMemoryBranch(configuredBranch)
  const repoRoot = await getRepoRoot(source)
  if (!repoRoot) {
    return { ok: false, message: 'не git-репозиторий — push коллективной памяти пропущен' }
  }

  let status: GitResult
  try {
    status = await runGitWithRetry(repoRoot, ['status', '--porcelain', '--', ...paths], 'status')
  } catch (err) {
    return { ok: false, message: `git status: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (!status.stdout.trim()) {
    return { ok: true, message: 'нет изменений для коммита', branch }
  }

  try {
    await runGitWithRetry(repoRoot, ['add', '--', ...paths], 'add')
  } catch (err) {
    return { ok: false, message: `git add: ${err instanceof Error ? err.message : String(err)}` }
  }

  const shortSummary = summary.trim().replace(/\s+/g, ' ').slice(0, 80) || 'коллективная память'
  const message = `chore(memory): ${shortSummary}\n\nCo-authored-by: CodeViper <295331836+CodeViperApp@users.noreply.github.com>`

  try {
    await runGitWithRetry(repoRoot, ['commit', '-m', message, '--', ...paths], 'commit')
  } catch (err) {
    return {
      ok: false,
      message: `git commit не удался: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  try {
    const pushResult = await pushWithRebaseOnConflict(repoRoot, branch)
    if (pushResult.code !== 0) {
      const detail = (pushResult.stderr || pushResult.stdout).trim()
      return {
        ok: false,
        message: `коммит в ${branch} сделан, но push не удался: ${detail}`,
        branch
      }
    }
  } catch (err) {
    return {
      ok: false,
      message: `коммит в ${branch} сделан, но push не удался: ${err instanceof Error ? err.message : String(err)}`,
      branch
    }
  }

  return { ok: true, message: `изменения запушены в ветку ${branch}`, branch }
}

/**
 * Создаёт ветку `agent/<name>` и переключается на неё.
 * Имя санитизируется: только строчные буквы, цифры, дефисы.
 */
export async function createCodeViperBranch(name: string): Promise<SelfCommitResult> {
  const source = getCodeViperSourceRoot()

  try {
    await runGitWithRetry(source, ['rev-parse', '--show-toplevel'], 'rev-parse')
  } catch {
    return { ok: false, message: 'не git-репозиторий — создание ветки пропущено' }
  }

  const slug = sanitizeBranchName(name)
  if (!slug)
    return { ok: false, message: 'некорректное имя ветки — используй буквы, цифры и дефисы' }

  if (PROTECTED_BRANCHES.has(slug)) {
    return { ok: false, message: `нельзя создать ветку с защищённым именем "${slug}"` }
  }

  const branchName = `agent/${slug}`

  try {
    await runGitWithRetry(source, ['checkout', '-b', branchName], 'checkout')
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) }
  }

  return { ok: true, message: `Ветка создана и активирована: ${branchName}` }
}

/**
 * Пушит текущую ветку на origin с установкой upstream.
 * Отказывает, если текущая ветка — master/main.
 */
export async function pushCodeViperBranch(): Promise<SelfCommitResult> {
  const source = getCodeViperSourceRoot()

  try {
    await runGitWithRetry(source, ['rev-parse', '--show-toplevel'], 'rev-parse')
  } catch {
    return { ok: false, message: 'не git-репозиторий — push пропущен' }
  }

  const branch = await getCurrentBranch(source)
  if (!branch) return { ok: false, message: 'не удалось определить текущую ветку' }

  if (PROTECTED_BRANCHES.has(branch)) {
    return {
      ok: false,
      message: `push_codeviper_branch не работает на ветке "${branch}" — сначала create_codeviper_branch`
    }
  }

  try {
    await runGitWithRetry(source, ['push', '--set-upstream', 'origin', branch], 'push')
  } catch (err) {
    return {
      ok: false,
      message: `push не удался (офлайн?): ${err instanceof Error ? err.message : String(err)}`
    }
  }

  return { ok: true, message: `Ветка ${branch} запушена на GitHub` }
}

/** Определяет базовую ветку репозитория (origin/HEAD); fallback — master. */
async function getDefaultBaseBranch(cwd: string): Promise<string> {
  try {
    const result = await runGitWithRetry(
      cwd,
      ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'],
      'symbolic-ref'
    )
    const match = result.stdout.trim().match(/refs\/remotes\/origin\/(.+)$/)
    if (match) return match[1]!
  } catch {
    // fallback ниже
  }
  return 'master'
}

/**
 * Создаёт Pull Request из текущей ветки agent/* через GitHub CLI (`gh pr create`).
 * Сначала убеждается, что ветка запушена (идемпотентный push --set-upstream).
 * PR НЕ мержится автоматически — требуется ручная проверка и approve.
 */
export async function createCodeViperPr(title?: string, body?: string): Promise<SelfCommitResult> {
  const source = getCodeViperSourceRoot()

  try {
    await runGitWithRetry(source, ['rev-parse', '--show-toplevel'], 'rev-parse')
  } catch {
    return { ok: false, message: 'не git-репозиторий — PR не создан' }
  }

  const branch = await getCurrentBranch(source)
  if (!branch) return { ok: false, message: 'не удалось определить текущую ветку' }

  if (PROTECTED_BRANCHES.has(branch)) {
    return {
      ok: false,
      message: `PR создаётся из ветки agent/*, а не из "${branch}" — сначала create_codeviper_branch`
    }
  }

  const ghCheck = await runCmd(resolveGhExecutable(), source, ['--version'])
  if (ghCheck.code !== 0) {
    return {
      ok: false,
      message:
        'GitHub CLI (gh) не установлен или не в PATH — установи с https://cli.github.com и выполни `gh auth login`'
    }
  }

  // Убеждаемся, что ветка есть на origin (идемпотентно).
  try {
    await runGitWithRetry(source, ['push', '--set-upstream', 'origin', branch], 'push')
  } catch (err) {
    return {
      ok: false,
      message: `push не удался (офлайн?): ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const base = await getDefaultBaseBranch(source)

  try {
    const ahead = await runGitWithRetry(
      source,
      ['rev-list', '--count', `${base}..${branch}`],
      'rev-list'
    )
    const commitCount = parseInt(ahead.stdout.trim(), 10)
    if (!Number.isFinite(commitCount) || commitCount < 1) {
      return {
        ok: false,
        message:
          'нет коммитов относительно базовой ветки — сначала edit_codeviper_file и commit_and_push_self_edits, затем create_codeviper_pr'
      }
    }
  } catch {
    return { ok: false, message: 'не удалось проверить коммиты ветки — PR не создан' }
  }

  const prTitle = title?.trim() || `Правки агента: ${branch}`
  const prBody =
    body?.trim() ||
    'PR создан агентом CodeViper. Не мержится автоматически — требуется ручная проверка и approve.'

  const pr = await runCmd(resolveGhExecutable(), source, [
    'pr',
    'create',
    '--base',
    base,
    '--head',
    branch,
    '--title',
    prTitle,
    '--body',
    prBody
  ])

  if (pr.code !== 0) {
    const msg = (pr.stderr || pr.stdout).trim()
    if (/already exists/i.test(msg)) {
      return { ok: true, message: `PR для ветки ${branch} уже существует. ${msg}` }
    }
    return { ok: false, message: `gh pr create не удался: ${msg}` }
  }

  const url = pr.stdout.trim()
  return {
    ok: true,
    message: `PR создан (не смержен, ждёт ревью): ${url || `ветка ${branch} → ${base}`}`
  }
}
