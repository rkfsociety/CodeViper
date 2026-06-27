import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportAgentTraceToGithub } from '../electron/main/traceGithubReport'
import { setGhRunnerForTests } from '../electron/main/githubTools'
import type { AgentTraceEvent } from '../src/types'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.3.0-test' }
}))

vi.mock('../electron/main/codeviperSource', () => ({
  getCodeViperSourceRoot: () => 'C:/mock/app'
}))

const sampleEvents: AgentTraceEvent[] = [
  {
    ts: 1,
    kind: 'run_start',
    label: 'start',
    data: { model: 'test', provider: 'ollama', userMessage: 'hi' }
  },
  {
    ts: 2,
    kind: 'run_end',
    label: 'end',
    data: { status: 'ok' }
  }
]

describe('reportAgentTraceToGithub', () => {
  afterEach(() => {
    setGhRunnerForTests(null)
  })

  it('отклоняет пустой трейс', async () => {
    const result = await reportAgentTraceToGithub('chat-1', [])
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/пуст/i)
  })

  it('создаёт gist и issue через gh', async () => {
    setGhRunnerForTests(async (args) => {
      if (args[0] === '--version') return { code: 0, stdout: 'gh version 2.0', stderr: '' }
      if (args[0] === 'auth') return { code: 0, stdout: 'ok', stderr: '' }
      if (args[0] === 'api') return { code: 0, stdout: 'roman\n', stderr: '' }
      if (args[0] === 'gist') {
        return { code: 0, stdout: 'https://gist.github.com/user/abc\n', stderr: '' }
      }
      if (args[0] === 'issue') {
        return {
          code: 0,
          stdout: 'https://github.com/rkfsociety/CodeViper/issues/99\n',
          stderr: ''
        }
      }
      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await reportAgentTraceToGithub('chat-1', sampleEvents, 'C:/proj')
    expect(result.ok).toBe(true)
    expect(result.gistUrl).toContain('gist.github.com')
    expect(result.issueUrl).toContain('/issues/99')
    expect(result.title).toBeTruthy()
  })

  it('повторяет issue без метки при ошибке label', async () => {
    let issueAttempts = 0
    setGhRunnerForTests(async (args) => {
      if (args[0] === '--version') return { code: 0, stdout: 'gh version 2.0', stderr: '' }
      if (args[0] === 'auth') return { code: 0, stdout: 'ok', stderr: '' }
      if (args[0] === 'api') return { code: 0, stdout: 'roman\n', stderr: '' }
      if (args[0] === 'gist') {
        return { code: 0, stdout: 'https://gist.github.com/user/abc\n', stderr: '' }
      }
      if (args[0] === 'issue') {
        issueAttempts += 1
        if (issueAttempts === 1) {
          return { code: 1, stdout: '', stderr: 'label trace-report not found' }
        }
        return {
          code: 0,
          stdout: 'https://github.com/rkfsociety/CodeViper/issues/100\n',
          stderr: ''
        }
      }
      return { code: 0, stdout: '', stderr: '' }
    })

    const result = await reportAgentTraceToGithub('chat-1', sampleEvents)
    expect(result.ok).toBe(true)
    expect(issueAttempts).toBe(2)
    expect(result.issueUrl).toContain('/issues/100')
  })
})
