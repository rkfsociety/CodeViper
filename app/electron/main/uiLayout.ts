import { app } from 'electron'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import {
  defaultUiLayoutState,
  normalizeUiLayoutState,
  type UiLayoutState
} from '../../shared/uiLayout'
import { writeJsonAtomic } from './fsUtil'

function storePath(): string {
  return join(app.getPath('userData'), 'ui-layout.json')
}

export async function loadUiLayout(): Promise<UiLayoutState> {
  const path = storePath()
  if (!existsSync(path)) return defaultUiLayoutState()

  try {
    const raw = JSON.parse(await readFile(path, 'utf-8')) as unknown
    return normalizeUiLayoutState(raw)
  } catch {
    return defaultUiLayoutState()
  }
}

export async function saveUiLayout(layout: UiLayoutState): Promise<UiLayoutState> {
  const normalized = normalizeUiLayoutState(layout)
  await writeJsonAtomic(storePath(), normalized)
  return normalized
}
