import type { ProviderConfig } from './modelProvider'
import {
  CUSTOM_API_BASE_URL,
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_MODEL_DEFAULT,
  filterLiteRouterModelsByTier,
  filterOpenRouterModelsByTier,
  GEMINI_API_BASE_URL,
  GEMINI_FREE_MODELS,
  GEMINI_MODEL_DEFAULT,
  isLiteRouterFreeModel,
  isOpenRouterFreeModel,
  LITEROUTER_API_BASE_URL,
  LITEROUTER_MODEL_DEFAULT,
  OPENROUTER_API_BASE_URL
} from './constants'
import type { OrchestratorSettingsSlice } from './orchestrator'

export interface OrchestratorCloudModel {
  name: string
  contextLength?: number
}

/** Настройки, нужные для облачного оркестратора (тот же провайдер, что у агента). */
export interface OrchestratorCloudSettingsSlice extends OrchestratorSettingsSlice {
  modelProvider?: string
  orchestratorCloudModel?: string
  model?: string
  literouterTier?: 'free' | 'paid'
  openrouterTier?: 'free' | 'paid'
  geminiTier?: 'free' | 'paid'
  literouterBaseUrl?: string
  ollamaUrl?: string
  providerApiKey?: string
  deepseekApiKey?: string
  literouterApiKey?: string
  openrouterApiKey?: string
  geminiApiKey?: string
  openaiApiKey?: string
  claudeApiKey?: string
  groqApiKey?: string
  togetherApiKey?: string
  customApiKey?: string
  customBaseUrl?: string
  geminiRpm?: number
}

const CLOUD_PROVIDER_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek',
  literouter: 'LiteRouter',
  openai: 'OpenAI',
  openrouter: 'OpenRouter',
  gemini: 'Gemini',
  anthropic: 'Anthropic',
  groq: 'Groq',
  together: 'Together',
  custom: 'Custom API'
}

export function isCloudModelProvider(provider: string | undefined): boolean {
  return !!provider && provider !== 'ollama'
}

export function orchestratorCloudProviderLabel(provider: string): string {
  return CLOUD_PROVIDER_LABELS[provider] ?? provider
}

/** Модели оркестратора в рамках tier текущего облачного провайдера. */
export function filterOrchestratorCloudModels<T extends OrchestratorCloudModel>(
  settings: OrchestratorCloudSettingsSlice,
  catalog: T[]
): T[] {
  const provider = settings.modelProvider ?? 'ollama'
  if (provider === 'literouter') {
    return filterLiteRouterModelsByTier(catalog, settings.literouterTier ?? 'free')
  }
  if (provider === 'openrouter') {
    return filterOpenRouterModelsByTier(catalog, settings.openrouterTier ?? 'free')
  }
  if (provider === 'gemini' && (settings.geminiTier ?? 'free') === 'free') {
    const freeIds = new Set<string>(GEMINI_FREE_MODELS.map((m) => m.id))
    const fromCatalog = catalog.filter((m) => freeIds.has(m.name))
    if (fromCatalog.length > 0) return fromCatalog
    return GEMINI_FREE_MODELS.map((m) => ({ name: m.id })) as T[]
  }
  return catalog
}

export function isOrchestratorCloudModelAllowed(
  settings: OrchestratorCloudSettingsSlice,
  modelId: string,
  catalog: OrchestratorCloudModel[] = []
): boolean {
  const trimmed = modelId.trim()
  if (!trimmed) return false
  const provider = settings.modelProvider ?? 'ollama'
  if (provider === 'literouter') {
    const tier = settings.literouterTier ?? 'free'
    const isFree = isLiteRouterFreeModel(trimmed)
    return tier === 'free' ? isFree : !isFree
  }
  if (provider === 'openrouter') {
    const tier = settings.openrouterTier ?? 'free'
    const isFree = isOpenRouterFreeModel(trimmed)
    return tier === 'free' ? isFree : !isFree
  }
  if (provider === 'gemini' && (settings.geminiTier ?? 'free') === 'free') {
    return GEMINI_FREE_MODELS.some((m) => m.id === trimmed)
  }
  const filtered = filterOrchestratorCloudModels(settings, catalog)
  if (filtered.length > 0) {
    return filtered.some((m) => m.name === trimmed)
  }
  return true
}

export function defaultOrchestratorCloudModel(settings: OrchestratorCloudSettingsSlice): string {
  const provider = settings.modelProvider ?? 'ollama'
  if (provider === 'literouter') {
    return (settings.literouterTier ?? 'free') === 'free' ? LITEROUTER_MODEL_DEFAULT : ''
  }
  if (provider === 'gemini') {
    return (settings.geminiTier ?? 'free') === 'free'
      ? (GEMINI_FREE_MODELS[0]?.id ?? GEMINI_MODEL_DEFAULT)
      : GEMINI_MODEL_DEFAULT
  }
  if (provider === 'deepseek') return DEEPSEEK_MODEL_DEFAULT
  return ''
}

export function resolveOrchestratorCloudModel(
  settings: OrchestratorCloudSettingsSlice,
  catalog: OrchestratorCloudModel[] = []
): string {
  const current = settings.orchestratorCloudModel?.trim()
  if (current && isOrchestratorCloudModelAllowed(settings, current, catalog)) {
    return current
  }
  const filtered = filterOrchestratorCloudModels(settings, catalog)
  if (filtered[0]?.name) return filtered[0].name
  const fallback = defaultOrchestratorCloudModel(settings)
  if (fallback && isOrchestratorCloudModelAllowed(settings, fallback, catalog)) {
    return fallback
  }
  return filtered[0]?.name ?? fallback
}

function resolveProviderApiKey(
  settings: OrchestratorCloudSettingsSlice,
  type: string
): string | undefined {
  switch (type) {
    case 'deepseek':
      return settings.deepseekApiKey ?? settings.providerApiKey
    case 'literouter':
      return settings.literouterApiKey ?? settings.providerApiKey
    case 'gemini':
      return settings.geminiApiKey ?? settings.providerApiKey
    case 'openrouter':
      return settings.openrouterApiKey ?? settings.providerApiKey
    case 'openai':
      return settings.openaiApiKey ?? settings.providerApiKey
    case 'anthropic':
      return settings.claudeApiKey ?? settings.providerApiKey
    case 'groq':
      return settings.groqApiKey ?? settings.providerApiKey
    case 'together':
      return settings.togetherApiKey ?? settings.providerApiKey
    case 'custom':
      return settings.customApiKey ?? settings.providerApiKey
    default:
      return undefined
  }
}

export function hasCloudProviderApiKey(settings: OrchestratorCloudSettingsSlice): boolean {
  const type = settings.modelProvider ?? 'ollama'
  if (!isCloudModelProvider(type)) return false
  return !!resolveProviderApiKey(settings, type)?.trim()
}

export function buildOrchestratorCloudProviderConfig(
  settings: OrchestratorCloudSettingsSlice,
  catalog: OrchestratorCloudModel[] = []
): ProviderConfig {
  const type = settings.modelProvider ?? 'ollama'
  if (!isCloudModelProvider(type)) {
    throw new Error('Облачный оркестратор доступен только при облачном провайдере агента')
  }
  const model = resolveOrchestratorCloudModel(settings, catalog)
  if (!model) {
    throw new Error('Не выбрана облачная модель оркестратора')
  }
  const apiKey = resolveProviderApiKey(settings, type)
  if (!apiKey?.trim()) {
    throw new Error('Не задан API-ключ для облачного оркестратора')
  }

  const baseUrl =
    type === 'custom'
      ? (settings.customBaseUrl || CUSTOM_API_BASE_URL).replace(/\/$/, '')
      : type === 'deepseek'
        ? DEEPSEEK_API_BASE_URL
        : type === 'literouter'
          ? (settings.literouterBaseUrl || LITEROUTER_API_BASE_URL).replace(/\/$/, '')
          : type === 'gemini'
            ? GEMINI_API_BASE_URL
            : type === 'openrouter'
              ? OPENROUTER_API_BASE_URL
              : settings.ollamaUrl

  return {
    type,
    baseUrl,
    apiKey,
    model,
    ...(type === 'gemini' && settings.geminiRpm != null ? { rpm: settings.geminiRpm } : {})
  }
}

export function isCloudOrchestratorConfigured(
  settings: OrchestratorCloudSettingsSlice,
  catalog: OrchestratorCloudModel[] = []
): boolean {
  if (!isCloudModelProvider(settings.modelProvider)) return false
  if (!hasCloudProviderApiKey(settings)) return false
  return !!resolveOrchestratorCloudModel(settings, catalog)
}
