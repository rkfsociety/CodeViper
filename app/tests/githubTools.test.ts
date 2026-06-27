import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createGistViaGh,
  createIssueViaGh,
  ensureGhReady,
  getGhLogin,
  setGhRunnerForTests
} from '../electron/main/githubTools'

vi.mock('../electron/main/codeviperSource', () => ({
  getCodeViperSourceRoot: () => 'C:/mock/app'
}))

describe('ensureGhReady', () => {
  afterEach(() => {
    setGhRunnerForTests(null)
  })

  it('возвращает ошибку, если gh не установлен', async () => {
    setGhRunnerForTests(async (args) => {
      if (args[0] === '--version') return { code: 127, stdout: '', stderr: 'not found' }
      return { code: 0, stdout: '', stderr: '' }
    })

    await expect(ensureGhReady()).resolves.toMatch(/не установлен/i)
  })

  it('возвращает ошибку, если gh не авторизован', async () => {
    setGhRunnerForTests(async (args) => {
      if (args[0] === '--version') return { code: 0, stdout: 'gh version 2.0', stderr: '' }
      if (args[0] === 'auth') return { code: 1, stdout: '', stderr: 'not logged in' }
      return { code: 0, stdout: '', stderr: '' }
    })

    await expect(ensureGhReady()).resolves.toMatch(/не авторизован/i)
  })

  it('возвращает null при готовом gh', async () => {
    setGhRunnerForTests(async (args) => {
      if (args[0] === '--version') return { code: 0, stdout: 'gh version 2.0', stderr: '' }
      if (args[0] === 'auth') return { code: 0, stdout: 'logged in', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })

    await expect(ensureGhReady()).resolves.toBeNull()
  })
})

describe('createGistViaGh', () => {
  afterEach(() => {
    setGhRunnerForTests(null)
  })

  it('создаёт gist и возвращает URL', async () => {
    setGhRunnerForTests(async (args) => {
      if (args[0] === '--version') return { code: 0, stdout: 'gh version 2.0', stderr: '' }
      if (args[0] === 'auth') return { code: 0, stdout: 'ok', stderr: '' }
      if (args[0] === 'gist') {
        return { code: 0, stdout: 'https://gist.github.com/user/abc123\n', stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await createGistViaGh({ 'trace.json': '{"ok":true}' }, 'trace report')
    expect(result.ok).toBe(true)
    expect(result.url).toBe('https://gist.github.com/user/abc123')
  })
})

describe('createIssueViaGh', () => {
  afterEach(() => {
    setGhRunnerForTests(null)
  })

  it('создаёт issue и возвращает URL', async () => {
    setGhRunnerForTests(async (args) => {
      if (args[0] === '--version') return { code: 0, stdout: 'gh version 2.0', stderr: '' }
      if (args[0] === 'auth') return { code: 0, stdout: 'ok', stderr: '' }
      if (args[0] === 'issue') {
        expect(args).toContain('-R')
        expect(args).toContain('rkfsociety/CodeViper')
        return {
          code: 0,
          stdout: 'https://github.com/rkfsociety/CodeViper/issues/42\n',
          stderr: ''
        }
      }
      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await createIssueViaGh('Trace report', 'body text', {
      repo: 'rkfsociety/CodeViper',
      labels: ['trace-report']
    })
    expect(result.ok).toBe(true)
    expect(result.url).toBe('https://github.com/rkfsociety/CodeViper/issues/42')
  })
})

describe('getGhLogin', () => {
  afterEach(() => {
    setGhRunnerForTests(null)
  })

  it('возвращает login из gh api user', async () => {
    setGhRunnerForTests(async (args) => {
      if (args[0] === '--version') return { code: 0, stdout: 'gh version 2.0', stderr: '' }
      if (args[0] === 'auth') return { code: 0, stdout: 'ok', stderr: '' }
      if (args[0] === 'api') return { code: 0, stdout: 'roman\n', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    })

    await expect(getGhLogin()).resolves.toBe('roman')
  })
})
