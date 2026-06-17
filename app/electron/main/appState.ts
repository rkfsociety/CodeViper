import { app } from 'electron'
import { existsSync } from 'fs'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
import { writeJsonAtomic } from './fsUtil'
import type { AppState } from '../../src/types'

function appStatePath(): string {
  return join(app.getPath('userData'), 'appState.json')
}

export async function readAppState(): Promise<AppState | null> {
  const path = appStatePath()
  if (!existsSync(path)) return null
  try {
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as AppState
  } catch {
    return null
  }
}

export async function writeAppState(state: AppState): Promise<void> {
  await writeJsonAtomic(appStatePath(), state)
}

export async function clearAppState(): Promise<void> {
  await unlink(appStatePath()).catch(() => {})
}
