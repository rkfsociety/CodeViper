import { describe, it, expect, beforeEach } from 'vitest'
import {
  resetSelfImprovementPlan,
  setSelfImprovementPlan,
  completeSelfImprovementItem,
  getSelfImprovementPlan,
  isSelfImprovementPlanComplete
} from '../electron/main/selfImprovementStore'

describe('selfImprovementStore', () => {
  beforeEach(() => {
    resetSelfImprovementPlan()
  })

  it('хранит и завершает пункты плана', () => {
    setSelfImprovementPlan([
      { id: '1', title: 'A', done: false },
      { id: '2', title: 'B', done: false }
    ])
    completeSelfImprovementItem('1')
    const plan = getSelfImprovementPlan()
    expect(plan?.[0].done).toBe(true)
    expect(isSelfImprovementPlanComplete()).toBe(false)
    completeSelfImprovementItem('2')
    expect(isSelfImprovementPlanComplete()).toBe(true)
  })
})
