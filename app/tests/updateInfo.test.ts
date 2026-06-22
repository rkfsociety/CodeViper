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
})
