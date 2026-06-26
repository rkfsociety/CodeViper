import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'

const userDataDir = mkdtempSync(join(tmpdir(), 'cv-bundled-source-'))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? userDataDir : process.cwd())
  }
}))

import {
  getBundledSourceRoot,
  runBundledSourceStartupSync,
  setGitRunnerForTests,
  shouldRunBundledSourceStartupSync,
  syncBundledSource,
  syncBundledSourceIfEnabled,
  type GitRunResult
} from '../electron/main/bundledSourceSync'

describe('bundledSourceSync', () => {
  beforeEach(() => {
    setGitRunnerForTests(null)
  })

  afterEach(() => {
    setGitRunnerForTests(null)
    rmSync(join(userDataDir, 'source'), { recursive: true, force: true })
    rmSync(join(userDataDir, 'logs'), { recursive: true, force: true })
  })

  it('getBundledSourceRoot указывает на userData/source', () => {
    expect(getBundledSourceRoot()).toBe(join(userDataDir, 'source'))
  })

  it('без клона возвращает { updated: false }', async () => {
    const result = await syncBundledSource()
    expect(result).toEqual({ updated: false })
  })

  it('без pull если нет .git даже при наличии папки source', async () => {
    mkdirSync(join(userDataDir, 'source'), { recursive: true })
    const gitCalls: string[][] = []

    setGitRunnerForTests(async (_cwd, args) => {
      gitCalls.push(args)
      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await syncBundledSource()
    expect(result).toEqual({ updated: false })
    expect(gitCalls).toHaveLength(0)
  })

  it('после успешного pull с новым HEAD — updated: true', async () => {
    const root = join(userDataDir, 'source')
    mkdirSync(join(root, '.git'), { recursive: true })

    let head = 'aaa1111'
    setGitRunnerForTests(async (_cwd, args) => {
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return { code: 0, stdout: `${head}\n`, stderr: '' }
      }
      if (args[0] === 'pull') {
        head = 'bbb2222'
        return { code: 0, stdout: 'Already up to date.\n', stderr: '' }
      }
      if (args[0] === 'diff') {
        return { code: 0, stdout: 'app/electron/main/agent.ts\n', stderr: '' }
      }
      return { code: 1, stdout: '', stderr: 'unexpected' }
    })

    const result = await syncBundledSource()
    expect(result).toEqual({ updated: true, localHead: 'bbb2222', appDirChanged: true })
  })

  it('если HEAD не изменился — updated: false', async () => {
    const root = join(userDataDir, 'source')
    mkdirSync(join(root, '.git'), { recursive: true })

    setGitRunnerForTests(async (_cwd, args): Promise<GitRunResult> => {
      if (args[0] === 'rev-parse') {
        return { code: 0, stdout: 'samehash\n', stderr: '' }
      }
      if (args[0] === 'pull') {
        return { code: 0, stdout: 'Already up to date.\n', stderr: '' }
      }
      return { code: 1, stdout: '', stderr: 'unexpected' }
    })

    const result = await syncBundledSource()
    expect(result).toEqual({ updated: false, localHead: 'samehash' })
  })

  it('ошибка pull возвращает error и localHead до pull', async () => {
    const root = join(userDataDir, 'source')
    mkdirSync(join(root, '.git'), { recursive: true })

    setGitRunnerForTests(async (_cwd, args): Promise<GitRunResult> => {
      if (args[0] === 'rev-parse') {
        return { code: 0, stdout: 'beforepull\n', stderr: '' }
      }
      if (args[0] === 'pull') {
        return { code: 1, stdout: '', stderr: 'fatal: not possible to fast-forward\n' }
      }
      return { code: 1, stdout: '', stderr: 'unexpected' }
    })

    const result = await syncBundledSource()
    expect(result.updated).toBe(false)
    expect(result.localHead).toBe('beforepull')
    expect(result.error).toMatch(/fast-forward/)
  })

  it('syncBundledSourceIfEnabled не вызывает git при liveRuntimeFromGit=false', async () => {
    const root = join(userDataDir, 'source')
    mkdirSync(join(root, '.git'), { recursive: true })
    const gitCalls: string[][] = []

    setGitRunnerForTests(async (_cwd, args) => {
      gitCalls.push(args)
      return { code: 0, stdout: 'abc\n', stderr: '' }
    })

    const result = await syncBundledSourceIfEnabled(false)
    expect(result).toBeNull()
    expect(gitCalls).toHaveLength(0)
  })

  it('syncBundledSourceIfEnabled вызывает sync при liveRuntimeFromGit=true', async () => {
    const root = join(userDataDir, 'source')
    mkdirSync(join(root, '.git'), { recursive: true })

    setGitRunnerForTests(async (_cwd, args): Promise<GitRunResult> => {
      if (args[0] === 'rev-parse') return { code: 0, stdout: 'same\n', stderr: '' }
      if (args[0] === 'pull') return { code: 0, stdout: '', stderr: '' }
      return { code: 1, stdout: '', stderr: '' }
    })

    const result = await syncBundledSourceIfEnabled(true)
    expect(result).toEqual({ updated: false, localHead: 'same' })
  })
})

describe('runBundledSourceStartupSync', () => {
  beforeEach(() => {
    setGitRunnerForTests(null)
  })

  afterEach(() => {
    setGitRunnerForTests(null)
    rmSync(join(userDataDir, 'source'), { recursive: true, force: true })
    rmSync(join(userDataDir, 'logs'), { recursive: true, force: true })
  })

  it('shouldRunBundledSourceStartupSync учитывает packaged и liveRuntimeFromGit', () => {
    expect(shouldRunBundledSourceStartupSync({ isPackaged: true, liveRuntimeFromGit: true })).toBe(
      true
    )
    expect(shouldRunBundledSourceStartupSync({ isPackaged: false, liveRuntimeFromGit: true })).toBe(
      false
    )
    expect(shouldRunBundledSourceStartupSync({ isPackaged: true, liveRuntimeFromGit: false })).toBe(
      false
    )
  })

  it('packaged + liveRuntimeFromGit — вызывает git pull', async () => {
    const root = join(userDataDir, 'source')
    mkdirSync(join(root, '.git'), { recursive: true })
    const gitCalls: string[][] = []

    setGitRunnerForTests(async (_cwd, args): Promise<GitRunResult> => {
      gitCalls.push(args)
      if (args[0] === 'rev-parse') return { code: 0, stdout: 'head\n', stderr: '' }
      if (args[0] === 'pull') return { code: 0, stdout: '', stderr: '' }
      return { code: 1, stdout: '', stderr: '' }
    })

    await runBundledSourceStartupSync(true, { isPackaged: true, startupWaitMs: 100 })
    expect(gitCalls.some((args) => args[0] === 'pull')).toBe(true)
  })

  it('не packaged — sync не вызывается', async () => {
    mkdirSync(join(userDataDir, 'source', '.git'), { recursive: true })
    const gitCalls: string[][] = []

    setGitRunnerForTests(async (_cwd, args) => {
      gitCalls.push(args)
      return { code: 0, stdout: '', stderr: '' }
    })

    await runBundledSourceStartupSync(true, { isPackaged: false })
    expect(gitCalls).toHaveLength(0)
  })

  it('liveRuntimeFromGit=false — sync не вызывается', async () => {
    mkdirSync(join(userDataDir, 'source', '.git'), { recursive: true })
    const gitCalls: string[][] = []

    setGitRunnerForTests(async (_cwd, args) => {
      gitCalls.push(args)
      return { code: 0, stdout: '', stderr: '' }
    })

    await runBundledSourceStartupSync(false, { isPackaged: true })
    expect(gitCalls).toHaveLength(0)
  })

  it('не блокирует дольше startupWaitMs при медленном pull', async () => {
    const root = join(userDataDir, 'source')
    mkdirSync(join(root, '.git'), { recursive: true })

    setGitRunnerForTests(async (_cwd, args): Promise<GitRunResult> => {
      if (args[0] === 'rev-parse') return { code: 0, stdout: 'head\n', stderr: '' }
      if (args[0] === 'pull') {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 1, stdout: '', stderr: '' }
    })

    const started = Date.now()
    await runBundledSourceStartupSync(true, { isPackaged: true, startupWaitMs: 50 })
    expect(Date.now() - started).toBeLessThan(150)
  })
})
