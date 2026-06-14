import { describe, it, expect } from 'vitest'
import {
  claimsActionCompleted,
  looksLikeAdviceInsteadOfAction,
  needsToolVerification,
  shouldRetryForMissingTools,
  taskLikelyNeedsMutation,
  taskLikelyNeedsTools
} from '../shared/actionVerification'

describe('actionVerification', () => {
  it('определяет задачу с изменениями', () => {
    expect(taskLikelyNeedsMutation('Создай skill для todo')).toBe(true)
    expect(taskLikelyNeedsMutation('Улучшите интерфейс пользователя')).toBe(true)
    expect(taskLikelyNeedsMutation('изучи код')).toBe(false)
  })

  it('определяет задачи, требующие инструментов', () => {
    expect(taskLikelyNeedsTools('изучи код')).toBe(true)
    expect(taskLikelyNeedsTools('привет')).toBe(false)
  })

  it('распознаёт совет вместо действия', () => {
    const advice = `### Инструкция
1. Используйте Figma для макета
2. Проведите тестирование на пользователях`
    expect(looksLikeAdviceInsteadOfAction(advice)).toBe(true)
    expect(looksLikeAdviceInsteadOfAction('Сейчас прочитаю styles.css.')).toBe(false)
  })

  it('не считает планирование завершением', () => {
    expect(claimsActionCompleted('Создаю навык для todo-листа. Шаги: …')).toBe(false)
    expect(claimsActionCompleted('Я создал skill для todo-листа.')).toBe(true)
    expect(claimsActionCompleted('Сейчас посмотрю структуру проекта.')).toBe(false)
  })

  it('требует повтор при советах без инструментов', () => {
    expect(
      shouldRetryForMissingTools(
        'Улучшите интерфейс',
        '1. Используйте Figma\n2. Material-UI',
        new Set(),
        false
      )
    ).toBe(true)
  })

  it('требует проверку без mutating tools', () => {
    expect(
      needsToolVerification(
        'Создай skill для todo',
        'Готово. Skill создан.',
        new Set()
      )
    ).toBe(true)
  })

  it('не требует проверку если инструмент уже вызывался', () => {
    expect(
      needsToolVerification(
        'Создай skill для todo',
        'Skill создан.',
        new Set(['create_skill'])
      )
    ).toBe(false)
  })
})
