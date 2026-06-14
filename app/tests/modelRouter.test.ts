import { describe, it, expect } from 'vitest'
import { analyzeTask, selectModelForTask } from '../shared/modelRouter'

const INSTALLED = [
  { name: 'qwen2.5-coder:3b', size: 2e9 },
  { name: 'qwen2.5-coder:7b', size: 4.7e9 },
  { name: 'qwen2.5-coder:14b', size: 9e9 },
  { name: 'deepseek-r1:14b', size: 9e9 }
]

describe('modelRouter', () => {
  it('оценивает самоулучшение как сложную задачу', () => {
    const task = analyzeTask('изучи код и начни улучшать себя')
    expect(task.difficulty).toBeGreaterThan(85)
    expect(task.needsCoder).toBe(true)
  })

  it('выбирает лёгкую модель для короткого вопроса', () => {
    const pick = selectModelForTask('привет, что ты умеешь?', INSTALLED)
    expect(pick?.model).toMatch(/3b|7b/)
  })

  it('выбирает крупную coder-модель для сложной правки', () => {
    const pick = selectModelForTask(
      'Рефакторинг agent.ts: добавь поддержку новых инструментов и тесты',
      INSTALLED
    )
    expect(pick?.model).toMatch(/14b|32b/)
  })

  it('выбирает крупную модель для самоулучшения', () => {
    const pick = selectModelForTask('изучи код и начни улучшать себя', INSTALLED)
    expect(pick?.model).toMatch(/14b/)
  })

  it('возвращает единственную модель без сравнения', () => {
    const pick = selectModelForTask('сделай todo', [{ name: 'qwen2.5-coder:7b', size: 4e9 }])
    expect(pick?.model).toBe('qwen2.5-coder:7b')
  })
})
