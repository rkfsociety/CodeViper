import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import {
  ensureWindowsUserEnv,
  prependWindowsGitToPath,
  prependWindowsGhToPath,
  resolveGhExecutable,
  resolveGitExecutable,
  setWinGitCmdDirsForTests,
  setWinGhDirsForTests
} from '../electron/main/windowsGitEnv'

describe('prependWindowsGitToPath', () => {
  afterEach(() => {
    setWinGitCmdDirsForTests(null)
  })

  it('на non-win32 не меняет env', () => {
    if (process.platform === 'win32') return

    const env = { PATH: '/usr/bin' }
    expect(prependWindowsGitToPath(env)).toBe(env)
  })

  it('на win32 добавляет Git cmd в PATH', () => {
    if (process.platform !== 'win32') return

    const gitDir = mkdtempSync(join(tmpdir(), 'cv-git-cmd-'))
    writeFileSync(join(gitDir, 'git.exe'), '')
    setWinGitCmdDirsForTests([gitDir])

    const result = prependWindowsGitToPath({ PATH: 'C:\\Windows' })
    expect(result.PATH).toContain(gitDir)
    expect(result.PATH).toContain('C:\\Windows')
    expect(result.Path).toBe(result.PATH)

    rmSync(gitDir, { recursive: true, force: true })
  })

  it('на win32 без git.exe не меняет PATH', () => {
    if (process.platform !== 'win32') return

    const emptyDir = mkdtempSync(join(tmpdir(), 'cv-git-empty-'))
    mkdirSync(emptyDir, { recursive: true })
    setWinGitCmdDirsForTests([emptyDir])

    const env = { PATH: 'C:\\Windows' }
    expect(prependWindowsGitToPath(env)).toBe(env)

    rmSync(emptyDir, { recursive: true, force: true })
  })
})

describe('prependWindowsGhToPath', () => {
  afterEach(() => {
    setWinGhDirsForTests(null)
  })

  it('на non-win32 не меняет env', () => {
    if (process.platform === 'win32') return

    const env = { PATH: '/usr/bin' }
    expect(prependWindowsGhToPath(env)).toBe(env)
  })

  it('на win32 добавляет gh.exe в PATH', () => {
    if (process.platform !== 'win32') return

    const ghDir = mkdtempSync(join(tmpdir(), 'cv-gh-'))
    writeFileSync(join(ghDir, 'gh.exe'), '')
    setWinGhDirsForTests([ghDir])

    const result = prependWindowsGhToPath({ PATH: 'C:\\Windows' })
    expect(result.PATH).toContain(ghDir)
    expect(result.PATH).toContain('C:\\Windows')
    expect(result.Path).toBe(result.PATH)

    rmSync(ghDir, { recursive: true, force: true })
  })

  it('на win32 без gh.exe не меняет PATH', () => {
    if (process.platform !== 'win32') return

    const emptyDir = mkdtempSync(join(tmpdir(), 'cv-gh-empty-'))
    mkdirSync(emptyDir, { recursive: true })
    setWinGhDirsForTests([emptyDir])

    const env = { PATH: 'C:\\Windows' }
    expect(prependWindowsGhToPath(env)).toBe(env)

    rmSync(emptyDir, { recursive: true, force: true })
  })
})

describe('ensureWindowsUserEnv', () => {
  it('на non-win32 не меняет env', () => {
    if (process.platform === 'win32') return

    const env = { PATH: '/usr/bin' }
    expect(ensureWindowsUserEnv(env)).toBe(env)
  })

  it('на win32 подставляет USERPROFILE и APPDATA', () => {
    if (process.platform !== 'win32') return

    const result = ensureWindowsUserEnv({ PATH: 'C:\\Windows' })
    expect(result.USERPROFILE).toBeTruthy()
    expect(result.APPDATA).toContain('AppData')
    expect(result.LOCALAPPDATA).toContain('AppData')
  })
})

describe('resolveGitExecutable', () => {
  afterEach(() => {
    setWinGitCmdDirsForTests(null)
  })

  it('на win32 возвращает полный путь к git.exe', () => {
    if (process.platform !== 'win32') return

    const gitDir = mkdtempSync(join(tmpdir(), 'cv-git-bin-'))
    writeFileSync(join(gitDir, 'git.exe'), '')
    setWinGitCmdDirsForTests([gitDir])

    expect(resolveGitExecutable()).toBe(join(gitDir, 'git.exe'))

    rmSync(gitDir, { recursive: true, force: true })
  })

  it('без git.exe возвращает git', () => {
    if (process.platform !== 'win32') {
      expect(resolveGitExecutable()).toBe('git')
      return
    }

    const emptyDir = mkdtempSync(join(tmpdir(), 'cv-git-miss-'))
    setWinGitCmdDirsForTests([emptyDir])
    expect(resolveGitExecutable()).toBe('git')
    rmSync(emptyDir, { recursive: true, force: true })
  })
})

describe('resolveGhExecutable', () => {
  afterEach(() => {
    setWinGhDirsForTests(null)
  })

  it('на win32 возвращает полный путь к gh.exe', () => {
    if (process.platform !== 'win32') return

    const ghDir = mkdtempSync(join(tmpdir(), 'cv-gh-bin-'))
    writeFileSync(join(ghDir, 'gh.exe'), '')
    setWinGhDirsForTests([ghDir])

    expect(resolveGhExecutable()).toBe(join(ghDir, 'gh.exe'))

    rmSync(ghDir, { recursive: true, force: true })
  })

  it('без gh.exe возвращает gh', () => {
    if (process.platform !== 'win32') {
      expect(resolveGhExecutable()).toBe('gh')
      return
    }

    const emptyDir = mkdtempSync(join(tmpdir(), 'cv-gh-miss-'))
    setWinGhDirsForTests([emptyDir])
    expect(resolveGhExecutable()).toBe('gh')
    rmSync(emptyDir, { recursive: true, force: true })
  })
})
