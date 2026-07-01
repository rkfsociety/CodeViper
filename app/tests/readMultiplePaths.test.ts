import { describe, it, expect } from 'vitest'
import { parseReadMultiplePaths } from '../shared/readMultiplePaths'
import { normalizeToolLoopSignature, buildToolBatchSignature } from '../shared/toolLoopGuard'

describe('parseReadMultiplePaths', () => {
  it('принимает массив строк (Gemini / cloud)', () => {
    expect(parseReadMultiplePaths(['b.ts', 'a.ts'])).toEqual(['b.ts', 'a.ts'])
  })

  it('принимает JSON-строку (Ollama)', () => {
    expect(parseReadMultiplePaths('["b.ts","a.ts"]')).toEqual(['b.ts', 'a.ts'])
  })

  it('принимает CSV', () => {
    expect(parseReadMultiplePaths('a.ts, b.ts')).toEqual(['a.ts', 'b.ts'])
  })

  it('пустое значение → []', () => {
    expect(parseReadMultiplePaths(undefined)).toEqual([])
    expect(parseReadMultiplePaths('')).toEqual([])
    expect(parseReadMultiplePaths([])).toEqual([])
  })
})

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

  it('ignores offset/limit for read_file', () => {
    const sig = normalizeToolLoopSignature('read_file', {
      path: 'electron/main/agent.ts',
      limit: '100'
    })
    expect(sig).toBe('read_file:electron/main/agent.ts')
  })

  it('sorts paths in read_multiple_files (JSON string)', () => {
    const sig = normalizeToolLoopSignature('read_multiple_files', {
      paths: '["b.ts","a.ts"]'
    })
    expect(sig).toBe('read_multiple_files:a.ts|b.ts')
  })

  it('sorts paths in read_multiple_files (array from cloud provider)', () => {
    const sig = normalizeToolLoopSignature('read_multiple_files', {
      paths: ['b.ts', 'a.ts']
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

describe('buildToolBatchSignature', () => {
  it('не зависит от порядка вызовов', () => {
    const a = buildToolBatchSignature(['find_files:{"pattern":"a"}', 'project_stats:{"_raw":""}'])
    const b = buildToolBatchSignature(['project_stats:{"_raw":""}', 'find_files:{"pattern":"a"}'])
    expect(a).toBe(b)
  })
})
