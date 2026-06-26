import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

const { mockSpawn, gitCalls, setGitHandler, resetGitMocks } = vi.hoisted(() => {
  const gitCalls: string[][] = []
  let handler: (args: string[]) => GitResult = () => ({
    code: 1,
    stdout: '',
    stderr: 'unconfigured git mock'
  })

  const mockSpawn = vi.fn((cmd: string, args: string[]) => {
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
    resetGitMocks: () => {
      gitCalls.length = 0
      handler = () => ({ code: 1, stdout: '', stderr: 'unconfigured git mock' })
      mockSpawn.mockClear()
    }
  }
})

vi.mock('child_process', () => ({
  spawn: mockSpawn
}))

import { gitPush } from '../electron/main/gitTools'

function gitKey(args: string[]): string {
  return args.join(' ')
}

function defaultGitHandler(args: string[]): GitResult {
  const key = gitKey(args)
  if (key === 'rev-parse --show-toplevel') {
    return { code: 0, stdout: '/repo\n', stderr: '' }
  }
  if (key === 'push') {
    return { code: 0, stdout: '', stderr: '' }
  }
  if (key === 'push origin') {
    return { code: 0, stdout: '', stderr: '' }
  }
  if (key === 'push origin main') {
    return { code: 0, stdout: '', stderr: '' }
  }
  return { code: 1, stdout: '', stderr: `unexpected: ${key}` }
}

describe('gitPush (mocked git)', () => {
  const projectPath = '/fake/project'

  beforeEach(() => {
    resetGitMocks()
    setGitHandler(defaultGitHandler)
  })

  afterEach(() => {
    resetGitMocks()
  })

  it('вызывает git push без аргументов по умолчанию', async () => {
    const result = await gitPush(projectPath)
    expect(result).toMatch(/^exit: 0/)
    expect(gitCalls).toContainEqual(['push'])
  })

  it('вызывает git push origin', async () => {
    const result = await gitPush(projectPath, { remote: 'origin' })
    expect(result).toMatch(/^exit: 0/)
    expect(gitCalls).toContainEqual(['push', 'origin'])
  })

  it('вызывает git push origin main', async () => {
    const result = await gitPush(projectPath, { remote: 'origin', branch: 'main' })
    expect(result).toMatch(/^exit: 0/)
    expect(gitCalls).toContainEqual(['push', 'origin', 'main'])
  })

  it('возвращает подсказку при non-fast-forward', async () => {
    setGitHandler((args) => {
      if (gitKey(args) === 'rev-parse --show-toplevel') {
        return { code: 0, stdout: '/repo\n', stderr: '' }
      }
      if (args[0] === 'push') {
        return {
          code: 1,
          stdout: '',
          stderr:
            '! [rejected]        main -> main (non-fast-forward)\nerror: failed to push some refs'
        }
      }
      return { code: 1, stdout: '', stderr: 'unexpected' }
    })

    const result = await gitPush(projectPath, { remote: 'origin', branch: 'main' })
    expect(result).toMatch(/non-fast-forward/)
    expect(result).toMatch(/git pull/)
    expect(result).toMatch(/^exit: 1/)
  })

  it('требует remote при указании branch', async () => {
    const result = await gitPush(projectPath, { branch: 'main' })
    expect(result).toMatch(/remote вместе с branch/)
    expect(gitCalls.find((args) => args[0] === 'push')).toBeUndefined()
  })

  it('отклоняет недопустимое имя remote', async () => {
    const result = await gitPush(projectPath, { remote: 'origin; rm -rf /' })
    expect(result).toMatch(/Недопустимое имя remote/)
  })
})
