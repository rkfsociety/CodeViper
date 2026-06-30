import { describe, expect, it } from 'vitest'

import {
  collectInvalidAutomationRules,
  validateAutomationRuleCron
} from '../electron/main/automationScheduler'

describe('validateAutomationRuleCron', () => {
  it('returns issue for invalid cron expression', () => {
    const result = validateAutomationRuleCron({
      id: 'broken',
      cron: '61 * * * *',
      prompt: 'ping',
      enabled: true
    })

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.issue).toMatchObject({
        ruleId: 'broken',
        cron: '61 * * * *'
      })
      expect(result.issue.message).toContain('minute')
    }
  })

  it('accepts valid 5-field cron expression', () => {
    const result = validateAutomationRuleCron({
      id: 'ok',
      cron: '*/15 9-17 * * 1-5',
      prompt: 'weekday check-in',
      enabled: true
    })

    expect(result.valid).toBe(true)
    if (!result.valid) expect(result.issue).toBeUndefined()
  })
})

describe('collectInvalidAutomationRules', () => {
  it('reports only invalid enabled rules', () => {
    const issues = collectInvalidAutomationRules([
      { id: 'ok', cron: '0 12 * * *', prompt: 'lunch', enabled: true },
      { id: 'broken', cron: '* * *', prompt: 'broken', enabled: true },
      { id: 'disabled', cron: '* * *', prompt: 'skip', enabled: false }
    ])

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      ruleId: 'broken',
      cron: '* * *'
    })
  })
})
