import { describe, it, expect, vi } from 'vitest'
import { SelfImprovementOrchestrator } from '../electron/main/agentSelfImprovementOrchestrator'
import { SelfImprovementPlanStore } from '../electron/main/selfImprovementStore'
import { buildPlanFromRoadmapItem } from '../shared/selfImprovement'

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

  it('recordToolInvocations создаёт план при первом read_roadmap_item', () => {
    const { store, orchestrator } = createOrchestrator()
    orchestrator.setRoadmapContext(1)

    const inv = {
      name: 'read_roadmap_item',
      output: ROADMAP_OUTPUT,
      args: { number: '1' }
    }
    const nudge = orchestrator.recordToolInvocations([inv])
    expect(nudge).toContain('Пункт ROADMAP уже прочитан')
    expect(store.has()).toBe(true)
    expect(store.get()?.[0].title).toContain('OpenAI client')
  })

  it('handleNoToolCalls автоплан при кэше ROADMAP и pseudo read_roadmap_item тексте', () => {
    const { store, orchestrator } = createOrchestrator()
    orchestrator.setRoadmapContext(1)
    orchestrator.setRoadmapItemDetail({
      num: 1,
      action: 'Добавить custom provider',
      verification: 'npm run typecheck'
    })

    const adopted = orchestrator.handleNoToolCalls('read_roadmap_item number=1', undefined, true)
    expect(adopted.action).toBe('continue')
    expect(store.has()).toBe(true)
    if (adopted.action === 'continue') {
      expect(adopted.nudgeMessage).toContain('Следующий пункт')
    }
  })

  it('handleNoToolCalls passthrough при симуляции вывода инструмента', () => {
    const { store, orchestrator } = createOrchestrator()
    store.adopt(
      buildPlanFromRoadmapItem({
        num: 1,
        action: 'правка',
        verification: 'npm test'
      })
    )
    const fake =
      'Для начала выполним несколько шагов для разведки:\n\nВывод: Чтение файла `a.ts` завершено.'
    expect(orchestrator.handleNoToolCalls(fake, undefined, true)).toEqual({ action: 'passthrough' })
    expect(store.get()?.[0].blocked).toBeFalsy()
  })
})
