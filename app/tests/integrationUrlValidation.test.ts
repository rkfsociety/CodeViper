import { describe, expect, it } from 'vitest'
import {
  collectIntegrationUrlIssues,
  formatIntegrationUrlIssuesOutput,
  normalizeGitLabBaseUrl,
  normalizeJiraBaseUrl
} from '../electron/main/integrationUrlValidation'

describe('normalizeGitLabBaseUrl', () => {
  it('accepts bare hostname', () => {
    expect(normalizeGitLabBaseUrl('gitlab.example.com')).toEqual({
      ok: true,
      value: 'https://gitlab.example.com'
    })
  })

  it('rejects MR deep link', () => {
    const result = normalizeGitLabBaseUrl('https://gitlab.com/group/proj/-/merge_requests/1')
    expect(result.ok).toBe(false)
  })
})

describe('normalizeJiraBaseUrl', () => {
  it('requires value when token would be used elsewhere', () => {
    expect(normalizeJiraBaseUrl('')).toEqual({
      ok: false,
      error: expect.stringContaining('Jira URL')
    })
  })
})

describe('collectIntegrationUrlIssues', () => {
  it('reports gitlab token without url', () => {
    const issues = collectIntegrationUrlIssues({ gitlabToken: 'glpat-test' })
    expect(issues.some((i) => i.field === 'gitlabUrl')).toBe(true)
  })

  it('reports invalid webhook', () => {
    const issues = collectIntegrationUrlIssues({ webhookUrl: '://bad' })
    expect(issues[0]?.field).toBe('webhookUrl')
  })

  it('passes clean integration settings', () => {
    const issues = collectIntegrationUrlIssues({
      gitlabUrl: 'https://gitlab.com',
      gitlabToken: 'token',
      jiraUrl: 'https://example.atlassian.net',
      jiraToken: 'token'
    })
    expect(issues).toEqual([])
  })
})

describe('formatIntegrationUrlIssuesOutput', () => {
  it('reports clean state', () => {
    expect(formatIntegrationUrlIssuesOutput([])).toContain('не найдено')
  })
})
