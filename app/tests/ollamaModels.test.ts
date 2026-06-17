import { describe, it, expect } from 'vitest'
import { buildModelfile, parseTrainingData } from '../electron/main/ollamaModels'

describe('parseTrainingData', () => {
  it('парсит JSON-массив', () => {
    const raw = JSON.stringify([
      { user: 'Привет', assistant: 'Здравствуй' },
      { prompt: '2+2', response: '4' }
    ])
    const examples = parseTrainingData(raw)
    expect(examples).toHaveLength(2)
    expect(examples[1].assistant).toBe('4')
  })

  it('парсит JSONL', () => {
    const raw = ['{"user":"a","assistant":"b"}', '{"input":"c","output":"d"}'].join('\n')
    expect(parseTrainingData(raw)).toHaveLength(2)
  })

  it('возвращает [] для пустого ввода', () => {
    expect(parseTrainingData('')).toEqual([])
  })
})

describe('buildModelfile', () => {
  it('собирает Modelfile с SYSTEM и MESSAGE', () => {
    const modelfile = buildModelfile({
      baseModel: 'qwen2.5-coder:7b',
      system: 'Ты помощник проекта',
      examples: [{ user: 'Q', assistant: 'A' }],
      temperature: 0.2
    })

    expect(modelfile).toContain('FROM qwen2.5-coder:7b')
    expect(modelfile).toContain('PARAMETER temperature 0.2')
    expect(modelfile).toContain('SYSTEM')
    expect(modelfile).toContain('Ты помощник проекта')
    expect(modelfile).toContain('MESSAGE user Q')
    expect(modelfile).toContain('MESSAGE assistant A')
  })
})
