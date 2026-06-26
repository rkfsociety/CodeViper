import { describe, it, expect } from 'vitest'
import {
  isSelfImprovementTask,
  isRoadmapSelfImprovementTask,
  parseRoadmapTaskItemNumber,
  isCodeViperSourceRelativePath,
  buildRoadmapSelfImproveHint,
  selfImprovementStepLimit,
  parsePlanItemsJson,
  parsePlanFromAssistantText,
  parseChecklistAsPlan,
  syncPlanFromChecklist,
  isPlanComplete,
  formatPlanSummary,
  buildSelfImprovementContinueNudge
} from '../shared/selfImprovement'

describe('selfImprovement', () => {
  it('распознаёт запрос на самоулучшение', () => {
    expect(isSelfImprovementTask('изучи код и начни улучшать себя')).toBe(true)
    expect(isSelfImprovementTask('Улучши себя: добавь skill')).toBe(true)
    expect(isSelfImprovementTask('привет')).toBe(false)
  })

  it('распознаёт ROADMAP-промпт', () => {
    const msg = 'Выполни пункт 3 из ROADMAP.md — самоулучшение CodeViper.'
    expect(isRoadmapSelfImprovementTask(msg)).toBe(true)
    expect(isSelfImprovementTask(msg)).toBe(true)
    expect(parseRoadmapTaskItemNumber(msg)).toBe(3)
  })

  it('определяет пути исходников CodeViper', () => {
    expect(isCodeViperSourceRelativePath('tests/agent.test.ts')).toBe(true)
    expect(isCodeViperSourceRelativePath('../ROADMAP.md')).toBe(true)
    expect(isCodeViperSourceRelativePath('src/App.tsx')).toBe(false)
  })

  it('строит ROADMAP-hint', () => {
    const hint = buildRoadmapSelfImproveHint(1, 'F:/github/CodeViper/app')
    expect(hint).toMatch(/пункт/i)
    expect(hint).toContain('codeviper')
    expect(hint).toContain('Program Files')
    expect(hint).toContain('../electron/main/')
  })

  it('увеличивает лимит шагов для самоулучшения', () => {
    expect(selfImprovementStepLimit(12)).toBe(200)
    expect(selfImprovementStepLimit(150)).toBe(200)
    expect(selfImprovementStepLimit(250)).toBe(250)
  })

  it('парсит JSON плана', () => {
    const items = parsePlanItemsJson('[{"id":"1","title":"Skill X"},{"title":"UI"}]')
    expect(items).toHaveLength(2)
    expect(items[0].done).toBe(false)
    expect(items[1].id).toBe('2')
  })

  it('парсит JSON план из текста ответа', () => {
    const text = `План:
[{"id":"1","title":"Изучить agent.ts"},{"id":"2","title":"Добавить skill"}]
tool_response {"name": "read_codeviper_file", "arguments": {"path": "agent.ts"}}`
    const plan = parsePlanFromAssistantText(text)
    expect(plan).toHaveLength(2)
    expect(plan?.[0].title).toContain('agent.ts')
  })

  it('парсит markdown checklist', () => {
    const plan = parseChecklistAsPlan(`План:
- [ ] Пункт A
- [x] Пункт B`)
    expect(plan).toHaveLength(2)
    expect(plan?.[1].done).toBe(true)
  })

  it('синхронизирует статус из checklist', () => {
    const plan = [
      { id: '1', title: 'Пункт A', done: false },
      { id: '2', title: 'Пункт B', done: false }
    ]
    syncPlanFromChecklist('- [x] Пункт A', plan)
    expect(plan[0].done).toBe(true)
    expect(isPlanComplete(plan)).toBe(false)
  })

  it('форматирует план и nudge', () => {
    const plan = [
      { id: '1', title: 'A', done: true },
      { id: '2', title: 'B', done: false }
    ]
    expect(formatPlanSummary(plan)).toContain('1/2')
    expect(buildSelfImprovementContinueNudge(plan)).toContain('B')
  })
})
