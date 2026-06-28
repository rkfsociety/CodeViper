import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'

interface RuntimeUpdateState {
  appliedHead?: string
  dismissedHead?: string
}

function statePath(): string {
  return join(app.getPath('userData'), 'runtime-update-state.json')
}

async function loadState(): Promise<RuntimeUpdateState> {
  try {
    const raw = await readFile(statePath(), 'utf8')
    return JSON.parse(raw) as RuntimeUpdateState
  } catch {
    return {}
  }
}

async function saveState(state: RuntimeUpdateState): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(statePath(), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

export async function recordRuntimeAppliedHead(head: string): Promise<void> {
  const trimmed = head.trim()
  if (!trimmed) return
  const state = await loadState()
  await saveState({ ...state, appliedHead: trimmed, dismissedHead: undefined })
}

export async function recordRuntimeDismissedHead(head: string): Promise<void> {
  const trimmed = head.trim()
  if (!trimmed) return
  const state = await loadState()
  await saveState({ ...state, dismissedHead: trimmed })
}

export async function shouldSkipRuntimeUpdateBanner(localHead?: string): Promise<boolean> {
  const trimmed = localHead?.trim()
  if (!trimmed) return false
  const state = await loadState()
  return state.appliedHead === trimmed || state.dismissedHead === trimmed
}

/** Только для unit-тестов. */
export async function clearRuntimeUpdateStateForTests(): Promise<void> {
  try {
    const { unlink } = await import('fs/promises')
    await unlink(statePath())
  } catch {
    /* ok */
  }
}
