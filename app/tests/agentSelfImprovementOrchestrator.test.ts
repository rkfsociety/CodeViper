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

  it('emitPlan отправляет todo_update для единого Todo List в UI', () => {
    const { orchestrator, emit } = createOrchestrator()
    orchestrator.emitPlan([
      { id: '1', title: 'Шаг 1', done: false },
      { id: '2', title: 'Шаг 2', done: true }
    ])
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'self_improve_plan', content: expect.any(String) })
    )
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'todo_update',
        content: 'Todo List',
        todoItems: [
          { id: '1', title: 'Шаг 1', done: false, blocked: undefined },
          { id: '2', title: 'Шаг 2', done: true, blocked: undefined }
        ]
      })
    )
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

  it('handleNoToolCalls passthrough при «Инструмент read_codeviper_file: Путь:» (trace 1782686538797)', () => {
    const { store, orchestrator } = createOrchestrator()
    store.adopt(
      buildPlanFromRoadmapItem({
        num: 1,
        action: 'пункт меню index_project',
        verification: 'индексация запускается'
      })
    )
    const fake = `Инструмент read_codeviper_file:
Путь: app/codeviper/index.ts

Содержимое файла:
typescript
export async function indexProject() {}

Инструмент complete_self_improvement_item:
ID: 2`
    expect(orchestrator.handleNoToolCalls(fake, undefined, true)).toEqual({ action: 'passthrough' })
    expect(store.get()?.[0].blocked).toBeFalsy()
  })

  it('setRoadmapItemDetail автоматически создаёт план при старте', () => {
    const { store, orchestrator } = createOrchestrator()
    orchestrator.setRoadmapContext(1)
    orchestrator.setRoadmapItemDetail({
      num: 1,
      action: 'переиспользовать OpenAI client с custom baseURL',
      verification: 'ping к mock server'
    })
    expect(store.has()).toBe(true)
    expect(store.get()?.[0].title).toContain('OpenAI client')
    expect(store.get()?.[1].title).toContain('providers.integration.test.ts')
  })

  it('handleNoToolCalls не завершает прогон при текстовом плане после read (trace 1782678329979)', () => {
    const { store, orchestrator } = createOrchestrator()
    orchestrator.setRoadmapContext(1)
    orchestrator.setRoadmapItemDetail({
      num: 1,
      action: 'переиспользовать OpenAI client с custom baseURL',
      verification: 'ping к mock server'
    })
    const prosePlan = `Конечно, давайте начнем с переиспользования OpenAI client с custom baseURL.

### Действие

1. **Обновление openaiProvider.ts:**
   - Переиспользовать существующий код для работы с OpenAI API.

### Проверка

- Провести ping к mock server и убедиться, что ответ корректен.

Теперь давайте начнем реализацию шаг за шагом.`
    const result = orchestrator.handleNoToolCalls(prosePlan, undefined, true)
    expect(result.action).toBe('continue')
    expect(store.has()).toBe(true)
    if (result.action === 'continue') {
      expect(result.requireTool).toBe(true)
      expect(result.nudgeMessage).toContain('Следующий пункт')
    }
  })

  it('handleNoToolCalls усиливает nudge при pseudo tool invocation', () => {
    const { store, orchestrator } = createOrchestrator()
    store.adopt(
      buildPlanFromRoadmapItem({
        num: 1,
        action: 'правка openaiProvider.ts',
        verification: 'npm test'
      })
    )
    const pseudo = `### Пример команды:

bash
grep_codeviper_files openaiProvider.ts "baseUrl"

Далее read_codeviper_file.`
    const result = orchestrator.handleNoToolCalls(pseudo, undefined, true)
    expect(result.action).toBe('continue')
    if (result.action === 'continue') {
      expect(result.nudgeMessage).toContain('STOP')
      expect(result.nudgeMessage).toContain('Следующий пункт')
    }
  })

  it('handleNoToolCalls восстанавливает план после exploration-only JSON (trace 1782685657649)', () => {
    const { store, orchestrator } = createOrchestrator()
    orchestrator.setRoadmapContext(1)
    orchestrator.setRoadmapItemDetail({
      num: 1,
      action: 'переиспользовать OpenAI client с custom baseURL',
      verification: 'ping к mock server'
    })
    store.reset()

    const badJson = `[
  { "id": "1", "title": "read_roadmap_item number=1" },
  { "id": "2", "title": "write_codeviper_file ../ROADMAP.md - Удалить пункт N, перенумеровать" },
  { "id": "3", "title": "write_codeviper_file ../ROADMAP_DONE.md - Запись в 'Сделано'" }
]`
    const adopted = orchestrator.adoptPlanFromText(badJson)
    expect(adopted).toBe(true)
    expect(store.has()).toBe(true)
    expect(store.get()?.[0].title).toContain('OpenAI client')
    expect(store.get()?.some((p) => p.title.includes('commit_and_push'))).toBe(true)
  })
})
