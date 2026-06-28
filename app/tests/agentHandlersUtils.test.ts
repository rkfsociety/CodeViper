import { describe, it, expect } from 'vitest'
import { resolveEditToolArgs, resolveToolPathArg } from '../electron/main/agentHandlersUtils'

describe('agentHandlersUtils', () => {
  it('resolveToolPathArg читает path, paths[0] и file_path', () => {
    expect(resolveToolPathArg({ path: 'app/src/App.tsx' })).toBe('app/src/App.tsx')
    expect(resolveToolPathArg({ paths: ['app/src/App.tsx'] })).toBe('app/src/App.tsx')
    expect(resolveToolPathArg({ paths: '["electron/main/agent.ts"]' })).toBe(
      'electron/main/agent.ts'
    )
    expect(resolveToolPathArg({ file_path: 'shared/constants.ts' })).toBe('shared/constants.ts')
    expect(resolveToolPathArg({})).toBeUndefined()
  })

  it('resolveEditToolArgs отклоняет content/new_content без old_string', () => {
    const r1 = resolveEditToolArgs({
      path: 'electron/main/foo.ts',
      content: 'whole file'
    })
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.error).toMatch(/old_string/i)

    const r2 = resolveEditToolArgs({
      file_path: 'electron/main/foo.ts',
      new_content: 'whole file'
    })
    expect(r2.ok).toBe(false)
    if (!r2.ok) expect(r2.error).toMatch(/content\/new_content/i)
  })

  it('resolveEditToolArgs принимает path + old_string + new_string', () => {
    const r = resolveEditToolArgs({
      path: 'src/App.tsx',
      old_string: 'foo',
      new_string: 'bar'
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.args.path).toBe('src/App.tsx')
      expect(r.args.old_string).toBe('foo')
      expect(r.args.new_string).toBe('bar')
    }
  })
})
