import { describe, it, expect, beforeEach } from 'vitest'
import { SelfImprovementPlanStore } from '../electron/main/selfImprovementStore'

describe('SelfImprovementPlanStore', () => {
  let store: SelfImprovementPlanStore

  beforeEach(() => {
    store = new SelfImprovementPlanStore()
  })

  it('хранит и завершает пункты плана', () => {
    store.set([
      { id: '1', title: 'A', done: false },
      { id: '2', title: 'B', done: false }
    ])
    store.complete('1')
    const plan = store.get()
    expect(plan?.[0].done).toBe(true)
    expect(store.isComplete()).toBe(false)
    store.complete('2')
    expect(store.isComplete()).toBe(true)
  })

  it('изолирован между экземплярами', () => {
    const other = new SelfImprovementPlanStore()
    store.set([{ id: '1', title: 'A', done: false }])
    expect(store.has()).toBe(true)
    expect(other.has()).toBe(false)
  })
})
