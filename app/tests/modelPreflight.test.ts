import { describe, it, expect } from 'vitest'
import { ModelPreflightError, formatListModelsHttpError } from '../shared/modelPreflight'
import { OllamaProvider } from '../electron/main/providers/ollamaProvider'
import { responseMentionsToolsWithoutCall } from '../shared/actionVerification'
import { looksLikeSelfImproveTextPlan } from '../shared/selfImprovement'
import { pickBaseSystemPrompt } from '../shared/agentPromptLayers'
import { isExtendedPromptModel } from '../shared/recommendedModels'

describe('modelPreflight', () => {
  it('formatListModelsHttpError — 404', () => {
    expect(formatListModelsHttpError(404, 'Gemini', 'gemini-old-preview')).toMatch(/404/)
    expect(formatListModelsHttpError(404, 'Gemini', 'gemini-old-preview')).toMatch(
      'gemini-old-preview'
    )
  })

  it('ModelPreflightError сохраняет httpStatus', () => {
    const err = new ModelPreflightError('test', 404)
    expect(err.httpStatus).toBe(404)
    expect(err.code).toBe('MODEL_PREFLIGHT')
  })
})

describe('OllamaProvider.preflightModel', () => {
  it('бросает ModelPreflightError если модель не установлена', async () => {
    const provider = new OllamaProvider('http://127.0.0.1:11434')
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      ({
        ok: true,
        json: async () => ({ models: [{ name: 'other:7b' }] })
      }) as Response

    try {
      await expect(provider.preflightModel('missing:7b')).rejects.toThrow(ModelPreflightError)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('responseMentionsToolsWithoutCall', () => {
  it('ловит JSON tool call в тексте', () => {
    const text = 'Сейчас прочитаю файл.\n{"name":"read_file","arguments":{"path":"a.ts"}}'
    expect(responseMentionsToolsWithoutCall(text)).toBe(true)
  })

  it('ловит «Инструмент grep_files:»', () => {
    expect(responseMentionsToolsWithoutCall('Инструмент grep_files:\nquery: foo')).toBe(true)
  })
})

describe('looksLikeSelfImproveTextPlan', () => {
  it('распознаёт ### Действие без tool calls', () => {
    const text = `### Действие

1. **Обновление openaiProvider.ts:**
   - Переиспользовать client.

### Проверка

- npm test`
    expect(looksLikeSelfImproveTextPlan(text)).toBe(true)
  })
})

describe('agentPromptLayers', () => {
  it('7B — короткий промпт без extended', () => {
    const p = pickBaseSystemPrompt('qwen2.5-coder:7b')
    expect(p.length).toBeLessThan(400)
    expect(p).toContain('tool_calls')
  })

  it('14B+ — extended блок', () => {
    expect(isExtendedPromptModel('qwen2.5-coder:14b')).toBe(true)
    const p = pickBaseSystemPrompt('qwen2.5-coder:14b')
    expect(p).toContain('list_directory')
  })
})
