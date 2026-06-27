import { describe, it, expect } from 'vitest'
import {
  isSelfImprovementTask,
  isRoadmapSelfImprovementTask,
  isRoadmapItemBodyTask,
  parseRoadmapTaskItemNumber,
  parseTaskScopedFiles,
  isPathWithinTaskScope,
  checkTaskScopeViolation,
  isCodeViperSourceRelativePath,
  buildRoadmapSelfImproveHint,
  selfImprovementStepLimit,
  parsePlanItemsJson,
  parsePlanFromAssistantText,
  parseChecklistAsPlan,
  parseBulletListAsPlan,
  syncPlanFromChecklist,
  isPlanComplete,
  formatPlanSummary,
  buildSelfImprovementContinueNudge,
  isReadOutputTruncated
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

  it('распознаёт тело пункта ROADMAP (копипаст)', () => {
    const body = `list_pull_requests — уровень 1

Цель: tool list_pull_requests — открытые PR
Файлы: agentTools/integrations.ts, agentHandlersGitHub.ts, githubPr.ts, toolCalls.ts
Действие: handler вызывает listPullRequests()
Проверка: unit-тест mock`
    expect(isRoadmapItemBodyTask(body)).toBe(true)
    expect(isRoadmapSelfImprovementTask(body)).toBe(true)
    expect(isSelfImprovementTask(body)).toBe(true)
  })

  it('парсит «Файлы:» и проверяет scope путей', () => {
    const msg = `Цель: x
Файлы: agentTools/integrations.ts, agentHandlersGitHub.ts`
    const scoped = parseTaskScopedFiles(msg)
    expect(scoped).toEqual(['agentTools/integrations.ts', 'agentHandlersGitHub.ts'])
    expect(isPathWithinTaskScope('app/electron/main/agentHandlersGitHub.ts', scoped!)).toBe(true)
    expect(isPathWithinTaskScope('app/shared/ipcContracts.ts', scoped!)).toBe(false)
    expect(
      checkTaskScopeViolation(msg, new Set(), 'read_file', {
        path: 'app/shared/ipcContracts.ts'
      })
    ).toContain('integrations.ts')
    expect(
      checkTaskScopeViolation(msg, new Set(['edit_file']), 'read_file', {
        path: 'app/shared/ipcContracts.ts'
      })
    ).toBeNull()
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

  it('принимает поле item вместо title (Gemini)', () => {
    const items = parsePlanItemsJson('[{"id":"1","item":"Реализовать toast"}]')
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Реализовать toast')
  })

  it('принимает items как массив объектов', () => {
    const items = parsePlanItemsJson([{ id: '1', title: 'Шаг A' }])
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Шаг A')
  })

  it('парсит маркированный список вместо JSON (Gemini, fix #20)', () => {
    const raw = `
- Реализация: изменить App.tsx
- Проверка: npm run typecheck
- Обновление ROADMAP.md: удалить пункт 1`
    const items = parsePlanItemsJson(raw)
    expect(items).toHaveLength(3)
    expect(items[0].title).toContain('Реализация')
    expect(parseBulletListAsPlan('- один')).toBeNull()
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

  it('isReadOutputTruncated — head/tail и offset footer', () => {
    expect(isReadOutputTruncated('... (100 строк обрезано) ...')).toBe(true)
    expect(isReadOutputTruncated('показаны первые 50 и последние 50')).toBe(true)
    expect(isReadOutputTruncated('[Ещё 80 строк. Читай дальше: offset=220]')).toBe(true)
    expect(isReadOutputTruncated('полный файл без обрезки')).toBe(false)
  })
})
