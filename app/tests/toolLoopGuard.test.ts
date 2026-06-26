import { describe, it, expect } from 'vitest'
import { normalizeToolLoopSignature } from '../shared/toolLoopGuard'

describe('normalizeToolLoopSignature', () => {
  it('ignores offset/limit for read_file', () => {
    const a = normalizeToolLoopSignature('read_file', { path: 'app/foo.ts', offset: '0' })
    const b = normalizeToolLoopSignature('read_file', {
      path: 'app/foo.ts',
      offset: '50',
      limit: '20'
    })
    expect(a).toBe(b)
    expect(a).toBe('read_file:app/foo.ts')
  })

  it('ignores offset/limit for read_codeviper_file', () => {
    const sig = normalizeToolLoopSignature('read_codeviper_file', {
      path: 'electron/main/agent.ts',
      limit: '100'
    })
    expect(sig).toBe('read_codeviper_file:electron/main/agent.ts')
  })

  it('sorts paths in read_multiple_files', () => {
    const sig = normalizeToolLoopSignature('read_multiple_files', {
      paths: '["b.ts","a.ts"]'
    })
    expect(sig).toBe('read_multiple_files:a.ts|b.ts')
  })

  it('keeps full args for mutating tools', () => {
    const sig = normalizeToolLoopSignature('edit_file', {
      path: 'x.ts',
      old_string: 'a',
      new_string: 'b'
    })
    expect(sig).toContain('edit_file:')
    expect(sig).toContain('old_string')
  })
})
