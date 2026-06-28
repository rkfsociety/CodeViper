import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'

const userDataDir = mkdtempSync(join(tmpdir(), 'cv-bundled-source-'))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? userDataDir : process.cwd())
  }
}))

vi.mock('../electron/main/settings', () => ({
  loadSettings: vi.fn().mockResolvedValue({}),
  saveSettings: vi.fn().mockResolvedValue({})
}))

import {
  ensureBundledSourceClone,
  getBundledSourceRoot,
  resetBundledSourceCloneStateForTests,
  runBundledSourceStartupSync,
  setGitRunnerForTests,
  shouldRunBundledSourceStartupSync,
  syncBundledSource,
  syncBundledSourceIfEnabled,
  type GitRunResult
} from '../electron/main/bundledSourceSync'
import { getBundledSourceAppRoot } from '../electron/main/bundledSourceBuild'

describe('bundledSourceSync', () => {
  beforeEach(() => {
    setGitRunnerForTests(null)
    resetBundledSourceCloneStateForTests()
  })

  afterEach(() => {
    setGitRunnerForTests(null)
    rmSync(join(userDataDir, 'source'), { recursive: true, force: true })
    rmSync(join(userDataDir, 'logs'), { recursive: true, force: true })
  })

  it('getBundledSourceRoot указывает на userData/source', () => {
    expect(getBundledSourceRoot()).toBe(join(userDataDir, 'source'))
  })

  it('getBundledSourceAppRoot указывает на userData/source/app', () => {
    expect(getBundledSourceAppRoot()).toBe(join(userDataDir, 'source', 'app'))
  })

  it('без клона и без git в PATH возвращает { updated: false }', async () => {
    setGitRunnerForTests(async (_cwd, args) => {
      if (args[0] === '--version') return { code: 127, stdout: '', stderr: 'not found' }
      return { code: 1, stdout: '', stderr: '' }
    })

    const result = await syncBundledSource()
    expect(result).toEqual({ updated: false })
  })

  it('без клона пытается git clone и возвращает { updated: false } при неудаче', async () => {
    setGitRunnerForTests(async (_cwd, args) => {
      if (args[0] === '--version') return { code: 0, stdout: 'git version 2.0\n', stderr: '' }
      if (args[0] === 'clone') return { code: 1, stdout: '', stderr: 'network error' }
      return { code: 1, stdout: '', stderr: 'unexpected' }
    })

    const result = await syncBundledSource()
    expect(result).toEqual({ updated: false })
  })

  it('без pull если clone не удался и папка source не пустая', async () => {
    mkdirSync(join(userDataDir, 'source'), { recursive: true })
    writeFileSync(join(userDataDir, 'source', 'junk.txt'), 'x')
    const gitCalls: string[][] = []

    setGitRunnerForTests(async (_cwd, args) => {
      gitCalls.push(args)
      if (args[0] === '--version') return { code: 0, stdout: 'git version 2.0\n', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await syncBundledSource()
    expect(result).toEqual({ updated: false })
    expect(gitCalls.some((args) => args[0] === 'clone')).toBe(false)
  })

  it('ensureBundledSourceClone создаёт клон и прописывает gitRepoRoot', async () => {
    const { saveSettings } = await import('../electron/main/settings')
    const mockedSaveSettings = vi.mocked(saveSettings)

    setGitRunnerForTests(async (_cwd, args) => {
      if (args[0] === '--version') return { code: 0, stdout: 'git version 2.0\n', stderr: '' }
      if (args[0] === 'clone') {
        const root = join(userDataDir, 'source')
        mkdirSync(join(root, '.git'), { recursive: true })
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 1, stdout: '', stderr: 'unexpected' }
    })

    const root = await ensureBundledSourceClone()
    expect(root).toBe(join(userDataDir, 'source'))
    expect(mockedSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ gitRepoRoot: join(userDataDir, 'source') })
    )
  })

  it('ensureBundledSourceClone возвращает существующий клон без повторного clone', async () => {
    const root = join(userDataDir, 'source')
    mkdirSync(join(root, '.git'), { recursive: true })
    const gitCalls: string[][] = []

    setGitRunnerForTests(async (_cwd, args) => {
      gitCalls.push(args)
      return { code: 0, stdout: '', stderr: '' }
    })

    await expect(ensureBundledSourceClone()).resolves.toBe(root)
    expect(gitCalls.some((args) => args[0] === 'clone')).toBe(false)
  })

  it('после успешного sync с новым HEAD — updated: true', async () => {
    const root = join(userDataDir, 'source')
    mkdirSync(join(root, '.git'), { recursive: true })

    let head = 'aaa1111'
    setGitRunnerForTests(async (_cwd, args) => {
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return { code: 0, stdout: `${head}\n`, stderr: '' }
      }
      if (args[0] === 'fetch') {
        head = 'bbb2222'
        return { code: 0, stdout: '', stderr: '' }
      }
      if (args[0] === 'checkout') {
        return { code: 0, stdout: '', stderr: '' }
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
      if (args[0] === 'fetch' || args[0] === 'checkout') {
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 1, stdout: '', stderr: 'unexpected' }
    })

    const result = await syncBundledSource()
    expect(result).toEqual({ updated: false, localHead: 'samehash' })
  })

  it('ошибка fetch возвращает error и localHead до sync', async () => {
    const root = join(userDataDir, 'source')
    mkdirSync(join(root, '.git'), { recursive: true })

    setGitRunnerForTests(async (_cwd, args): Promise<GitRunResult> => {
      if (args[0] === 'rev-parse') {
        return { code: 0, stdout: 'beforesync\n', stderr: '' }
      }
      if (args[0] === 'fetch') {
        return { code: 1, stdout: '', stderr: 'fatal: unable to access\n' }
      }
      return { code: 1, stdout: '', stderr: 'unexpected' }
    })

    const result = await syncBundledSource()
    expect(result.updated).toBe(false)
    expect(result.localHead).toBe('beforesync')
    expect(result.error).toMatch(/unable to access/)
  })

  it('sync сбрасывает agent/* на master через fetch + checkout -f', async () => {
    const root = join(userDataDir, 'source')
    mkdirSync(join(root, '.git'), { recursive: true })
    const gitCalls: string[][] = []

    setGitRunnerForTests(async (_cwd, args): Promise<GitRunResult> => {
      gitCalls.push(args)
      if (args[0] === 'rev-parse') {
        return { code: 0, stdout: 'agenthead\n', stderr: '' }
      }
      if (args[0] === 'fetch' || args[0] === 'checkout') {
        return { code: 0, stdout: '', stderr: '' }
      }
      if (args[0] === 'diff') {
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 1, stdout: '', stderr: 'unexpected' }
    })

    await syncBundledSource()
    expect(gitCalls.some((args) => args[0] === 'fetch' && args.includes('master'))).toBe(true)
    expect(
      gitCalls.some(
        (args) =>
          args[0] === 'checkout' &&
          args.includes('-f') &&
          args.includes('-B') &&
          args.includes('master')
      )
    ).toBe(true)
    expect(gitCalls.some((args) => args[0] === 'pull')).toBe(false)
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
      if (args[0] === 'fetch' || args[0] === 'checkout') return { code: 0, stdout: '', stderr: '' }
      return { code: 1, stdout: '', stderr: '' }
    })

    const result = await syncBundledSourceIfEnabled(true)
    expect(result).toEqual({ updated: false, localHead: 'same' })
  })
})

describe('runBundledSourceStartupSync', () => {
  beforeEach(() => {
    setGitRunnerForTests(null)
    resetBundledSourceCloneStateForTests()
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

  it('packaged + liveRuntimeFromGit — вызывает git fetch master', async () => {
    const root = join(userDataDir, 'source')
    mkdirSync(join(root, '.git'), { recursive: true })
    const gitCalls: string[][] = []

    setGitRunnerForTests(async (_cwd, args): Promise<GitRunResult> => {
      gitCalls.push(args)
      if (args[0] === 'rev-parse') return { code: 0, stdout: 'head\n', stderr: '' }
      if (args[0] === 'fetch' || args[0] === 'checkout') return { code: 0, stdout: '', stderr: '' }
      return { code: 1, stdout: '', stderr: '' }
    })

    await runBundledSourceStartupSync(true, { isPackaged: true, startupWaitMs: 100 })
    expect(gitCalls.some((args) => args[0] === 'fetch' && args.includes('master'))).toBe(true)
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
      if (args[0] === 'fetch' || args[0] === 'checkout') {
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
