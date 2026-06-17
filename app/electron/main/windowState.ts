import { app, BrowserWindow, screen } from 'electron'
import { existsSync, writeFileSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { writeJsonAtomic } from './fsUtil'

export interface WindowState {
  version: 1
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

const MIN_WIDTH = 960
const MIN_HEIGHT = 640
const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 820

const DEFAULT_STATE: WindowState = {
  version: 1,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  isMaximized: false
}

function storePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function clampSize(value: number, min: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.round(value))
}

export function normalizeWindowState(raw: Partial<WindowState> | null | undefined): WindowState {
  const width = clampSize(raw?.width ?? DEFAULT_WIDTH, MIN_WIDTH, DEFAULT_WIDTH)
  const height = clampSize(raw?.height ?? DEFAULT_HEIGHT, MIN_HEIGHT, DEFAULT_HEIGHT)
  const x = Number.isFinite(raw?.x) ? Math.round(raw!.x!) : undefined
  const y = Number.isFinite(raw?.y) ? Math.round(raw!.y!) : undefined

  const state: WindowState = {
    version: 1,
    width,
    height,
    isMaximized: raw?.isMaximized === true
  }

  if (x !== undefined && y !== undefined) {
    state.x = x
    state.y = y
  }

  return state
}

export function isWindowStateOnScreen(state: WindowState): boolean {
  if (state.x === undefined || state.y === undefined) return true

  const bounds = {
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height
  }

  return screen.getAllDisplays().some(({ workArea }) => {
    return (
      bounds.x < workArea.x + workArea.width &&
      bounds.x + bounds.width > workArea.x &&
      bounds.y < workArea.y + workArea.height &&
      bounds.y + bounds.height > workArea.y
    )
  })
}

export function captureWindowState(win: BrowserWindow): WindowState {
  const isMaximized = win.isMaximized()
  const bounds = isMaximized ? win.getNormalBounds() : win.getBounds()

  return normalizeWindowState({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized
  })
}

export async function loadWindowState(): Promise<WindowState> {
  const path = storePath()
  if (!existsSync(path)) return { ...DEFAULT_STATE }

  try {
    const raw = JSON.parse(await readFile(path, 'utf-8')) as Partial<WindowState>
    const state = normalizeWindowState(raw)
    if (!isWindowStateOnScreen(state)) {
      delete state.x
      delete state.y
    }
    return state
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export async function saveWindowState(win: BrowserWindow): Promise<void> {
  await writeJsonAtomic(storePath(), captureWindowState(win))
}

function saveWindowStateSync(win: BrowserWindow): void {
  writeFileSync(storePath(), JSON.stringify(captureWindowState(win), null, 2), 'utf-8')
}

export function trackWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null

  const scheduleSave = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void saveWindowState(win)
    }, 400)
  }

  win.on('resize', scheduleSave)
  win.on('move', scheduleSave)
  win.on('maximize', scheduleSave)
  win.on('unmaximize', scheduleSave)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    saveWindowStateSync(win)
  })
}

export function windowOptionsFromState(
  state: WindowState
): Electron.BrowserWindowConstructorOptions {
  const options: Electron.BrowserWindowConstructorOptions = {
    width: state.width,
    height: state.height,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT
  }

  if (state.x !== undefined && state.y !== undefined) {
    options.x = state.x
    options.y = state.y
  }

  return options
}
