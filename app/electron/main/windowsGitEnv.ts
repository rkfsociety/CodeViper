import { existsSync } from 'fs'
import { join } from 'path'

/** Типичные пути Git for Windows — GUI-приложения часто не наследуют полный PATH. */
const DEFAULT_WIN_GIT_CMD_DIRS = [
  'C:\\Program Files\\Git\\cmd',
  'C:\\Program Files (x86)\\Git\\cmd'
] as const

let winGitCmdDirsOverride: readonly string[] | null = null

/** Только для unit-тестов. */
export function setWinGitCmdDirsForTests(dirs: readonly string[] | null): void {
  winGitCmdDirsOverride = dirs
}

function winGitCmdDirs(): readonly string[] {
  return winGitCmdDirsOverride ?? DEFAULT_WIN_GIT_CMD_DIRS
}

/** Добавляет каталоги git.exe в PATH/Path (Windows). */
export function prependWindowsGitToPath(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') return env

  const extra: string[] = []
  for (const dir of winGitCmdDirs()) {
    if (existsSync(join(dir, 'git.exe'))) extra.push(dir)
  }
  if (extra.length === 0) return env

  const pathSep = ';'
  const currentPath = env.PATH ?? env.Path ?? ''
  const prefix = extra.join(pathSep)
  const nextPath = currentPath ? `${prefix}${pathSep}${currentPath}` : prefix

  return {
    ...env,
    PATH: nextPath,
    Path: nextPath
  }
}
