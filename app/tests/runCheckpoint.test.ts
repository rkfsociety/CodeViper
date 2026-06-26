import { EventEmitter } from 'events'
import { execSync } from 'child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

const { mockSpawn, gitCalls, setGitHandler, resetGitMocks, setUseRealSpawn, getUseRealSpawn } =
  vi.hoisted(() => {
    const gitCalls: string[][] = []
    let useRealSpawn = false
    let handler: (args: string[]) => GitResult = () => ({
      code: 1,
      stdout: '',
      stderr: 'unconfigured git mock'
    })

    const mockSpawn = vi.fn((cmd: string, args: string[], options?: { cwd?: string }) => {
      if (cmd !== 'git') throw new Error(`unexpected command: ${cmd}`)
      gitCalls.push([...args])
      const result = handler(args)
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter
        stderr: EventEmitter
      }
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      queueMicrotask(() => {
        if (result.stdout) child.stdout.emit('data', Buffer.from(result.stdout))
        if (result.stderr) child.stderr.emit('data', Buffer.from(result.stderr))
        child.emit('close', result.code)
      })
      return child
    })

    return {
      mockSpawn,
      gitCalls,
      setGitHandler: (fn: (args: string[]) => GitResult) => {
        handler = fn
      },
      setUseRealSpawn: (value: boolean) => {
        useRealSpawn = value
      },
      resetGitMocks: () => {
        gitCalls.length = 0
        useRealSpawn = false
        handler = () => ({ code: 1, stdout: '', stderr: 'unconfigured git mock' })
        mockSpawn.mockClear()
      },
      getUseRealSpawn: () => useRealSpawn
    }
  })

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>()
  const realSpawn = actual.spawn
  return {
    ...actual,
    spawn: (cmd: string, args: string[], options?: { cwd?: string }) => {
      if (getUseRealSpawn()) return realSpawn(cmd, args, options)
      return mockSpawn(cmd, args, options)
    }
  }
})

import {
  clearRunCheckpoint,
  ensureRunCheckpoint,
  hasRunCheckpoint,
  rollbackRunCheckpoint
} from '../electron/main/runCheckpoint'

function gitKey(args: string[]): string {
  return args.join(' ')
}

function defaultGitHandler(args: string[]): GitResult {
  const key = gitKey(args)
  if (key === 'rev-parse --is-inside-work-tree') {
    return { code: 0, stdout: 'true\n', stderr: '' }
  }
  if (key === 'rev-parse HEAD') {
    return { code: 0, stdout: 'abc123head\n', stderr: '' }
  }
  if (key === 'status --porcelain') {
    return { code: 0, stdout: '', stderr: '' }
  }
  if (key.startsWith('stash create')) {
    return { code: 0, stdout: 'stash-sha-xyz\n', stderr: '' }
  }
  if (key.startsWith('reset --hard')) {
    return { code: 0, stdout: '', stderr: '' }
  }
  if (key === 'clean -fd') {
    return { code: 0, stdout: '', stderr: '' }
  }
  return { code: 1, stdout: '', stderr: `unexpected: ${key}` }
}

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, encoding: 'utf8' }).trim()
}

describe('runCheckpoint (mocked git)', () => {
  const chatId = 'mock-chat-1'
  const projectPath = '/fake/project'

  beforeEach(() => {
    resetGitMocks()
    setGitHandler(defaultGitHandler)
    clearRunCheckpoint(chatId)
  })

  afterEach(() => {
    clearRunCheckpoint(chatId)
  })

  it('вызывает git stash create -u при локальных изменениях', async () => {
    setGitHandler((args) => {
      if (gitKey(args) === 'status --porcelain') {
        return { code: 0, stdout: ' M dirty.txt\n', stderr: '' }
      }
      return defaultGitHandler(args)
    })

    const ok = await ensureRunCheckpoint(chatId, projectPath)
    expect(ok).toBe(true)
    expect(hasRunCheckpoint(chatId)).toBe(true)

    const stashCall = gitCalls.find((args) => args[0] === 'stash' && args[1] === 'create')
    expect(stashCall).toEqual(['stash', 'create', '-u', '-m', `codeviper-run:${chatId}`])
  })

  it('не вызывает stash create на чистом дереве', async () => {
    const ok = await ensureRunCheckpoint(chatId, projectPath)
    expect(ok).toBe(true)

    const stashCall = gitCalls.find((args) => args[0] === 'stash')
    expect(stashCall).toBeUndefined()
  })

  it('rollback применяет stash через reset --hard и clean -fd', async () => {
    setGitHandler((args) => {
      if (gitKey(args) === 'status --porcelain') {
        return { code: 0, stdout: ' M dirty.txt\n', stderr: '' }
      }
      return defaultGitHandler(args)
    })

    await ensureRunCheckpoint(chatId, projectPath)
    gitCalls.length = 0

    const result = await rollbackRunCheckpoint(chatId)
    expect(result.ok).toBe(true)
    expect(result.message).toBe('Все правки прогона отменены')
    expect(hasRunCheckpoint(chatId)).toBe(false)

    expect(gitCalls).toContainEqual(['rev-parse', '--is-inside-work-tree'])
    expect(gitCalls).toContainEqual(['reset', '--hard', 'stash-sha-xyz'])
    expect(gitCalls).toContainEqual(['clean', '-fd'])
  })

  it('rollback без stash откатывает к HEAD', async () => {
    await ensureRunCheckpoint(chatId, projectPath)
    gitCalls.length = 0

    const result = await rollbackRunCheckpoint(chatId)
    expect(result.ok).toBe(true)
    expect(gitCalls).toContainEqual(['reset', '--hard', 'abc123head'])
    expect(gitCalls).toContainEqual(['clean', '-fd'])
  })

  it('не создаёт дубликат чекпоинта при повторном вызове', async () => {
    await ensureRunCheckpoint(chatId, projectPath)
    const callsAfterFirst = gitCalls.length

    await ensureRunCheckpoint(chatId, projectPath)
    expect(gitCalls.length).toBe(callsAfterFirst)
  })
})

describe('runCheckpoint (integration)', () => {
  let projectDir: string
  const chatId = 'test-chat-1'

  beforeEach(() => {
    resetGitMocks()
    setUseRealSpawn(true)
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
