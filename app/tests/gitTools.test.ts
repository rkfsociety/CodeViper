import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { resolve, join } from 'path'
import { gitStatus, gitDiff, gitLog, gitCommit } from '../electron/main/gitTools'

// Корень репозитория — два уровня вверх от папки app/
const REPO_ROOT = resolve(__dirname, '../..')

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
    const outsidePath = resolve(REPO_ROOT, '../../outside-test-dir')
    const result = await gitStatus(REPO_ROOT, outsidePath)
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

function initTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cv-git-commit-'))
  execSync('git init', { cwd: dir, stdio: 'ignore' })
  execSync('git config user.email test@test.com', { cwd: dir, stdio: 'ignore' })
  execSync('git config user.name Test', { cwd: dir, stdio: 'ignore' })
  return dir
}

describe('gitCommit', () => {
  it('создаёт коммит staged-файла с экранированием в spawn', async () => {
    const dir = initTempRepo()
    try {
      writeFileSync(join(dir, 'a.txt'), 'v1', 'utf8')
      execSync('git add a.txt', { cwd: dir, stdio: 'ignore' })

      const message = 'feat: "quotes" & special\'chars'
      const result = await gitCommit(dir, message)
      expect(result).toMatch(/^exit: 0/)

      const log = execSync('git log -1 --pretty=%s', { cwd: dir, encoding: 'utf8' }).trim()
      expect(log).toBe(message)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('отклоняет пустое сообщение', async () => {
    const dir = initTempRepo()
    try {
      const result = await gitCommit(dir, '   ')
      expect(result).toMatch(/Пустое сообщение/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('отклоняет сообщение, начинающееся с -', async () => {
    const dir = initTempRepo()
    try {
      const result = await gitCommit(dir, '--allow-empty')
      expect(result).toMatch(/не может начинаться/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
