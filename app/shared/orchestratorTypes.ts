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
