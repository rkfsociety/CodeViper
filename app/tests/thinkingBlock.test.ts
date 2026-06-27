import { describe, expect, it } from 'vitest'
import { THINKING_LANGUAGE_HINT } from '../shared/reasoning'

describe('thinking UX', () => {
  it('THINKING_LANGUAGE_HINT требует язык пользователя для thinking', () => {
    expect(THINKING_LANGUAGE_HINT).toMatch(/язык/i)
    expect(THINKING_LANGUAGE_HINT).toMatch(/thinking/i)
  })
})
