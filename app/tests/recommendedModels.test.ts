import { describe, it, expect } from 'vitest'
import {
  RECOMMENDED_MODELS,
  assertPullableToolModel,
  filterDownloadableRecommendedModels,
  getModelPickerHint,
  groupRecommendedModelsByTier,
  isToolCallingModel
} from '../shared/recommendedModels'

describe('recommendedModels', () => {
  it('содержит модели для разных уровней RAM', () => {
    const tiers = new Set(RECOMMENDED_MODELS.map((m) => m.ramTier))
    expect(tiers.has('8')).toBe(true)
    expect(tiers.has('16')).toBe(true)
    expect(tiers.has('48+')).toBe(true)
    expect(RECOMMENDED_MODELS.length).toBeGreaterThanOrEqual(10)
  })

  it('все модели каталога считаются tool calling', () => {
    for (const model of RECOMMENDED_MODELS) {
      expect(isToolCallingModel(model.name)).toBe(true)
    }
  })

  it('отклоняет модели без tool calling', () => {
    expect(isToolCallingModel('gemma2:9b')).toBe(false)
    expect(isToolCallingModel('deepseek-r1:14b')).toBe(false)
    expect(isToolCallingModel('mistral:7b')).toBe(false)
    expect(() => assertPullableToolModel('gemma2:9b')).toThrow(/tool calling/)
  })

  it('разрешает скачивание только из каталога', () => {
    expect(() => assertPullableToolModel('qwen2.5-coder:7b')).not.toThrow()
    expect(() => assertPullableToolModel('random-model:7b')).toThrow()
  })

  it('скрывает установленные модели из каталога скачивания', () => {
    const available = filterDownloadableRecommendedModels([
      { name: 'qwen2.5-coder:7b' },
      { name: 'llama3.1:8b' }
    ])
    expect(available.some((m) => m.name === 'qwen2.5-coder:7b')).toBe(false)
    expect(available.some((m) => m.name === 'llama3.1:8b')).toBe(false)
    expect(available.some((m) => m.name === 'qwen2.5-coder:14b')).toBe(true)
  })

  it('группирует по tier без пустых секций', () => {
    const groups = groupRecommendedModelsByTier()
    expect(groups.length).toBeGreaterThan(4)
    for (const group of groups) {
      expect(group.models.length).toBeGreaterThan(0)
    }
  })

  it('помечает featured модели для 8 и 16 GB', () => {
    const featured = RECOMMENDED_MODELS.filter((m) => m.featured)
    expect(featured.some((m) => m.name === 'qwen2.5-coder:7b')).toBe(true)
    expect(featured.some((m) => m.name === 'qwen2.5-coder:14b')).toBe(true)
  })

  it('getModelPickerHint: llama3.2 без tools и мелкие модели в Code', () => {
    expect(getModelPickerHint({ name: 'llama3.2:latest' }, false)).toBe('без tool calling')
    expect(getModelPickerHint({ name: 'qwen2.5-coder:7b' }, true)).toBeUndefined()
    expect(
      getModelPickerHint({ name: 'llama3.2:3b', parameterSize: '3.2B', supportsTools: true }, true)
    ).toBe('< 7B · только Chat')
  })
})
