import { describe, it, expect, vi } from 'vitest'

// agent.ts тянет memory/skills, которые импортируют electron — мокаем.
vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/agent' }
}))

import { parseToolArgs } from '../electron/main/agent'

describe('parseToolArgs', () => {
  it('возвращает объект как есть', () => {
    const args = { path: '/a/b.ts' }
    expect(parseToolArgs(args)).toBe(args)
  })

  it('парсит JSON-строку аргументов', () => {
    expect(parseToolArgs('{"path":"/a/b.ts","content":"x"}')).toEqual({
      path: '/a/b.ts',
      content: 'x'
    })
  })

  it('при невалидном JSON возвращает { _raw } вместо краша', () => {
    const result = parseToolArgs('{битый')
    expect(result).toEqual({ _raw: '{битый' })
  })

  it('при пустой строке возвращает { _raw }', () => {
    const result = parseToolArgs('')
    expect(result).toEqual({ _raw: '' })
  })
})
