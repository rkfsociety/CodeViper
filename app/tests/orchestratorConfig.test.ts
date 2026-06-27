import { describe, it, expect } from 'vitest'
import {
  isOrchestratorConfigured,
  resolveOrchestratorBackend,
  resolveOrchestratorOllamaModel
} from '../shared/orchestrator'
import { ORCHESTRATOR_DEFAULT_OLLAMA_MODEL } from '../shared/constants'

describe('orchestrator config', () => {
  it('по умолчанию Ollama, если GGUF не выбран', () => {
    expect(resolveOrchestratorBackend({})).toBe('ollama')
  })

  it('GGUF, если есть путь и backend не задан', () => {
    expect(resolveOrchestratorBackend({ orchestratorModelPath: '/tmp/m.gguf' })).toBe('gguf')
  })

  it('явный backend имеет приоритет', () => {
    expect(
      resolveOrchestratorBackend({
        orchestratorBackend: 'ollama',
        orchestratorModelPath: '/tmp/m.gguf'
      })
    ).toBe('ollama')
  })

  it('Ollama-модель по умолчанию', () => {
    expect(resolveOrchestratorOllamaModel({})).toBe(ORCHESTRATOR_DEFAULT_OLLAMA_MODEL)
  })

  it('isOrchestratorConfigured для Ollama без кастомной модели', () => {
    expect(isOrchestratorConfigured({ orchestratorBackend: 'ollama' })).toBe(true)
  })

  it('isOrchestratorConfigured для GGUF требует путь', () => {
    expect(isOrchestratorConfigured({ orchestratorBackend: 'gguf' })).toBe(false)
    expect(
      isOrchestratorConfigured({
        orchestratorBackend: 'gguf',
        orchestratorModelPath: '/x.gguf'
      })
    ).toBe(true)
  })
})
