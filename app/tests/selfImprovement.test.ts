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
  resolvePlanToolArg,
  parseChecklistAsPlan,
  parseBulletListAsPlan,
  parseLoosePlanLines,
  stripPlanItemsWrappers,
  extractRoadmapTitleFromTask,
  buildRoadmapAlreadyDoneHint,
  syncPlanFromChecklist,
  isPlanComplete,
  formatPlanSummary,
  buildSelfImprovementContinueNudge,
  isReadOutputTruncated,
  mapSelfImproveProjectTool,
  validateSelfImproveMutatingContent,
  isNewUiComponentPath,
  hasReadCodeViperUiReference
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

  it('редиректит project tools на codeviper при пути app/', () => {
    expect(
      mapSelfImproveProjectTool('read_file', {
        path: 'app/src/components/Foo.tsx'
      }).toolName
    ).toBe('read_codeviper_file')
    expect(mapSelfImproveProjectTool('read_file', { path: 'src/App.tsx' }).toolName).toBe(
      'read_file'
    )
    expect(mapSelfImproveProjectTool('edit_file', { path: 'app/src/App.tsx' }).toolName).toBe(
      'edit_codeviper_file'
    )
  })

  it('блокирует галлюцинации в create/edit самоулучшения', () => {
    expect(
      validateSelfImproveMutatingContent('app/src/components/X.tsx', "import x from '@some/ui'")
    ).toMatch(/@some/)
    expect(
      validateSelfImproveMutatingContent(
        'app/src/App.tsx',
        "localStorage.setItem('firstRunCompleted', 'true')"
      )
    ).toMatch(/AgentSettings/)
    expect(
      validateSelfImproveMutatingContent('app/src/App.tsx', 'const x = React.useState(false)')
    ).toMatch(/useState/)
    expect(validateSelfImproveMutatingContent('app/src/App.tsx', 'const ok = 1')).toBeNull()
  })

  it('требует эталон UI перед новым компонентом', () => {
    expect(isNewUiComponentPath('app/src/components/OnboardingWizard.tsx')).toBe(true)
    expect(isNewUiComponentPath('electron/main/agent.ts')).toBe(false)
    expect(
      hasReadCodeViperUiReference(['read_codeviper_file:app/src/components/ConfirmDialog.tsx'])
    ).toBe(true)
    expect(hasReadCodeViperUiReference(['read_codeviper_file:tests/foo.test.ts'])).toBe(false)
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

  it('принимает action/check вместо title (ROADMAP, fix #23)', () => {
    const items = parsePlanItemsJson([
      {
        id: 1,
        action: 'Добавить обработчик keydown в App.tsx',
        check: 'npm run typecheck'
      },
      { id: 2, action: 'Обновить ROADMAP.md' }
    ])
    expect(items).toHaveLength(2)
    expect(items[0].title).toContain('keydown')
    expect(items[0].title).toContain('npm run typecheck')
    expect(items[1].title).toBe('Обновить ROADMAP.md')
    expect(items[0].id).toBe('1')
  })

  it('принимает items как массив объектов', () => {
    const items = parsePlanItemsJson([{ id: '1', title: 'Шаг A' }])
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Шаг A')
  })

  it('принимает plan как массив строк (Gemini, trace 1782640816802)', () => {
    const plan = [
      'Изучить App.tsx и App.module.css для реализации сплиттера',
      'Реализовать компонент сплиттера и логику сохранения ширины в localStorage',
      'Проверить типы и работоспособность через npm run typecheck и npm test'
    ]
    const items = parsePlanItemsJson(plan)
    expect(items).toHaveLength(3)
    expect(items[0].title).toContain('App.tsx')
    expect(items[2].id).toBe('3')
  })

  it('resolvePlanToolArg читает plan если items отсутствует', () => {
    expect(resolvePlanToolArg({ plan: ['шаг 1', 'шаг 2'] })).toEqual(['шаг 1', 'шаг 2'])
    expect(resolvePlanToolArg({ items: '[{"id":"1","title":"A"}]' })).toBe(
      '[{"id":"1","title":"A"}]'
    )
    expect(resolvePlanToolArg({ steps: ['x'] })).toEqual(['x'])
    expect(resolvePlanToolArg({})).toBeUndefined()
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

  it('stripPlanItemsWrappers снимает markdown и {items:[]}', () => {
    const raw = '```json\n[{"id":"1","title":"A"}]\n```'
    expect(stripPlanItemsWrappers(raw)).toBe('[{"id":"1","title":"A"}]')
    expect(stripPlanItemsWrappers('{"items":[{"id":"1","title":"B"}]}')).toBe(
      '[{"id":"1","title":"B"}]'
    )
  })

  it('parseLoosePlanLines — нумерованный список', () => {
    const plan = parseLoosePlanLines('1. Read App.tsx\n2. npm run typecheck\n3. ROADMAP')
    expect(plan).toHaveLength(3)
    expect(plan?.[0].title).toBe('Read App.tsx')
  })

  it('extractRoadmapTitleFromTask из тела пункта', () => {
    const body = `1 · M · Расширение горячих клавиш — уровень 2

Цель: Escape — стоп`
    expect(extractRoadmapTitleFromTask(body)).toBe('Расширение горячих клавиш')
  })

  it('buildRoadmapAlreadyDoneHint предупреждает о повторе', () => {
    const hint = buildRoadmapAlreadyDoneHint('- Горячие клавиши: Esc')
    expect(hint).toContain('уже выполнен')
    expect(hint).toContain('Горячие клавиши')
  })
})
