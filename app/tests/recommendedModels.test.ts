import { describe, it, expect } from 'vitest'
import {
  RECOMMENDED_MODELS,
  groupRecommendedModelsByTier
} from '../shared/recommendedModels'

describe('recommendedModels', () => {
  it('содержит модели для разных уровней RAM', () => {
    const tiers = new Set(RECOMMENDED_MODELS.map((m) => m.ramTier))
    expect(tiers.has('6-8')).toBe(true)
    expect(tiers.has('8')).toBe(true)
    expect(tiers.has('16')).toBe(true)
    expect(tiers.has('48+')).toBe(true)
    expect(RECOMMENDED_MODELS.length).toBeGreaterThanOrEqual(20)
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
})
