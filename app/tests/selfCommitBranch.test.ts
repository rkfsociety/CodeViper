import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: () => process.cwd() }
}))

vi.mock('../electron/main/codeviperSource', () => ({
  getCodeViperSourceRoot: () => '/repo/app'
}))

vi.mock('../electron/main/githubAuth', () => ({
  resolveGitRepoRoot: async () => '/repo'
}))

import {
  ensureSelfImproveBranch,
  syncSelfImproveBranchWithOriginMaster,
  setSelfCommitGitRunnerForTests
} from '../electron/main/selfCommit'

type GitResult = { code: number; stdout: string; stderr: string }

describe('ensureSelfImproveBranch', () => {
  beforeEach(() => {
    setSelfCommitGitRunnerForTests(null)
  })

  afterEach(() => {
    setSelfCommitGitRunnerForTests(null)
  })

  it('rebase на origin/master после checkout существующей agent/self-improve', async () => {
    const calls: string[][] = []
    setSelfCommitGitRunnerForTests(async (_cwd, args) => {
      calls.push([...args])
      const key = args.join(' ')
      if (key.includes('rev-parse --abbrev-ref HEAD')) {
        return { code: 0, stdout: 'master\n', stderr: '' }
      }
      if (key.includes('show-ref --verify --quiet refs/heads/agent/self-improve')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      if (key.includes('show-ref --verify --quiet refs/remotes/origin/master')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      if (key.includes('rev-list --count HEAD..origin/master')) {
        return { code: 0, stdout: '3\n', stderr: '' }
      }
      if (key.startsWith('fetch origin master')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      if (key.startsWith('checkout agent/self-improve')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      if (key.startsWith('rebase --autostash origin/master')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      if (key.startsWith('rebase --abort')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await ensureSelfImproveBranch()
    expect(result.ok).toBe(true)
    expect(result.branch).toBe('agent/self-improve')
    expect(result.message).toContain('подтянут origin/master')
    expect(calls.some((a) => a.join(' ').startsWith('rebase --autostash origin/master'))).toBe(true)
  })

  it('новая agent/self-improve создаётся от origin/master', async () => {
    const calls: string[][] = []
    setSelfCommitGitRunnerForTests(async (_cwd, args) => {
      calls.push([...args])
      const key = args.join(' ')
      if (key.includes('rev-parse --abbrev-ref HEAD')) {
        return { code: 0, stdout: 'master\n', stderr: '' }
      }
      if (key.includes('show-ref --verify --quiet refs/heads/agent/self-improve')) {
        return { code: 1, stdout: '', stderr: '' }
      }
      if (key.includes('show-ref --verify --quiet refs/remotes/origin/master')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      if (key.includes('rev-list --count HEAD..origin/master')) {
        return { code: 0, stdout: '0\n', stderr: '' }
      }
      if (key.startsWith('fetch origin master')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      if (args.join(' ') === 'checkout -b agent/self-improve origin/master') {
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await ensureSelfImproveBranch()
    expect(result.ok).toBe(true)
    expect(calls.some((a) => a.join(' ') === 'checkout -b agent/self-improve origin/master')).toBe(
      true
    )
  })

  it('syncSelfImproveBranchWithOriginMaster пропускает rebase если уже актуально', async () => {
    const calls: string[][] = []
    setSelfCommitGitRunnerForTests(async (_cwd, args) => {
      calls.push([...args])
      const key = args.join(' ')
      if (key.startsWith('fetch origin master')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      if (key.includes('show-ref --verify --quiet refs/remotes/origin/master')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      if (key.includes('rev-list --count HEAD..origin/master')) {
        return { code: 0, stdout: '0\n', stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await syncSelfImproveBranchWithOriginMaster('/repo')
    expect(result.ok).toBe(true)
    expect(result.rebased).toBe(false)
    expect(calls.some((a) => a.join(' ').startsWith('rebase --autostash'))).toBe(false)
  })

  it('syncSelfImproveBranchWithOriginMaster abort при конфликте rebase', async () => {
    const calls: string[][] = []
    setSelfCommitGitRunnerForTests(async (_cwd, args) => {
      calls.push([...args])
      const key = args.join(' ')
      if (key.startsWith('fetch origin master')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      if (key.includes('show-ref --verify --quiet refs/remotes/origin/master')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      if (key.includes('rev-list --count HEAD..origin/master')) {
        return { code: 0, stdout: '2\n', stderr: '' }
      }
      if (key.startsWith('rebase --autostash origin/master')) {
        return { code: 1, stdout: '', stderr: 'CONFLICT' }
      }
      if (key.startsWith('rebase --abort')) {
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await syncSelfImproveBranchWithOriginMaster('/repo')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/конфликт/i)
    expect(calls.some((a) => a.join(' ') === 'rebase --abort')).toBe(true)
  })
})
