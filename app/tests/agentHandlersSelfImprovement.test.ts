import { describe, it, expect, vi } from 'vitest'
import { createSelfImprovementToolHandlers } from '../electron/main/agentHandlersSelfImprovement'
import { SelfImprovementPlanStore } from '../electron/main/selfImprovementStore'

describe('agentHandlersSelfImprovement', () => {
  it('complete_self_improvement_item принимает item_id (Gemini)', async () => {
    const store = new SelfImprovementPlanStore()
    const emit = vi.fn()
    const handlers = createSelfImprovementToolHandlers(store, emit)
    store.set([
      { id: '1', title: 'Шаг A', done: false },
      { id: '2', title: 'Шаг B', done: false }
    ])
    const result = await handlers.complete_self_improvement_item!({
      item_id: '1'
    } as unknown as { id: string | number })
    expect(result).toContain('Пункт 1 выполнен')
    expect(store.get()?.[0].done).toBe(true)
  })
})
