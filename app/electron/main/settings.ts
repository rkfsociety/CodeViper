import { app, safeStorage } from 'electron'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { z } from 'zod'
import type { AgentSettings, GitSyncStrategy } from '../../src/types'
import { GIT_SYNC_STRATEGIES } from '../../src/types'
import { normalizePermissionMode } from '../../shared/permissions'
import { DEFAULT_MODEL_PROVIDER } from '../../shared/constants'
import { writeJsonAtomic } from './fsUtil'

const PermissionModeSchema = z.enum(['ask', 'acceptEdits', 'bypass'])
const GitSyncStrategySchema = z.enum(['stash', 'rebase', 'ff-only'])
const ModelProviderSchema = z.enum([
  'ollama',
  'deepseek',
  'openai',
  'openrouter',
  'gemini',
  'anthropic',
  'groq',
  'together'
])

export const PersistedSettingsSchema = z.object({
  version: z.literal(1),
  ollamaUrl: z.string(),
  model: z.string(),
  selfLearning: z.boolean(),
  autoModel: z.boolean(),
  permissionMode: PermissionModeSchema,
  clarifyMode: z.boolean(),
  deepReasoning: z.boolean(),
  excludeThinkingFromHistory: z.boolean(),
  autoPushSelfEdits: z.boolean(),
  selfImproveBranch: z.string().optional(),
  syncCollectiveMemory: z.boolean().optional(),
  summarizeModel: z.string(),
  modelProvider: ModelProviderSchema,
  providerApiKey: z.string(),
  deepseekApiKey: z.string(),
  openaiApiKey: z.string(),
  openrouterApiKey: z.string(),
  geminiApiKey: z.string(),
  geminiRpm: z.number().int().min(1).max(2000).default(5),
  geminiTier: z.enum(['free', 'paid']).default('free'),
  openrouterTier: z.enum(['free', 'paid']).default('free'),
  claudeApiKey: z.string(),
  groqApiKey: z.string(),
  togetherApiKey: z.string(),
  gitSyncOnStartup: z.boolean(),
  gitSyncStrategy: GitSyncStrategySchema,
  liveRuntimeFromGit: z.boolean().optional(),
  modelContextLength: z.number().int().positive().optional(),
  qdrantUrl: z.string().optional(),
  qdrantApiKey: z.string().optional(),
  milvusUrl: z.string().optional(),
  milvusApiKey: z.string().optional(),
  ragProvider: z.enum(['local', 'qdrant', 'milvus']).optional(),
  powerSaveMode: z.boolean().optional(),
  disableSystemStats: z.boolean().optional(),
  prManualRefresh: z.boolean().optional(),
  contextSummarizeThreshold: z.number().int().min(50).max(85).optional(),
  maxCostPerRunUsd: z.number().min(0).optional(),
  aggressiveCompression: z.boolean().optional(),
  commandBlocklist: z.array(z.string()).optional(),
  commandAllowlist: z.array(z.string()).optional(),
  autoVerifyAfterEdit: z.boolean().optional(),
  debugAgent: z.boolean().optional(),
  webhookUrl: z.string().optional(),
  autoIndexOnOpen: z.boolean().optional(),
  customSystemPrompt: z.string().optional(),
  gitlabToken: z.string().optional(),
  githubToken: z.string().optional(),
  gitlabUrl: z.string().optional(),
  jiraUrl: z.string().optional(),
  jiraToken: z.string().optional(),
  linearApiKey: z.string().optional(),
  disabledTools: z.array(z.string()).optional(),
  sourceRootOverride: z.string().optional(),
  gitRepoRoot: z.string().optional(),
  mcpServers: z
    .array(
      z.object({
        url: z.string(),
        tools: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
            parameters: z.record(z.string(), z.unknown())
          })
        ),
        enabledTools: z.array(z.string()).optional()
      })
    )
    .optional(),
  promptTemplates: z
    .array(
      z.object({
        id: z.string(),
        trigger: z.string(),
        description: z.string(),
        text: z.string()
      })
    )
    .optional(),
  enabledPlugins: z.array(z.string()).optional(),
  orchestratorModelPath: z.string().optional(),
  orchestratorEnabled: z.boolean().optional(),
  orchestratorMinMessageLength: z.number().optional(),
  explorerEnabled: z.boolean().optional(),
  updateChannel: z.enum(['stable', 'beta']).optional(),
  scriptSandboxEnabled: z.boolean().optional(),
  autoCollectivePr: z.boolean().optional(),
  shareCompute: z.boolean().optional(),
  p2pConsentGiven: z.boolean().optional(),
  p2pServerUrl: z.string().optional(),
  p2pAuthToken: z.string().optional(),
  p2pNodePrivateKey: z.string().optional(),
  p2pNodePublicKey: z.string().optional()
})

export type PersistedSettings = z.infer<typeof PersistedSettingsSchema>

function storePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/** По умолчанию true для packaged .exe, false в dev. */
export function defaultLiveRuntimeFromGit(): boolean {
  return app.isPackaged
}

function resolveLiveRuntimeFromGit(value: boolean | undefined): boolean {
  return value ?? defaultLiveRuntimeFromGit()
}

const DEFAULT_SETTINGS: PersistedSettings = {
  version: 1,
  ollamaUrl: 'http://127.0.0.1:11434',
  model: '',
  selfLearning: true,
  autoModel: true,
  permissionMode: 'acceptEdits',
  clarifyMode: false,
  deepReasoning: false,
  excludeThinkingFromHistory: true,
  autoPushSelfEdits: true,
  summarizeModel: '',
  modelProvider: DEFAULT_MODEL_PROVIDER,
  providerApiKey: '',
  deepseekApiKey: '',
  openaiApiKey: '',
  openrouterApiKey: '',
  geminiApiKey: '',
  geminiRpm: 5,
  geminiTier: 'free' as const,
  openrouterTier: 'free' as const,
  claudeApiKey: '',
  groqApiKey: '',
  togetherApiKey: '',
  gitSyncOnStartup: true,
  gitSyncStrategy: 'stash',
  qdrantUrl: '',
  qdrantApiKey: '',
  milvusUrl: '',
  milvusApiKey: '',
  ragProvider: 'local' as const,
  enabledPlugins: []
}

type LegacySettings = Partial<AgentSettings> & { cloudApiKey?: string }

/** Миграция deprecated cloudApiKey → per-provider keys (не сохраняется). */
function migrateCloudApiKey(settings: LegacySettings): void {
  const cloudKey = settings.cloudApiKey?.trim()
  if (!cloudKey) return
  const cp = settings.cloudProvider ?? 'openai'
  if (cp === 'deepseek' && !settings.deepseekApiKey?.trim()) {
    settings.deepseekApiKey = cloudKey
  } else if (cp === 'openai' && !settings.openaiApiKey?.trim()) {
    settings.openaiApiKey = cloudKey
  } else if (cp === 'openrouter' && !settings.openrouterApiKey?.trim()) {
    settings.openrouterApiKey = cloudKey
  } else if (cp === 'gemini' && !settings.geminiApiKey?.trim()) {
    settings.geminiApiKey = cloudKey
  }
}

function normalize(settings: LegacySettings): PersistedSettings {
  migrateCloudApiKey(settings)

  const provider = (settings.modelProvider || DEFAULT_SETTINGS.modelProvider) as
    | 'ollama'
    | 'deepseek'
    | 'openai'
    | 'openrouter'
    | 'gemini'
    | 'anthropic'

  // Миграция: если есть старый providerApiKey, переносим в нужное поле
  const legacyKey = settings.providerApiKey?.trim() ?? ''
  const deepseekApiKey =
    settings.deepseekApiKey?.trim() ?? (provider === 'deepseek' ? legacyKey : '')
  const openaiApiKey = settings.openaiApiKey?.trim() ?? (provider === 'openai' ? legacyKey : '')
  const openrouterApiKey =
    settings.openrouterApiKey?.trim() ?? (provider === 'openrouter' ? legacyKey : '')
  const geminiApiKey = settings.geminiApiKey?.trim() ?? (provider === 'gemini' ? legacyKey : '')
  const claudeApiKey = settings.claudeApiKey?.trim() ?? (provider === 'anthropic' ? legacyKey : '')

  return {
    version: 1,
    ollamaUrl: settings.ollamaUrl?.trim() || DEFAULT_SETTINGS.ollamaUrl,
    model: settings.model?.trim() ?? '',
    selfLearning: settings.selfLearning !== false,
    autoModel: settings.autoModel !== false,
    // Миграция со старого булева confirmActions: true → 'ask'.
    permissionMode: normalizePermissionMode(
      settings.permissionMode ??
        ((settings as { confirmActions?: boolean }).confirmActions === true ? 'ask' : 'bypass')
    ),
    clarifyMode: settings.clarifyMode === true,
    deepReasoning: settings.deepReasoning === true,
    excludeThinkingFromHistory: settings.excludeThinkingFromHistory !== false,
    autoPushSelfEdits: settings.autoPushSelfEdits !== false,
    summarizeModel: settings.summarizeModel?.trim() ?? '',
    modelProvider: provider,
    providerApiKey: '',
    deepseekApiKey,
    openaiApiKey,
    openrouterApiKey,
    geminiApiKey,
    geminiRpm: settings.geminiRpm ?? 5,
    geminiTier: settings.geminiTier ?? 'free',
    openrouterTier: settings.openrouterTier ?? 'free',
    claudeApiKey,
    groqApiKey: settings.groqApiKey?.trim() ?? '',
    togetherApiKey: settings.togetherApiKey?.trim() ?? '',
    gitSyncOnStartup: settings.gitSyncOnStartup !== false,
    gitSyncStrategy: GIT_SYNC_STRATEGIES.includes(settings.gitSyncStrategy as GitSyncStrategy)
      ? (settings.gitSyncStrategy as GitSyncStrategy)
      : DEFAULT_SETTINGS.gitSyncStrategy,
    liveRuntimeFromGit: resolveLiveRuntimeFromGit(settings.liveRuntimeFromGit),
    ...(settings.modelContextLength ? { modelContextLength: settings.modelContextLength } : {}),
    qdrantUrl: settings.qdrantUrl?.trim() ?? '',
    qdrantApiKey: settings.qdrantApiKey?.trim() ?? '',
    milvusUrl: settings.milvusUrl?.trim() ?? '',
    milvusApiKey: settings.milvusApiKey?.trim() ?? '',
    ...(settings.ragProvider ? { ragProvider: settings.ragProvider } : {}),
    ...(settings.powerSaveMode ? { powerSaveMode: true } : {}),
    ...(settings.disableSystemStats ? { disableSystemStats: true } : {}),
    ...(settings.prManualRefresh ? { prManualRefresh: true } : {}),
    ...(settings.contextSummarizeThreshold != null
      ? { contextSummarizeThreshold: settings.contextSummarizeThreshold }
      : {}),
    ...(settings.maxCostPerRunUsd != null && settings.maxCostPerRunUsd > 0
      ? { maxCostPerRunUsd: settings.maxCostPerRunUsd }
      : {}),
    ...(settings.aggressiveCompression ? { aggressiveCompression: true } : {}),
    ...(settings.commandBlocklist?.length ? { commandBlocklist: settings.commandBlocklist } : {}),
    ...(settings.commandAllowlist?.length ? { commandAllowlist: settings.commandAllowlist } : {}),
    ...(settings.autoVerifyAfterEdit ? { autoVerifyAfterEdit: true } : {}),
    ...(settings.debugAgent ? { debugAgent: true } : {}),
    ...(settings.webhookUrl?.trim() ? { webhookUrl: settings.webhookUrl.trim() } : {}),
    ...(settings.autoIndexOnOpen ? { autoIndexOnOpen: true } : {}),
    ...(settings.customSystemPrompt?.trim()
      ? { customSystemPrompt: settings.customSystemPrompt.trim() }
      : {}),
    ...(settings.gitlabToken?.trim() ? { gitlabToken: settings.gitlabToken.trim() } : {}),
    ...(settings.githubToken?.trim() ? { githubToken: settings.githubToken.trim() } : {}),
    ...(settings.gitlabUrl?.trim() ? { gitlabUrl: settings.gitlabUrl.trim() } : {}),
    ...(settings.disabledTools?.length ? { disabledTools: settings.disabledTools } : {}),
    ...(settings.selfImproveBranch?.trim()
      ? { selfImproveBranch: settings.selfImproveBranch.trim() }
      : {}),
    ...(settings.syncCollectiveMemory === false ? { syncCollectiveMemory: false } : {}),
    ...(settings.sourceRootOverride?.trim()
      ? { sourceRootOverride: settings.sourceRootOverride.trim() }
      : {}),
    ...(settings.gitRepoRoot?.trim() ? { gitRepoRoot: settings.gitRepoRoot.trim() } : {}),
    ...(settings.mcpServers?.length ? { mcpServers: settings.mcpServers } : {}),
    ...(settings.orchestratorModelPath?.trim()
      ? { orchestratorModelPath: settings.orchestratorModelPath.trim() }
      : {}),
    ...(settings.orchestratorEnabled === true ? { orchestratorEnabled: true } : {}),
    ...(settings.orchestratorMinMessageLength !== undefined
      ? { orchestratorMinMessageLength: settings.orchestratorMinMessageLength }
      : {}),
    ...(settings.explorerEnabled === true ? { explorerEnabled: true } : {}),
    ...(settings.updateChannel ? { updateChannel: settings.updateChannel } : {}),
    ...(settings.scriptSandboxEnabled === true ? { scriptSandboxEnabled: true } : {}),
    ...(settings.shareCompute === true ? { shareCompute: true } : {}),
    ...(settings.p2pConsentGiven === true ? { p2pConsentGiven: true } : {}),
    ...(settings.p2pServerUrl?.trim() ? { p2pServerUrl: settings.p2pServerUrl.trim() } : {}),
    ...(settings.p2pAuthToken?.trim() ? { p2pAuthToken: settings.p2pAuthToken.trim() } : {}),
    ...(settings.p2pNodePrivateKey?.trim()
      ? { p2pNodePrivateKey: settings.p2pNodePrivateKey.trim() }
      : {}),
    ...(settings.p2pNodePublicKey?.trim()
      ? { p2pNodePublicKey: settings.p2pNodePublicKey.trim() }
      : {}),
    ...(settings.soundNotifications === true ? { soundNotifications: true } : {}),
    ...(settings.minimizeToTray === false ? { minimizeToTray: false } : {})
  }
}

// Расшифровать API-ключ (хранится в виде base64-кодированного буфера)
function decryptApiKey(encrypted?: string): string {
  if (!encrypted) return ''
  try {
    const buffer = Buffer.from(encrypted, 'base64')
    return safeStorage.decryptString(buffer)
  } catch {
    // Если расшифровка не удаётся (напр. ключ с другой машины), вернуть пусто
    return ''
  }
}

// Зашифровать API-ключ и вернуть base64-кодированный буфер
function encryptApiKey(plaintext: string): string {
  if (!plaintext) return ''
  try {
    const buffer = safeStorage.encryptString(plaintext)
    return buffer.toString('base64')
  } catch (err) {
    console.error(
      '[settings] КРИТИЧЕСКАЯ ОШИБКА: шифрование API-ключа не удалось — ключ сброшен',
      err
    )
    return ''
  }
}

function decryptApiKeyPlainFallback(stored: string): string {
  if (!stored) return ''
  if (/^(sk-|AIza)/.test(stored)) return stored
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return stored
  }
}

export async function loadSettings(): Promise<PersistedSettings> {
  const path = storePath()
  if (!existsSync(path)) {
    return { ...DEFAULT_SETTINGS, liveRuntimeFromGit: defaultLiveRuntimeFromGit() }
  }

  try {
    const raw = await readFile(path, 'utf-8')
    const json = JSON.parse(raw) as unknown

    // Расшифровать API-ключи до валидации
    if (json && typeof json === 'object') {
      const obj = json as Record<string, unknown>
      if (obj.providerApiKey) obj.providerApiKey = decryptApiKey(obj.providerApiKey as string)
      if (obj.deepseekApiKey) obj.deepseekApiKey = decryptApiKey(obj.deepseekApiKey as string)
      if (obj.openaiApiKey) obj.openaiApiKey = decryptApiKey(obj.openaiApiKey as string)
      if (obj.openrouterApiKey) obj.openrouterApiKey = decryptApiKey(obj.openrouterApiKey as string)
      if (obj.geminiApiKey) obj.geminiApiKey = decryptApiKey(obj.geminiApiKey as string)
      if (obj.qdrantApiKey) obj.qdrantApiKey = decryptApiKey(obj.qdrantApiKey as string)
      if (obj.milvusApiKey) obj.milvusApiKey = decryptApiKey(obj.milvusApiKey as string)
      if (obj.gitlabToken) obj.gitlabToken = decryptApiKey(obj.gitlabToken as string)
      if (obj.githubToken) obj.githubToken = decryptApiKey(obj.githubToken as string)
      if (obj.jiraToken) obj.jiraToken = decryptApiKey(obj.jiraToken as string)
      if (obj.linearApiKey) obj.linearApiKey = decryptApiKey(obj.linearApiKey as string)
      if (obj.cloudApiKey && typeof obj.cloudApiKey === 'string') {
        obj.cloudApiKey = decryptApiKeyPlainFallback(obj.cloudApiKey)
      }
      migrateCloudApiKey(obj as LegacySettings)
      delete obj.cloudApiKey
    }

    const result = PersistedSettingsSchema.safeParse(json)
    if (result.success) {
      return {
        ...result.data,
        liveRuntimeFromGit: resolveLiveRuntimeFromGit(result.data.liveRuntimeFromGit)
      }
    }

    // Схема не прошла — логируем проблемные поля и применяем normalize с дефолтами
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    console.warn('[settings] Невалидный конфиг, применяю дефолты. Проблемы:', issues)
    return normalize(json as Partial<PersistedSettings>)
  } catch (e) {
    console.warn('[settings] Ошибка загрузки конфига:', e instanceof Error ? e.message : String(e))
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(settings: AgentSettings): Promise<PersistedSettings> {
  const normalized = normalize(settings)
  // Зашифровать API-ключи перед сохранением
  const toSave = {
    ...normalized,
    providerApiKey: '',
    deepseekApiKey: encryptApiKey(normalized.deepseekApiKey),
    openaiApiKey: encryptApiKey(normalized.openaiApiKey),
    openrouterApiKey: encryptApiKey(normalized.openrouterApiKey),
    geminiApiKey: encryptApiKey(normalized.geminiApiKey),
    qdrantApiKey: encryptApiKey(normalized.qdrantApiKey ?? ''),
    milvusApiKey: encryptApiKey(normalized.milvusApiKey ?? ''),
    ...(normalized.gitlabToken ? { gitlabToken: encryptApiKey(normalized.gitlabToken) } : {}),
    ...(normalized.githubToken ? { githubToken: encryptApiKey(normalized.githubToken) } : {}),
    ...(normalized.jiraToken ? { jiraToken: encryptApiKey(normalized.jiraToken) } : {}),
    ...(normalized.linearApiKey ? { linearApiKey: encryptApiKey(normalized.linearApiKey) } : {})
  }
  await writeJsonAtomic(storePath(), toSave)
  // Продублировать настройки git-sync в config.json для лаунчера (start-dev.ps1).
  await writeLauncherConfig(normalized)
  // Вернуть с расшифрованным ключом
  return normalized
}

// Лаунчер (start-dev.ps1) запускается ДО Electron и читает настройки git-sync
// из %LOCALAPPDATA%\CodeViper\config.json. Дублируем туда нужные поля при сохранении.
function launcherConfigPath(): string | null {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return null
  return join(localAppData, 'CodeViper', 'config.json')
}

async function writeLauncherConfig(settings: PersistedSettings): Promise<void> {
  const path = launcherConfigPath()
  if (!path) return
  try {
    await writeJsonAtomic(path, {
      gitSyncOnStartup: settings.gitSyncOnStartup,
      gitSyncStrategy: settings.gitSyncStrategy
    })
  } catch {
    // Лаунчер-конфиг не критичен — при ошибке записи просто используется дефолт.
  }
}
