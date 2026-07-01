import { describe, it, expect } from 'vitest'
import {
  analyzeTask,
  selectModelForTask,
  selectLightestModelForSummarization,
  resolveSummarizeModel
} from '../shared/modelRouter'

const INSTALLED = [
  { name: 'qwen2.5-coder:3b', size: 2e9 },
  { name: 'qwen2.5-coder:7b', size: 4.7e9 },
  { name: 'qwen2.5-coder:14b', size: 9e9 },
  { name: 'llama3.1:8b', size: 4.7e9 }
]

describe('modelRouter', () => {
  it('оценивает сложную правку как задачу с кодом', () => {
    const task = analyzeTask('рефакторинг agent.ts: добавь поддержку новых инструментов и тесты')
    expect(task.difficulty).toBeGreaterThan(45)
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

  it('игнорирует модели без tool calling', () => {
    const pick = selectModelForTask('рефакторинг agent.ts', [
      { name: 'gemma2:9b', size: 5e9 },
      { name: 'qwen2.5-coder:7b', size: 4.7e9 }
    ])
    expect(pick?.model).toBe('qwen2.5-coder:7b')
  })

  it('selectLightestModelForSummarization выбирает самую лёгкую', () => {
    expect(selectLightestModelForSummarization(INSTALLED, 'qwen2.5-coder:14b')).toBe(
      'qwen2.5-coder:3b'
    )
    expect(resolveSummarizeModel(INSTALLED, 'qwen2.5-coder:14b', '')).toBe('qwen2.5-coder:3b')
    expect(resolveSummarizeModel(INSTALLED, 'qwen2.5-coder:14b', 'llama3.1:8b')).toBe('llama3.1:8b')
  })

  it('selectLightestModelForSummarization пропускает embed-модели', () => {
    const pick = selectLightestModelForSummarization(
      [
        { name: 'nomic-embed-text', size: 0.3e9 },
        { name: 'qwen2.5-coder:7b', size: 4.7e9 }
      ],
      'qwen2.5-coder:7b'
    )
    expect(pick).toBe('qwen2.5-coder:7b')
  })
})
