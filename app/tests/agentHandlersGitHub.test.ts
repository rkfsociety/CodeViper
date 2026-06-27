import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AGENT_TOOL_NAMES } from '../shared/toolCalls'

vi.mock('../electron/main/githubPr', async () => {
  const actual = await vi.importActual<typeof import('../electron/main/githubPr')>(
    '../electron/main/githubPr'
  )
  return {
    ...actual,
    listPullRequests: vi.fn()
  }
})

import { listPullRequests } from '../electron/main/githubPr'
import { createGitHubToolHandlers } from '../electron/main/agentHandlersGitHub'

const mockedListPullRequests = vi.mocked(listPullRequests)

describe('createGitHubToolHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('list_pull_requests вызывает listPullRequests и форматирует открытые PR', async () => {
    mockedListPullRequests.mockResolvedValue({
      ok: true,
      prs: [
        {
          number: 42,
          title: 'Add feature',
          headRefName: 'feature/x',
          url: 'https://github.com/org/repo/pull/42',
          isDraft: false,
          ciStatus: 'success'
        }
      ]
    })

    const handlers = createGitHubToolHandlers()
    const text = await handlers.list_pull_requests!({})

    expect(mockedListPullRequests).toHaveBeenCalledOnce()
    expect(text).toContain('Открытые PR (1)')
    expect(text).toContain('#42 Add feature')
    expect(text).toContain('feature/x')
    expect(text).toContain('CI прошёл')
    expect(text).toContain('https://github.com/org/repo/pull/42')
  })

  it('list_pull_requests возвращает ошибку из listPullRequests', async () => {
    mockedListPullRequests.mockResolvedValue({
      ok: false,
      error: 'gh не авторизован — выполните gh auth login.'
    })

    const handlers = createGitHubToolHandlers()
    const text = await handlers.list_pull_requests!({})

    expect(text).toContain('gh не авторизован')
  })
})

describe('AGENT_TOOL_NAMES', () => {
  it('содержит list_pull_requests', () => {
    expect(AGENT_TOOL_NAMES).toContain('list_pull_requests')
  })
})
