import { describe, it, expect } from 'vitest'
import type { AgentSkill } from '../src/types'
import {
  formatAppliedSkillsBlock,
  scoreSkill,
  shouldApplySkill,
  SKILL_APPLY_THRESHOLD
} from '../shared/skillMatching'

function makeSkill(overrides: Partial<AgentSkill> = {}): AgentSkill {
  return {
    id: 'todo-helper',
    name: 'Todo Helper',
    description: 'Управление задачами',
    instructions: 'Шаг 1: прочитай skill-data\nШаг 2: обнови список',
    triggers: ['todo', 'задачи'],
    scope: 'global',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    useCount: 0,
    ...overrides
  }
}

describe('skillMatching', () => {
  it('повышает score при совпадении триггера', () => {
    const skill = makeSkill()
    expect(scoreSkill(skill, 'сделай todo список')).toBeGreaterThanOrEqual(SKILL_APPLY_THRESHOLD)
  })

  it('не применяет builtin навыки автоматически', () => {
    const skill = makeSkill({ id: 'viper-files' })
    expect(shouldApplySkill(skill, 'todo list', true)).toBe(false)
  })

  it('применяет global user skill при совпадении триггера', () => {
    const skill = makeSkill()
    expect(shouldApplySkill(skill, 'обнови todo', false)).toBe(true)
  })

  it('не применяет project skill', () => {
    const skill = makeSkill({ scope: 'project' })
    expect(shouldApplySkill(skill, 'todo list', false)).toBe(false)
  })

  it('formatAppliedSkillsBlock включает инструкции', () => {
    const block = formatAppliedSkillsBlock([makeSkill()])
    expect(block).toContain('Применяемые навыки агента')
    expect(block).toContain('Шаг 1: прочитай skill-data')
  })
})
