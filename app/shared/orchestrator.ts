import { ORCHESTRATOR_DEFAULT_OLLAMA_MODEL } from './constants'

export type OrchestratorBackend = 'gguf' | 'ollama'

/** Поля настроек, нужные для выбора бэкенда оркестратора. */
export interface OrchestratorSettingsSlice {
  orchestratorBackend?: OrchestratorBackend
  orchestratorModelPath?: string
  orchestratorOllamaModel?: string
  orchestratorEnabled?: boolean
  planBeforeExecute?: boolean
  orchestratorMinMessageLength?: number
}

/** GGUF, если явно выбран или уже скачан файл; иначе Ollama. */
export function resolveOrchestratorBackend(
  settings: OrchestratorSettingsSlice
): OrchestratorBackend {
  if (settings.orchestratorBackend === 'gguf' || settings.orchestratorBackend === 'ollama') {
    return settings.orchestratorBackend
  }
  return settings.orchestratorModelPath?.trim() ? 'gguf' : 'ollama'
}

export function resolveOrchestratorOllamaModel(settings: OrchestratorSettingsSlice): string {
  const model = settings.orchestratorOllamaModel?.trim()
  return model || ORCHESTRATOR_DEFAULT_OLLAMA_MODEL
}

/** Есть ли настроенный бэкенд для analyze(). */
export function isOrchestratorConfigured(settings: OrchestratorSettingsSlice): boolean {
  const backend = resolveOrchestratorBackend(settings)
  if (backend === 'gguf') return !!settings.orchestratorModelPath?.trim()
  return !!resolveOrchestratorOllamaModel(settings)
}

/** Запускать analyze() при включённом оркестраторе или planBeforeExecute. */
export function shouldRunOrchestratorAnalysis(
  settings: OrchestratorSettingsSlice,
  messageLength: number
): boolean {
  const minLen = settings.orchestratorMinMessageLength ?? 30
  if (messageLength < minLen) return false
  if (!isOrchestratorConfigured(settings)) return false
  return settings.orchestratorEnabled === true || settings.planBeforeExecute === true
}

export function shouldAwaitPlanConfirmation(settings: { planBeforeExecute?: boolean }): boolean {
  return settings.planBeforeExecute === true
}
