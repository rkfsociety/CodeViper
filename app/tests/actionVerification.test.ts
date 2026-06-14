import { describe, it, expect } from 'vitest'
import {
  claimsActionCompleted,
  needsToolVerification,
  taskLikelyNeedsMutation
} from '../shared/actionVerification'

describe('actionVerification', () => {
  it('определяет задачу с изменениями', () => {
    expect(taskLikelyNeedsMutation('Создай skill для todo')).toBe(true)
    expect(taskLikelyNeedsMutation('изучи код')).toBe(false)
  })

  it('не считает планирование завершением', () => {
    expect(claimsActionCompleted('Создаю навык для todo-листа. Шаги: …')).toBe(false)
    expect(claimsActionCompleted('Я создал skill для todo-листа.')).toBe(true)
    expect(claimsActionCompleted('Сейчас посмотрю структуру проекта.')).toBe(false)
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
