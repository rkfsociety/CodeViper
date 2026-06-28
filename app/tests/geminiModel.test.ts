import { describe, expect, it } from 'vitest'
import { GEMINI_FREE_MODELS, resolveGeminiModelId } from '../shared/constants'

describe('resolveGeminiModelId', () => {
  it('заменяет снятый preview Flash Lite на stable id', () => {
    expect(resolveGeminiModelId('gemini-2.5-flash-lite-preview-06-17')).toBe(
      'gemini-2.5-flash-lite'
    )
  })

  it('заменяет снятые Gemini 2.0 на актуальные stable id', () => {
    expect(resolveGeminiModelId('gemini-2.0-flash')).toBe('gemini-2.5-flash')
    expect(resolveGeminiModelId('gemini-2.0-flash-lite')).toBe('gemini-2.5-flash-lite')
  })

  it('не меняет актуальные id', () => {
    expect(resolveGeminiModelId('gemini-2.5-flash')).toBe('gemini-2.5-flash')
    expect(resolveGeminiModelId('gemini-3.1-flash-lite')).toBe('gemini-3.1-flash-lite')
  })
})

describe('GEMINI_FREE_MODELS', () => {
  it('не содержит снятых preview/2.0 id', () => {
    const ids = GEMINI_FREE_MODELS.map((m) => m.id)
    expect(ids).toContain('gemini-2.5-flash-lite')
    expect(ids).not.toContain('gemini-2.5-flash-lite-preview-06-17')
    expect(ids).not.toContain('gemini-2.0-flash')
    expect(ids).not.toContain('gemini-2.0-flash-lite')
  })
})
