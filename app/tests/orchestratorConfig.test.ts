import { describe, it, expect } from 'vitest'
import {
  isOrchestratorConfigured,
  resolveOrchestratorBackend,
  resolveOrchestratorOllamaModel,
  shouldAwaitPlanConfirmation,
  shouldGeneratePlanWithAgentModel,
  shouldRunOrchestratorAnalysis
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

  it('shouldRunOrchestratorAnalysis только при orchestratorEnabled', () => {
    expect(
      shouldRunOrchestratorAnalysis(
        { orchestratorBackend: 'ollama', orchestratorEnabled: true },
        50
      )
    ).toBe(true)
    expect(
      shouldRunOrchestratorAnalysis({ orchestratorBackend: 'ollama', planBeforeExecute: true }, 50)
    ).toBe(false)
    expect(shouldRunOrchestratorAnalysis({ orchestratorBackend: 'ollama' }, 50)).toBe(false)
    expect(
      shouldRunOrchestratorAnalysis(
        { orchestratorBackend: 'ollama', orchestratorEnabled: true },
        10
      )
    ).toBe(false)
  })

  it('shouldGeneratePlanWithAgentModel при planBeforeExecute без orchestratorEnabled', () => {
    expect(shouldGeneratePlanWithAgentModel({ planBeforeExecute: true }, 50)).toBe(true)
    expect(
      shouldGeneratePlanWithAgentModel({ planBeforeExecute: true, orchestratorEnabled: true }, 50)
    ).toBe(false)
    expect(shouldGeneratePlanWithAgentModel({ planBeforeExecute: true }, 10)).toBe(false)
  })

  it('shouldAwaitPlanConfirmation только при planBeforeExecute', () => {
    expect(shouldAwaitPlanConfirmation({ planBeforeExecute: true })).toBe(true)
    expect(shouldAwaitPlanConfirmation({})).toBe(false)
  })
})
