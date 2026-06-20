import { app, safeStorage } from 'electron'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { AgentSettings, GitSyncStrategy } from '../../src/types'
import { GIT_SYNC_STRATEGIES } from '../../src/types'
import { normalizePermissionMode, type PermissionMode } from '../../shared/permissions'
import { DEFAULT_MODEL_PROVIDER } from '../../shared/constants'
import { writeJsonAtomic } from './fsUtil'

export interface PersistedSettings {
  version: 1
  ollamaUrl: string
  model: string
  selfLearning: boolean
  autoModel: boolean
  permissionMode: PermissionMode
  clarifyMode: boolean
  deepReasoning: boolean
  excludeThinkingFromHistory: boolean
  autoPushSelfEdits: boolean
  summarizeModel: string
  modelProvider: 'ollama' | 'deepseek' | 'openai' | 'openrouter'
  /** @deprecated Заменено на deepseekApiKey/openaiApiKey/openrouterApiKey */
  providerApiKey: string
  deepseekApiKey: string
  openaiApiKey: string
  openrouterApiKey: string
  gitSyncOnStartup: boolean
  gitSyncStrategy: GitSyncStrategy
  modelContextLength?: number
}

function storePath(): string {
  return join(app.getPath('userData'), 'settings.json')
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
  gitSyncOnStartup: true,
  gitSyncStrategy: 'stash'
}

function normalize(settings: Partial<AgentSettings>): PersistedSettings {
  const provider = (settings.modelProvider || DEFAULT_SETTINGS.modelProvider) as
    | 'ollama'
    | 'deepseek'
    | 'openai'
    | 'openrouter'

  // Миграция: если есть старый providerApiKey, переносим в нужное поле
  const legacyKey = settings.providerApiKey?.trim() ?? ''
  const deepseekApiKey =
    settings.deepseekApiKey?.trim() ?? (provider === 'deepseek' ? legacyKey : '')
  const openaiApiKey = settings.openaiApiKey?.trim() ?? (provider === 'openai' ? legacyKey : '')
  const openrouterApiKey =
    settings.openrouterApiKey?.trim() ?? (provider === 'openrouter' ? legacyKey : '')

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
    gitSyncOnStartup: settings.gitSyncOnStartup !== false,
    gitSyncStrategy: GIT_SYNC_STRATEGIES.includes(settings.gitSyncStrategy as GitSyncStrategy)
      ? (settings.gitSyncStrategy as GitSyncStrategy)
      : DEFAULT_SETTINGS.gitSyncStrategy,
    ...(settings.modelContextLength ? { modelContextLength: settings.modelContextLength } : {})
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
  } catch {
    // Если шифрование не удаётся, сохранить в открытом виде (пользователь нужен)
    return plaintext
  }
}

export async function loadSettings(): Promise<PersistedSettings> {
  const path = storePath()
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS }

  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>
    // Расшифровать API-ключи перед возвратом
    if (parsed.providerApiKey) parsed.providerApiKey = decryptApiKey(parsed.providerApiKey)
    if (parsed.deepseekApiKey) parsed.deepseekApiKey = decryptApiKey(parsed.deepseekApiKey)
    if (parsed.openaiApiKey) parsed.openaiApiKey = decryptApiKey(parsed.openaiApiKey)
    if (parsed.openrouterApiKey) parsed.openrouterApiKey = decryptApiKey(parsed.openrouterApiKey)
    return normalize(parsed)
  } catch {
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
    openrouterApiKey: encryptApiKey(normalized.openrouterApiKey)
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
