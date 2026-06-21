import { spawn } from 'child_process'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { getCodeViperSourceRoot } from './codeviperSource'

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

function runCmd(cmd: string, cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true })
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

function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return runCmd('git', cwd, args)
}

/**
 * Выполняет git-операцию с retry + exponential backoff.
 * Задержки между попытками: 1с → 2с. Всего 3 попытки.
 * При исчерпании попыток выбрасывает ошибку с деталями.
 */
async function runGitWithRetry(cwd: string, args: string[], label: string): Promise<GitResult> {
  const delays = [1000, 2000]
  let last: GitResult | undefined

  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await runGit(cwd, args)
    if (last.code === 0) return last

    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, delays[attempt - 1]))
    }
  }

  const detail = (last!.stderr || last!.stdout).trim()
  throw new Error(
    `git ${label} завершился с ошибкой после 3 попыток (код ${last!.code})${detail ? `: ${detail}` : ''}`
  )
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
 * Отказывает, если текущая ветка — master/main (для них используй autoPushSelfEdits).
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
      message: `push_codeviper_branch не работает на ветке "${branch}" — используй autoPushSelfEdits`
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

  const ghCheck = await runCmd('gh', source, ['--version'])
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
  const prTitle = title?.trim() || `Правки агента: ${branch}`
  const prBody =
    body?.trim() ||
    'PR создан агентом CodeViper. Не мержится автоматически — требуется ручная проверка и approve.'

  const pr = await runCmd('gh', source, [
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

/**
 * Коммитит и пушит изменения исходников CodeViper (самоправки агента).
 * Best-effort: не git-репозиторий, отсутствие изменений или офлайн — не ошибка приложения.
 */
export async function commitAndPushSelfEdits(summary: string): Promise<SelfCommitResult> {
  // Все операции выполняются в каталоге исходников (app/) и ограничены им
  // через pathspec '.', чтобы не затронуть прочие файлы репозитория.
  const source = getCodeViperSourceRoot()

  try {
    await runGitWithRetry(source, ['rev-parse', '--show-toplevel'], 'rev-parse')
  } catch {
    return { ok: false, message: 'не git-репозиторий — автокоммит пропущен' }
  }

  let status: GitResult
  try {
    status = await runGitWithRetry(source, ['status', '--porcelain', '--', '.'], 'status')
  } catch (err) {
    return { ok: false, message: `git status: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (!status.stdout.trim()) {
    return { ok: true, message: 'нет изменений для коммита' }
  }

  try {
    await runGitWithRetry(source, ['add', '-A', '--', '.'], 'add')
  } catch (err) {
    return { ok: false, message: `git add: ${err instanceof Error ? err.message : String(err)}` }
  }

  const shortSummary = summary.trim().replace(/\s+/g, ' ').slice(0, 80) || 'правки агента'
  const message = `chore(self): автоправки агента — ${shortSummary}\n\nCo-authored-by: CodeViper <295331836+CodeViperApp@users.noreply.github.com>`

  try {
    await runGitWithRetry(source, ['commit', '-m', message, '--', '.'], 'commit')
  } catch (err) {
    return {
      ok: false,
      message: `git commit не удался: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  try {
    await runGitWithRetry(source, ['push'], 'push')
  } catch (err) {
    return {
      ok: false,
      message: `коммит сделан, но push не удался (офлайн?): ${err instanceof Error ? err.message : String(err)}`
    }
  }

  return { ok: true, message: 'самоправки закоммичены и запушены на GitHub' }
}

/**
 * Сохраняет правки исходников CodeViper в git stash и пишет маркер `.pending-restart`.
 * При следующем запуске CodeViper.cmd пользователю предложат применить эти правки.
 * Используется когда агент редактирует свои файлы вне режима самоулучшения.
 */
export async function stageSelfEditsForRestart(summary: string): Promise<SelfCommitResult> {
  const source = getCodeViperSourceRoot()

  try {
    await runGitWithRetry(source, ['rev-parse', '--show-toplevel'], 'rev-parse')
  } catch {
    return {
      ok: false,
      message: 'не git-репозиторий — правки остались на диске, пересборка при следующем запуске'
    }
  }

  let status: GitResult
  try {
    status = await runGitWithRetry(source, ['status', '--porcelain', '--', '.'], 'status')
  } catch (err) {
    return { ok: false, message: `git status: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (!status.stdout.trim()) {
    return { ok: true, message: 'нет изменений для отложенного применения' }
  }

  const shortSummary = summary.trim().replace(/\s+/g, ' ').slice(0, 72) || 'правки агента'
  const label = `agent-pending: ${shortSummary}`

  // pathspec '.' ограничивает stash только файлами в app/ (текущий каталог)
  try {
    await runGitWithRetry(source, ['stash', 'push', '-u', '-m', label, '--', '.'], 'stash')
  } catch (err) {
    return {
      ok: false,
      message: `git stash не удался: ${err instanceof Error ? err.message : String(err)} — правки остались на диске`
    }
  }

  await writeFile(join(source, '.pending-restart'), label, 'utf8')

  return {
    ok: true,
    message: 'правки сохранены и будут применены при следующем запуске CodeViper'
  }
}
