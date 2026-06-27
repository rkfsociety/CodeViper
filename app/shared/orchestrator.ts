import { ORCHESTRATOR_DEFAULT_OLLAMA_MODEL } from './constants'

export type OrchestratorBackend = 'gguf' | 'ollama'

/** Поля настроек, нужные для выбора бэкенда оркестратора. */
export interface OrchestratorSettingsSlice {
  orchestratorBackend?: OrchestratorBackend
  orchestratorModelPath?: string
  orchestratorOllamaModel?: string
  orchestratorEnabled?: boolean
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
