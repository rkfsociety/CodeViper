import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { AgentSettings } from '../../src/types'

export interface PersistedSettings {
  version: 1
  ollamaUrl: string
  model: string
  projectPath: string
  maxSteps: number
  selfLearning: boolean
}

function storePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

const DEFAULT_SETTINGS: PersistedSettings = {
  version: 1,
  ollamaUrl: 'http://127.0.0.1:11434',
  model: '',
  projectPath: '',
  maxSteps: 12,
  selfLearning: true
}

function normalize(settings: Partial<AgentSettings>): PersistedSettings {
  return {
    version: 1,
    ollamaUrl: settings.ollamaUrl?.trim() || DEFAULT_SETTINGS.ollamaUrl,
    model: settings.model?.trim() ?? '',
    projectPath: settings.projectPath?.trim() ?? '',
    maxSteps:
      typeof settings.maxSteps === 'number' && settings.maxSteps >= 3 && settings.maxSteps <= 30
        ? settings.maxSteps
        : DEFAULT_SETTINGS.maxSteps,
    selfLearning: settings.selfLearning !== false
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
  const path = storePath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(normalized, null, 2), 'utf-8')
  return normalized
}
