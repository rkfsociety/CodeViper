import { spawn } from 'child_process'
import type { WebContents } from 'electron'
import { getCodeViperSourceRoot } from './codeviperSource'

export interface UpdateInfo {
  /** Сколько коммитов origin опережает локальную ветку */
  commits: number
}

function runGit(
  cwd: string,
  args: string[],
  timeoutMs = 15_000
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, windowsHide: true })
    let stdout = ''
    let settled = false
    const finish = (code: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout })
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(1)
    }, timeoutMs)
    child.stdout?.on('data', (c: Buffer) => (stdout += c.toString()))
    child.on('close', (code) => finish(code ?? 1))
    child.on('error', () => finish(1))
  })
}

const CHECK_INTERVAL_MS = 10 * 60 * 1000 // каждые 10 минут
let timer: ReturnType<typeof setInterval> | null = null

/**
 * Делает git fetch и проверяет, обновился ли исходный код (app/) на origin.
 * Если да — шлёт renderer событие `update-available`.
 */
async function checkForUpdate(webContents: WebContents): Promise<void> {
  const source = getCodeViperSourceRoot()

  const top = await runGit(source, ['rev-parse', '--show-toplevel'])
  if (top.code !== 0) return // не git-репозиторий (упакованная сборка)

  const branchRes = await runGit(source, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const branch = branchRes.stdout.trim()
  if (!branch || branch === 'HEAD') return

  const fetch = await runGit(source, ['fetch', 'origin', branch, '--quiet'])
  if (fetch.code !== 0) return // нет сети — тихо пропускаем

  const local = (await runGit(source, ['rev-parse', 'HEAD'])).stdout.trim()
  const remote = (await runGit(source, ['rev-parse', `origin/${branch}`])).stdout.trim()
  if (!remote || local === remote) return // уже актуально

  // Затрагивают ли обновления исходники (текущая папка source = app/)?
  const diff = await runGit(source, ['diff', '--quiet', 'HEAD', `origin/${branch}`, '--', '.'])
  if (diff.code === 0) return // изменения вне app/ — пересборка не нужна

  const countRes = await runGit(source, ['rev-list', '--count', `HEAD..origin/${branch}`])
  const commits = parseInt(countRes.stdout.trim(), 10) || 1

  if (!webContents.isDestroyed()) {
    webContents.send('update-available', { commits } satisfies UpdateInfo)
  }
}

export function startUpdateChecks(webContents: WebContents): void {
  if (timer) return
  // Первая проверка — вскоре после запуска, затем по интервалу.
  setTimeout(() => void checkForUpdate(webContents).catch(() => {}), 5_000)
  timer = setInterval(() => void checkForUpdate(webContents).catch(() => {}), CHECK_INTERVAL_MS)
}

export function stopUpdateChecks(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
