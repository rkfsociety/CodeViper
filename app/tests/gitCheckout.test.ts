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

import { gitCheckout } from '../electron/main/gitTools'

function gitKey(args: string[]): string {
  return args.join(' ')
}

function defaultGitHandler(args: string[]): GitResult {
  const key = gitKey(args)
  if (key === 'rev-parse --show-toplevel') {
    return { code: 0, stdout: '/repo\n', stderr: '' }
  }
  if (key === 'status --porcelain') {
    return { code: 0, stdout: '', stderr: '' }
  }
  if (key === 'switch feature') {
    return { code: 0, stdout: '', stderr: '' }
  }
  if (key === 'switch -f feature') {
    return { code: 0, stdout: '', stderr: '' }
  }
  return { code: 1, stdout: '', stderr: `unexpected: ${key}` }
}

describe('gitCheckout (mocked git)', () => {
  const projectPath = '/fake/project'

  beforeEach(() => {
    resetGitMocks()
    setGitHandler(defaultGitHandler)
  })

  afterEach(() => {
    resetGitMocks()
  })

  it('переключает ветку на чистом дереве через git switch', async () => {
    const result = await gitCheckout(projectPath, { branch: 'feature' })
    expect(result).toMatch(/^exit: 0/)
    expect(gitCalls).toContainEqual(['switch', 'feature'])
  })

  it('блокирует checkout при dirty tree без force', async () => {
    setGitHandler((args) => {
      if (gitKey(args) === 'rev-parse --show-toplevel') {
        return { code: 0, stdout: '/repo\n', stderr: '' }
      }
      if (gitKey(args) === 'status --porcelain') {
        return { code: 0, stdout: ' M dirty.txt\n', stderr: '' }
      }
      return { code: 1, stdout: '', stderr: 'unexpected' }
    })

    const result = await gitCheckout(projectPath, { branch: 'feature' })
    expect(result).toMatch(/рабочее дерево не чистое/)
    expect(result).toMatch(/force=true/)
    expect(gitCalls.find((args) => args[0] === 'switch')).toBeUndefined()
  })

  it('разрешает checkout при dirty tree с force=true', async () => {
    setGitHandler((args) => {
      if (gitKey(args) === 'rev-parse --show-toplevel') {
        return { code: 0, stdout: '/repo\n', stderr: '' }
      }
      if (gitKey(args) === 'status --porcelain') {
        return { code: 0, stdout: ' M dirty.txt\n', stderr: '' }
      }
      if (gitKey(args) === 'switch -f feature') {
        return { code: 0, stdout: '', stderr: '' }
      }
      return { code: 1, stdout: '', stderr: `unexpected: ${gitKey(args)}` }
    })

    const result = await gitCheckout(projectPath, { branch: 'feature', force: 'true' })
    expect(result).toMatch(/^exit: 0/)
    expect(gitCalls).toContainEqual(['switch', '-f', 'feature'])
  })

  it('отклоняет пустое имя ветки', async () => {
    const result = await gitCheckout(projectPath, { branch: '   ' })
    expect(result).toMatch(/Не указана ветка/)
  })
})
