import { describe, it, expect } from 'vitest'
import { buildAgentPlanPrompt } from '../electron/main/agentPlan'

describe('agentPlan', () => {
  it('buildAgentPlanPrompt требует нумерованные шаги', () => {
    const prompt = buildAgentPlanPrompt('найди magic numbers', '/proj')
    expect(prompt).toContain('1.')
    expect(prompt).toContain('/proj')
    expect(prompt).toMatch(/не пересказывай/i)
  })
})
