import { describe, expect, it } from 'vitest'
import { UpdateInfoSchema } from '../shared/updateInfo'

describe('UpdateInfoSchema', () => {
  it('принимает git-обновление', () => {
    const parsed = UpdateInfoSchema.parse({ source: 'git', commits: 3 })
    expect(parsed.source).toBe('git')
  })

  it('принимает release-обновление', () => {
    const parsed = UpdateInfoSchema.parse({
      source: 'release',
      version: '0.2.0',
      ready: true
    })
    expect(parsed.ready).toBe(true)
  })

  it('принимает release с прогрессом загрузки', () => {
    const parsed = UpdateInfoSchema.parse({
      source: 'release',
      version: '0.2.1',
      ready: false,
      percent: 42.5,
      transferred: 150_000_000,
      total: 360_000_000,
      bytesPerSecond: 3_500_000
    })
    if (parsed.source !== 'release') throw new Error('expected release')
    expect(parsed.percent).toBe(42.5)
    expect(parsed.transferred).toBe(150_000_000)
  })
})
