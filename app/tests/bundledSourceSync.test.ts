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
  setGitRunnerForTests,
  syncBundledSource,
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
      return { code: 1, stdout: '', stderr: 'unexpected' }
    })

    const result = await syncBundledSource()
    expect(result).toEqual({ updated: true, localHead: 'bbb2222' })
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
})
