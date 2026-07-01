import { ORCHESTRATOR_DEFAULT_OLLAMA_MODEL } from './constants'
import {
  isCloudOrchestratorConfigured,
  type OrchestratorCloudSettingsSlice
} from './orchestratorCloud'

export type OrchestratorBackend = 'gguf' | 'ollama' | 'cloud'

/** Поля настроек, нужные для выбора бэкенда оркестратора. */
export interface OrchestratorSettingsSlice {
  orchestratorBackend?: OrchestratorBackend
  orchestratorModelPath?: string
  orchestratorOllamaModel?: string
  orchestratorCloudModel?: string
  orchestratorEnabled?: boolean
  planBeforeExecute?: boolean
  orchestratorMinMessageLength?: number
}

/** GGUF, cloud или Ollama — по явной настройке и провайдеру агента. */
export function resolveOrchestratorBackend(
  settings: OrchestratorSettingsSlice & { modelProvider?: string; orchestratorCloudModel?: string }
): OrchestratorBackend {
  if (
    settings.orchestratorBackend === 'gguf' ||
    settings.orchestratorBackend === 'ollama' ||
    settings.orchestratorBackend === 'cloud'
  ) {
    return settings.orchestratorBackend
  }
  return settings.orchestratorModelPath?.trim() ? 'gguf' : 'ollama'
}

export function resolveOrchestratorOllamaModel(settings: OrchestratorSettingsSlice): string {
  const model = settings.orchestratorOllamaModel?.trim()
  return model || ORCHESTRATOR_DEFAULT_OLLAMA_MODEL
}

/** Есть ли настроенный бэкенд для analyze(). */
export function isOrchestratorConfigured(settings: OrchestratorCloudSettingsSlice): boolean {
  const backend = resolveOrchestratorBackend(settings)
  if (backend === 'gguf') return !!settings.orchestratorModelPath?.trim()
  if (backend === 'cloud') return isCloudOrchestratorConfigured(settings)
  return !!resolveOrchestratorOllamaModel(settings)
}

/** Запускать analyze() только при включённом оркестраторе (план + isComplex). */
export function shouldRunOrchestratorAnalysis(
  settings: OrchestratorSettingsSlice,
  messageLength: number
): boolean {
  const minLen = settings.orchestratorMinMessageLength ?? 30
  if (messageLength < minLen) return false
  if (!isOrchestratorConfigured(settings)) return false
  return settings.orchestratorEnabled === true
}

export function shouldAwaitPlanConfirmation(settings: { planBeforeExecute?: boolean }): boolean {
  return settings.planBeforeExecute === true
}

/** План перед выполнением основной моделью, если оркестратор выключен. */
export function shouldGeneratePlanWithAgentModel(
  settings: OrchestratorSettingsSlice,
  messageLength: number
): boolean {
  const minLen = settings.orchestratorMinMessageLength ?? 30
  if (messageLength < minLen) return false
  return settings.planBeforeExecute === true && settings.orchestratorEnabled !== true
}
