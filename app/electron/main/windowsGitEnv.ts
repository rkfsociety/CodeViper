import { existsSync } from 'fs'
import { homedir } from 'os'
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
  if (winGitCmdDirsOverride) return winGitCmdDirsOverride

  const dirs: string[] = [...DEFAULT_WIN_GIT_CMD_DIRS]
  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) dirs.push(join(localAppData, 'Programs', 'Git', 'cmd'))
  const userProfile = process.env.USERPROFILE
  if (userProfile) {
    dirs.push(join(userProfile, 'scoop', 'apps', 'git', 'current', 'cmd'))
    dirs.push(join(userProfile, 'scoop', 'shims'))
  }
  return dirs
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
  return prependWindowsGhToPath(prependWindowsGitToPath(ensureWindowsUserEnv(env)))
}

/** USERPROFILE/APPDATA для gh keyring, если GUI-процесс стартовал с урезанным env. */
export function ensureWindowsUserEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') return env

  const next = { ...env }
  if (!next.USERPROFILE?.trim()) next.USERPROFILE = homedir()

  const profile = next.USERPROFILE?.trim()
  if (!next.APPDATA?.trim() && profile) {
    next.APPDATA = join(profile, 'AppData', 'Roaming')
  }
  if (!next.LOCALAPPDATA?.trim() && profile) {
    next.LOCALAPPDATA = join(profile, 'AppData', 'Local')
  }

  return next
}

/** Полный путь к gh.exe на Windows; иначе `gh` из PATH. */
export function resolveGhExecutable(): string {
  if (process.platform === 'win32') {
    for (const dir of winGhDirs()) {
      const exe = join(dir, 'gh.exe')
      if (existsSync(exe)) return exe
    }
  }
  return 'gh'
}

/** Полный путь к git.exe на Windows; иначе `git` из PATH. */
export function resolveGitExecutable(): string {
  if (process.platform === 'win32') {
    for (const dir of winGitCmdDirs()) {
      const exe = join(dir, 'git.exe')
      if (existsSync(exe)) return exe
    }
  }
  return 'git'
}

/** Базовые опции spawn для git/gh из GUI-процесса Electron (Windows PATH + профиль). */
export function cliSpawnBase(cwd: string): {
  cwd: string
  windowsHide: true
  env: NodeJS.ProcessEnv
} {
  return {
    cwd,
    windowsHide: true,
    env: prependWindowsCliToolsToPath(process.env)
  }
}

/** PATH + профиль пользователя — env для spawn gh/git из установленного .exe. */
export function ghSpawnEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return prependWindowsCliToolsToPath(env)
}
