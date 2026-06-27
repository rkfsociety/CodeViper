import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { prependWindowsGitToPath, setWinGitCmdDirsForTests } from '../electron/main/windowsGitEnv'

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
