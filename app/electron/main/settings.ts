import { app, safeStorage } from 'electron'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { AgentSettings, GitSyncStrategy } from '../../src/types'
import { GIT_SYNC_STRATEGIES } from '../../src/types'
import { normalizePermissionMode, type PermissionMode } from '../../shared/permissions'
import {
  DEFAULT_MAX_STEPS,
  MAX_STEPS_MIN,
  MAX_STEPS_MAX,
  DEFAULT_MAX_RUNS_PER_HOUR,
  MAX_RUNS_PER_HOUR_MIN,
  MAX_RUNS_PER_HOUR_MAX,
  DEFAULT_MODEL_PROVIDER
} from '../../shared/constants'
import { writeJsonAtomic } from './fsUtil'

export interface PersistedSettings {
  version: 1
  ollamaUrl: string
  model: string
  maxSteps: number
  maxRunsPerHour: number
  selfLearning: boolean
  autoModel: boolean
  permissionMode: PermissionMode
  clarifyMode: boolean
  deepReasoning: boolean
  autoPushSelfEdits: boolean
  summarizeModel: string
  modelProvider: 'ollama' | 'deepseek' | 'openai'
  providerApiKey: string
  gitSyncOnStartup: boolean
  gitSyncStrategy: GitSyncStrategy
}

function storePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

const DEFAULT_SETTINGS: PersistedSettings = {
  version: 1,
  ollamaUrl: 'http://127.0.0.1:11434',
  model: '',
  maxSteps: DEFAULT_MAX_STEPS,
  maxRunsPerHour: DEFAULT_MAX_RUNS_PER_HOUR,
  selfLearning: true,
  autoModel: true,
  permissionMode: 'acceptEdits',
  clarifyMode: false,
  deepReasoning: false,
  autoPushSelfEdits: true,
  summarizeModel: '',
  modelProvider: DEFAULT_MODEL_PROVIDER,
  providerApiKey: '',
  gitSyncOnStartup: true,
  gitSyncStrategy: 'stash'
}

function normalize(settings: Partial<AgentSettings>): PersistedSettings {
  return {
    version: 1,
    ollamaUrl: settings.ollamaUrl?.trim() || DEFAULT_SETTINGS.ollamaUrl,
    model: settings.model?.trim() ?? '',
    maxSteps:
      typeof settings.maxSteps === 'number' &&
      settings.maxSteps >= MAX_STEPS_MIN &&
      settings.maxSteps <= MAX_STEPS_MAX
        ? settings.maxSteps
        : DEFAULT_SETTINGS.maxSteps,
    maxRunsPerHour:
      typeof settings.maxRunsPerHour === 'number' &&
      settings.maxRunsPerHour >= MAX_RUNS_PER_HOUR_MIN &&
      settings.maxRunsPerHour <= MAX_RUNS_PER_HOUR_MAX
        ? settings.maxRunsPerHour
        : DEFAULT_SETTINGS.maxRunsPerHour,
    selfLearning: settings.selfLearning !== false,
    autoModel: settings.autoModel !== false,
    // Миграция со старого булева confirmActions: true → 'ask'.
    permissionMode: normalizePermissionMode(
      settings.permissionMode ??
        ((settings as { confirmActions?: boolean }).confirmActions === true ? 'ask' : 'bypass')
    ),
    clarifyMode: settings.clarifyMode === true,
    deepReasoning: settings.deepReasoning === true,
    autoPushSelfEdits: settings.autoPushSelfEdits !== false,
    summarizeModel: settings.summarizeModel?.trim() ?? '',
    modelProvider: (settings.modelProvider || DEFAULT_SETTINGS.modelProvider) as
      | 'ollama'
      | 'deepseek'
      | 'openai',
    providerApiKey: settings.providerApiKey?.trim() ?? '',
    gitSyncOnStartup: settings.gitSyncOnStartup !== false,
    gitSyncStrategy: GIT_SYNC_STRATEGIES.includes(settings.gitSyncStrategy as GitSyncStrategy)
      ? (settings.gitSyncStrategy as GitSyncStrategy)
      : DEFAULT_SETTINGS.gitSyncStrategy
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
    // Расшифровать API-ключ перед возвратом
    if (parsed.providerApiKey) {
      parsed.providerApiKey = decryptApiKey(parsed.providerApiKey)
    }
    return normalize(parsed)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(settings: AgentSettings): Promise<PersistedSettings> {
  const normalized = normalize(settings)
  // Зашифровать API-ключ перед сохранением
  const toSave = {
    ...normalized,
    providerApiKey: encryptApiKey(normalized.providerApiKey)
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
