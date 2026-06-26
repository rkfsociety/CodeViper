import { describe, it, expect } from 'vitest'
import { formatGitHubAuthStatus } from '../electron/main/githubAuth'

describe('formatGitHubAuthStatus', () => {
  it('форматирует статус с подсказками', () => {
    const text = formatGitHubAuthStatus({
      ghInstalled: false,
      ghLoggedIn: false,
      tokenConfigured: false,
      tokenValid: false,
      gitRepoRoot: null,
      hints: ['Добавьте GitHub Token']
    })
    expect(text).toContain('не установлен')
    expect(text).toContain('Добавьте GitHub Token')
  })
})
