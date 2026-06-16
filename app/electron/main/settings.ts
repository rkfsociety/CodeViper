import { app } from 'electron'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { AgentSettings } from '../../src/types'
import { normalizePermissionMode, type PermissionMode } from '../../shared/permissions'
import {
  DEFAULT_MAX_STEPS, MAX_STEPS_MIN, MAX_STEPS_MAX,
  DEFAULT_MAX_RUNS_PER_HOUR, MAX_RUNS_PER_HOUR_MIN, MAX_RUNS_PER_HOUR_MAX,
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
  permissionMode: 'bypass',
  clarifyMode: false,
  deepReasoning: false,
  autoPushSelfEdits: true,
  summarizeModel: '',
  modelProvider: DEFAULT_MODEL_PROVIDER,
  providerApiKey: ''
}

function normalize(settings: Partial<AgentSettings>): PersistedSettings {
  return {
    version: 1,
    ollamaUrl: settings.ollamaUrl?.trim() || DEFAULT_SETTINGS.ollamaUrl,
    model: settings.model?.trim() ?? '',
    maxSteps:
      typeof settings.maxSteps === 'number' && settings.maxSteps >= MAX_STEPS_MIN && settings.maxSteps <= MAX_STEPS_MAX
        ? settings.maxSteps
        : DEFAULT_SETTINGS.maxSteps,
    maxRunsPerHour:
      typeof settings.maxRunsPerHour === 'number' && settings.maxRunsPerHour >= MAX_RUNS_PER_HOUR_MIN && settings.maxRunsPerHour <= MAX_RUNS_PER_HOUR_MAX
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
    modelProvider: (settings.modelProvider || DEFAULT_SETTINGS.modelProvider) as 'ollama' | 'deepseek' | 'openai',
    providerApiKey: settings.providerApiKey?.trim() ?? ''
  }
}

export async function loadSettings(): Promise<PersistedSettings> {
  const path = storePath()
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS }

  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>
    return normalize(parsed)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(settings: AgentSettings): Promise<PersistedSettings> {
  const normalized = normalize(settings)
  await writeJsonAtomic(storePath(), normalized)
  return normalized
}
