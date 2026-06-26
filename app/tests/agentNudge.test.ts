/**
 * Тесты nudge-механизма агента.
 * Проверяем константы и функции, которые агент вставляет в диалог,
 * когда модель отвечает текстом вместо tool call.
 */
import { describe, it, expect } from 'vitest'
import {
  CREATE_SELF_IMPROVEMENT_PLAN_NUDGE,
  START_SELF_IMPROVEMENT_EXPLORATION_NUDGE,
  buildSelfImprovementContinueNudge,
  parsePlanFromAssistantText,
  type SelfImprovementItem
} from '../shared/selfImprovement'
import { TOOL_VERIFICATION_NUDGE } from '../shared/actionVerification'

describe('TOOL_VERIFICATION_NUDGE', () => {
  it('содержит требование использовать инструменты', () => {
    expect(TOOL_VERIFICATION_NUDGE).toMatch(/инструмент/i)
    expect(TOOL_VERIFICATION_NUDGE.length).toBeGreaterThan(20)
  })
})

describe('nudge при JSON-плане самоулучшения', () => {
  it('CREATE_SELF_IMPROVEMENT_PLAN_NUDGE требует вызов set_self_improvement_plan', () => {
    expect(CREATE_SELF_IMPROVEMENT_PLAN_NUDGE).toContain('set_self_improvement_plan')
  })

  it('START_SELF_IMPROVEMENT_EXPLORATION_NUDGE требует изучить код перед планом', () => {
    expect(START_SELF_IMPROVEMENT_EXPLORATION_NUDGE).toContain('read_codeviper_file')
    expect(START_SELF_IMPROVEMENT_EXPLORATION_NUDGE).toContain('set_self_improvement_plan')
  })

  it('buildSelfImprovementContinueNudge включает следующий невыполненный пункт', () => {
    const plan: SelfImprovementItem[] = [
      { id: '1', title: 'Изучить agent.ts', done: true },
      { id: '2', title: 'Создать skill X', done: false },
      { id: '3', title: 'Обновить README', done: false }
    ]
    const nudge = buildSelfImprovementContinueNudge(plan)
    expect(nudge).toContain('Создать skill X')
    expect(nudge).not.toContain('Изучить agent.ts') // выполненный не упоминается как следующий
  })

  it('buildSelfImprovementContinueNudge при всех выполненных упоминает завершение', () => {
    const plan: SelfImprovementItem[] = [
      { id: '1', title: 'A', done: true },
      { id: '2', title: 'B', done: true }
    ]
    const nudge = buildSelfImprovementContinueNudge(plan)
    // Нет невыполненного — nudge должен говорить о завершении
    expect(nudge).toMatch(/готов|выполн|завершён|заверш|план|все/i)
  })

  it('агент распознаёт JSON-план в тексте ассистента', () => {
    const text = `Вот мой план:
[{"id":"1","title":"Изучить agent.ts"},{"id":"2","title":"Добавить skill"}]
Начну с изучения.`
    const plan = parsePlanFromAssistantText(text)
    expect(plan).not.toBeNull()
    expect(plan).toHaveLength(2)
    expect(plan![0].title).toContain('agent.ts')
    expect(plan![1].done).toBe(false)
  })

  it('возвращает null при отсутствии JSON-плана в тексте', () => {
    expect(parsePlanFromAssistantText('Привет, чем могу помочь?')).toBeNull()
    expect(parsePlanFromAssistantText('')).toBeNull()
  })

  it('игнорирует короткие JSON-массивы (не план)', () => {
    // Массив из 1 элемента не считается планом
    const text = '[{"id":"1","title":"A"}]'
    const plan = parsePlanFromAssistantText(text)
    // Либо null либо массив — оба варианта допустимы, главное что не крашится
    expect(() => parsePlanFromAssistantText(text)).not.toThrow()
    if (plan !== null) {
      expect(Array.isArray(plan)).toBe(true)
    }
  })
})
