import { app } from 'electron'
import { existsSync } from 'fs'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'

interface AppSettingsFile {
  version: 1
  rebuildSourcePath: string | null
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'app-settings.json')
}

function emptySettings(): AppSettingsFile {
  return { version: 1, rebuildSourcePath: null }
}

async function loadSettings(): Promise<AppSettingsFile> {
  const path = settingsPath()
  if (!existsSync(path)) return emptySettings()

  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8')) as AppSettingsFile
    return {
      version: 1,
      rebuildSourcePath:
        typeof parsed.rebuildSourcePath === 'string' ? parsed.rebuildSourcePath : null
    }
  } catch {
    return emptySettings()
  }
}

async function saveSettings(settings: AppSettingsFile): Promise<void> {
  const path = settingsPath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(settings, null, 2), 'utf-8')
}

export async function getRebuildSourcePath(): Promise<string | null> {
  const settings = await loadSettings()
  return settings.rebuildSourcePath
}

export async function setRebuildSourcePath(path: string | null): Promise<void> {
  const settings = await loadSettings()
  settings.rebuildSourcePath = path
  await saveSettings(settings)
}
