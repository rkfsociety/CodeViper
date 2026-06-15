import { describe, it, expect } from 'vitest'
import { gitStatus, gitDiff, gitLog } from '../electron/main/gitTools'

const REPO_ROOT = 'F:/github/CodeViper'

describe('gitTools', () => {
  it('git_status возвращает статус репозитория', async () => {
    const result = await gitStatus(REPO_ROOT)
    expect(result).toMatch(/^exit: 0/)
    expect(result).toMatch(/stdout:/)
  })

  it('git_log возвращает историю коммитов', async () => {
    const result = await gitLog(REPO_ROOT, { limit: '3', oneline: 'true' })
    expect(result).toMatch(/^exit: 0/)
    expect(result).toMatch(/stdout:/)
  })

  it('git_diff работает для рабочей копии', async () => {
    const result = await gitDiff(REPO_ROOT)
    expect(result).toMatch(/^exit: \d/)
  })

  it('отклоняет path вне проекта', async () => {
    const result = await gitStatus(REPO_ROOT, 'C:/Windows/System32')
    expect(result).toMatch(/вне проекта/)
  })

  it('отклоняет недопустимую ссылку коммита', async () => {
    const result = await gitDiff(REPO_ROOT, { commit: 'HEAD; rm -rf /' })
    expect(result).toMatch(/Недопустимая ссылка git/)
  })

  it('сообщает если не git-репозиторий', async () => {
    const result = await gitStatus('C:/Windows')
    expect(result).toMatch(/Не git-репозиторий/)
  })
})
