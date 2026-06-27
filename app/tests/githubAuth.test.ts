import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatGitHubAuthStatus,
  resolveGitHubToken,
  setGhRunnerForTests
} from '../electron/main/githubAuth'

vi.mock('../electron/main/settings', () => ({
  loadSettings: vi.fn()
}))

vi.mock('../electron/main/codeviperSource', () => ({
  getCodeViperSourceRoot: () => 'C:/mock/app'
}))

vi.mock('../electron/main/bundledSourceSync', () => ({
  getBundledSourceRoot: () => 'C:/mock/AppData/CodeViper/source'
}))

import { loadSettings } from '../electron/main/settings'

const mockedLoadSettings = vi.mocked(loadSettings)

describe('formatGitHubAuthStatus', () => {
  it('форматирует статус с подсказками', () => {
    const text = formatGitHubAuthStatus({
      ghInstalled: false,
      ghLoggedIn: false,
      tokenConfigured: false,
      tokenValid: false,
      gitRepoRoot: null,
      hints: ['Выполните gh auth login']
    })
    expect(text).toContain('не установлен')
    expect(text).toContain('gh auth login')
  })

  it('показывает gh CLI как источник авторизации', () => {
    const text = formatGitHubAuthStatus({
      ghInstalled: true,
      ghLoggedIn: true,
      tokenConfigured: false,
      tokenValid: true,
      authSource: 'gh-cli',
      login: 'roman',
      gitRepoRoot: null,
      hints: []
    })
    expect(text).toContain('gh CLI')
    expect(text).toContain('roman')
  })
})

describe('resolveGitHubToken', () => {
  afterEach(() => {
    setGhRunnerForTests(null)
    vi.clearAllMocks()
  })

  it('берёт token из настроек если он валиден', async () => {
    mockedLoadSettings.mockResolvedValue({
      githubToken: 'settings-token'
    } as Awaited<ReturnType<typeof loadSettings>>)

    setGhRunnerForTests(async (args) => {
      if (args[0] === '--version') return { code: 0, stdout: 'gh 2.0', stderr: '' }
      throw new Error('gh не должен вызываться')
    })

    const originalFetch = global.fetch
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/user')) {
        return new Response(JSON.stringify({ login: 'user1' }), { status: 200 })
      }
      return new Response('', { status: 404 })
    }) as typeof fetch

    await expect(resolveGitHubToken()).resolves.toBe('settings-token')
    global.fetch = originalFetch
  })

  it('fallback на gh auth token если в настройках пусто', async () => {
    mockedLoadSettings.mockResolvedValue({} as Awaited<ReturnType<typeof loadSettings>>)

    setGhRunnerForTests(async (args) => {
      const cmd = args.join(' ')
      if (cmd === '--version') return { code: 0, stdout: 'gh 2.0', stderr: '' }
      if (cmd === 'auth status') return { code: 0, stdout: 'logged in', stderr: '' }
      if (cmd === 'auth token') return { code: 0, stdout: 'gh-token\n', stderr: '' }
      return { code: 1, stdout: '', stderr: 'unexpected' }
    })

    const originalFetch = global.fetch
    global.fetch = vi.fn(async (_input, init?) => {
      const headers = init?.headers as Record<string, string> | undefined
      const auth = headers?.Authorization ?? ''
      if (auth.includes('gh-token')) {
        return new Response(JSON.stringify({ login: 'ghuser' }), { status: 200 })
      }
      return new Response('', { status: 401 })
    }) as typeof fetch

    await expect(resolveGitHubToken()).resolves.toBe('gh-token')
    global.fetch = originalFetch
  })
})
