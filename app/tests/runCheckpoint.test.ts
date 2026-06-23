import { execSync } from 'child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearRunCheckpoint,
  ensureRunCheckpoint,
  hasRunCheckpoint,
  rollbackRunCheckpoint
} from '../electron/main/runCheckpoint'

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf8' }).trim()
}

describe('runCheckpoint', () => {
  let projectDir: string
  const chatId = 'test-chat-1'

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cv-run-checkpoint-'))
    git(projectDir, 'init')
    git(projectDir, 'config user.email test@test.com')
    git(projectDir, 'config user.name Test')
    writeFileSync(join(projectDir, 'a.txt'), 'v1', 'utf8')
    git(projectDir, 'add a.txt')
    git(projectDir, 'commit -m init')
    clearRunCheckpoint(chatId)
  })

  afterEach(() => {
    clearRunCheckpoint(chatId)
  })

  it('создаёт чекпоинт и откатывает правки в 3 файлах', async () => {
    const ok = await ensureRunCheckpoint(chatId, projectDir)
    expect(ok).toBe(true)
    expect(hasRunCheckpoint(chatId)).toBe(true)

    writeFileSync(join(projectDir, 'a.txt'), 'changed', 'utf8')
    writeFileSync(join(projectDir, 'b.txt'), 'new', 'utf8')
    writeFileSync(join(projectDir, 'c.txt'), 'also new', 'utf8')

    const result = await rollbackRunCheckpoint(chatId)
    expect(result.ok).toBe(true)
    expect(hasRunCheckpoint(chatId)).toBe(false)
    expect(readFileSync(join(projectDir, 'a.txt'), 'utf8')).toBe('v1')
    expect(existsSync(join(projectDir, 'b.txt'))).toBe(false)
    expect(existsSync(join(projectDir, 'c.txt'))).toBe(false)
  })

  it('откатывает снимок с локальными изменениями до прогона', async () => {
    writeFileSync(join(projectDir, 'a.txt'), 'dirty-before', 'utf8')

    await ensureRunCheckpoint(chatId, projectDir)
    writeFileSync(join(projectDir, 'a.txt'), 'agent-edit', 'utf8')
    writeFileSync(join(projectDir, 'd.txt'), 'agent-new', 'utf8')

    const result = await rollbackRunCheckpoint(chatId)
    expect(result.ok).toBe(true)
    expect(readFileSync(join(projectDir, 'a.txt'), 'utf8')).toBe('dirty-before')
    expect(existsSync(join(projectDir, 'd.txt'))).toBe(false)
  })

  it('не создаёт дубликат чекпоинта', async () => {
    await ensureRunCheckpoint(chatId, projectDir)
    writeFileSync(join(projectDir, 'a.txt'), 'first-mutation', 'utf8')
    await ensureRunCheckpoint(chatId, projectDir)
    writeFileSync(join(projectDir, 'a.txt'), 'second-mutation', 'utf8')

    await rollbackRunCheckpoint(chatId)
    expect(readFileSync(join(projectDir, 'a.txt'), 'utf8')).toBe('v1')
  })
})
