import { describe, it, expect, vi } from 'vitest'
import { SelfImprovementOrchestrator } from '../electron/main/agentSelfImprovementOrchestrator'
import { SelfImprovementPlanStore } from '../electron/main/selfImprovementStore'
import { AUTO_ADOPT_ROADMAP_PLAN_AFTER_NUDGES } from '../shared/selfImprovement'

const ROADMAP_OUTPUT = `Пункт 1 · M · OpenAI-compatible endpoint (chain)

Цель: провайдер custom
Файлы: openaiProvider.ts, modelRuntime.ts
Действие: переиспользовать OpenAI client с baseUrl
Проверка: npm run typecheck; npm test -- openaiProvider`

describe('SelfImprovementOrchestrator', () => {
  function createOrchestrator() {
    const store = new SelfImprovementPlanStore()
    const emit = vi.fn()
    const orchestrator = new SelfImprovementOrchestrator(
      store,
      emit,
      {} as never,
      {} as never,
      '/tmp/project'
    )
    return { store, emit, orchestrator }
  }

  it('recordToolInvocations создаёт план при повторном read_roadmap_item', () => {
    const { store, orchestrator } = createOrchestrator()
    orchestrator.setRoadmapContext(1)

    const inv = {
      name: 'read_roadmap_item',
      output: ROADMAP_OUTPUT,
      args: { number: '1' }
    }
    expect(orchestrator.recordToolInvocations([inv])).toBeNull()
    const nudge = orchestrator.recordToolInvocations([inv])
    expect(nudge).toContain('Пункт ROADMAP уже прочитан')
    expect(store.has()).toBe(true)
    expect(store.get()?.[0].title).toContain('OpenAI client')
  })

  it('handleNoToolCalls автоплан после N nudges при кэше ROADMAP', () => {
    const { store, orchestrator } = createOrchestrator()
    orchestrator.setRoadmapContext(1)
    orchestrator.setRoadmapItemDetail({
      num: 1,
      action: 'Добавить custom provider',
      verification: 'npm run typecheck'
    })

    for (let i = 0; i < AUTO_ADOPT_ROADMAP_PLAN_AFTER_NUDGES - 1; i++) {
      const r = orchestrator.handleNoToolCalls('опишу план текстом', undefined, true)
      expect(r.action).toBe('continue')
      expect(store.has()).toBe(false)
    }

    const adopted = orchestrator.handleNoToolCalls('ещё текст без tool call', undefined, true)
    expect(adopted.action).toBe('continue')
    expect(store.has()).toBe(true)
    if (adopted.action === 'continue') {
      expect(adopted.nudgeMessage).toContain('Следующий пункт')
    }
  })
})
