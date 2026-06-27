import { existsSync } from 'fs'
import { join } from 'path'

/** Типичные пути Git for Windows — GUI-приложения часто не наследуют полный PATH. */
const DEFAULT_WIN_GIT_CMD_DIRS = [
  'C:\\Program Files\\Git\\cmd',
  'C:\\Program Files (x86)\\Git\\cmd'
] as const

/** Типичные пути GitHub CLI (gh) на Windows. */
const DEFAULT_WIN_GH_DIRS = [
  'C:\\Program Files\\GitHub CLI',
  'C:\\Program Files (x86)\\GitHub CLI'
] as const

let winGitCmdDirsOverride: readonly string[] | null = null
let winGhDirsOverride: readonly string[] | null = null

/** Только для unit-тестов. */
export function setWinGitCmdDirsForTests(dirs: readonly string[] | null): void {
  winGitCmdDirsOverride = dirs
}

/** Только для unit-тестов. */
export function setWinGhDirsForTests(dirs: readonly string[] | null): void {
  winGhDirsOverride = dirs
}

function winGitCmdDirs(): readonly string[] {
  return winGitCmdDirsOverride ?? DEFAULT_WIN_GIT_CMD_DIRS
}

function winGhDirs(): readonly string[] {
  if (winGhDirsOverride) return winGhDirsOverride

  const dirs: string[] = [...DEFAULT_WIN_GH_DIRS]
  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) dirs.push(join(localAppData, 'Programs', 'GitHub CLI'))
  const userProfile = process.env.USERPROFILE
  if (userProfile) dirs.push(join(userProfile, 'scoop', 'shims'))
  return dirs
}

function prependToolDirsToPath(
  env: NodeJS.ProcessEnv,
  dirs: readonly string[],
  exeName: string
): NodeJS.ProcessEnv {
  const extra: string[] = []
  for (const dir of dirs) {
    if (existsSync(join(dir, exeName))) extra.push(dir)
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

/** Добавляет каталоги git.exe в PATH/Path (Windows). */
export function prependWindowsGitToPath(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') return env
  return prependToolDirsToPath(env, winGitCmdDirs(), 'git.exe')
}

/** Добавляет каталоги gh.exe в PATH/Path (Windows). */
export function prependWindowsGhToPath(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') return env
  return prependToolDirsToPath(env, winGhDirs(), 'gh.exe')
}

/** Git + GitHub CLI — для main-процесса Electron без полного PATH пользователя. */
export function prependWindowsCliToolsToPath(
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  return prependWindowsGhToPath(prependWindowsGitToPath(env))
}
