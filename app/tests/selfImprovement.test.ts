import { describe, it, expect } from 'vitest'
import {
  isSelfImprovementTask,
  selfImprovementStepLimit,
  parsePlanItemsJson,
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

  it('увеличивает лимит шагов для самоулучшения', () => {
    expect(selfImprovementStepLimit(12)).toBe(20)
    expect(selfImprovementStepLimit(25)).toBe(25)
    expect(selfImprovementStepLimit(30)).toBe(30)
  })

  it('парсит JSON плана', () => {
    const items = parsePlanItemsJson('[{"id":"1","title":"Skill X"},{"title":"UI"}]')
    expect(items).toHaveLength(2)
    expect(items[0].done).toBe(false)
    expect(items[1].id).toBe('2')
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
