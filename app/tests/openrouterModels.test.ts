import { describe, it, expect } from 'vitest'
import {
  filterLiteRouterModelsByTier,
  filterOpenRouterModelsByTier,
  isLiteRouterFreeModel,
  isOpenRouterFreeModel
} from '../shared/constants'

describe('OpenRouter model tier', () => {
  const models = [
    { name: 'qwen/qwen3-coder:free' },
    { name: 'meta-llama/llama-3.3-70b-instruct:free' },
    { name: 'openai/gpt-4o-mini' }
  ]

  it('isOpenRouterFreeModel распознаёт суффикс :free', () => {
    expect(isOpenRouterFreeModel('qwen/qwen3-coder:free')).toBe(true)
    expect(isOpenRouterFreeModel('openai/gpt-4o-mini')).toBe(false)
  })

  it('filterOpenRouterModelsByTier free оставляет только :free', () => {
    expect(filterOpenRouterModelsByTier(models, 'free').map((m) => m.name)).toEqual([
      'qwen/qwen3-coder:free',
      'meta-llama/llama-3.3-70b-instruct:free'
    ])
  })

  it('filterOpenRouterModelsByTier paid исключает :free', () => {
    expect(filterOpenRouterModelsByTier(models, 'paid').map((m) => m.name)).toEqual([
      'openai/gpt-4o-mini'
    ])
  })
})

describe('LiteRouter model tier', () => {
  const models = [
    { name: 'deepseek:free' },
    { name: 'mistral:free' },
    { name: 'openai/gpt-4o-mini' }
  ]

  it('isLiteRouterFreeModel распознаёт суффикс :free', () => {
    expect(isLiteRouterFreeModel('deepseek:free')).toBe(true)
    expect(isLiteRouterFreeModel('openai/gpt-4o-mini')).toBe(false)
  })

  it('filterLiteRouterModelsByTier free оставляет только :free', () => {
    expect(filterLiteRouterModelsByTier(models, 'free').map((m) => m.name)).toEqual([
      'deepseek:free',
      'mistral:free'
    ])
  })

  it('filterLiteRouterModelsByTier paid исключает :free', () => {
    expect(filterLiteRouterModelsByTier(models, 'paid').map((m) => m.name)).toEqual([
      'openai/gpt-4o-mini'
    ])
  })
})
