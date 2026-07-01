import { describe, it, expect } from 'vitest'
import { TaskPlanner } from '../electron/main/taskPlanner'
import type { LoopGuard } from '../electron/main/agentLoopGuard'

const loopGuardStub = {} as LoopGuard

describe('TaskPlanner', () => {
  it('isSelfImprove=true для копипасты пункта ROADMAP', () => {
    const msg = `1 · S · Tool find_magic_numbers — уровень 3

Цель: отчёт о «магических» числовых литералах
Файлы: magicNumberAnalysis.ts, agentTools/core.ts
Действие: AST ts/js
Проверка: npm test -- magicNumberAnalysis.test.ts`
    const planner = new TaskPlanner('standard', msg, undefined, loopGuardStub)
    expect(planner.isSelfImprove).toBe(true)
  })

  it('isSelfImprove=false для обычного запроса', () => {
    const planner = new TaskPlanner('standard', 'добавь кнопку в App.tsx', undefined, loopGuardStub)
    expect(planner.isSelfImprove).toBe(false)
  })

  it('detectMode всегда standard', () => {
    expect(TaskPlanner.detectMode('любой текст')).toBe('standard')
  })
})
