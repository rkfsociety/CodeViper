import type { WebContents } from 'electron'

export interface ProgressInfo {
  label: string
  /** 0–100 для определённого прогресса; null — индикатор без процента (indeterminate) */
  percent: number | null
}

let target: WebContents | null = null
let indexProgressStreamer: ((percent: number | null) => void) | null = null

export function setProgressTarget(webContents: WebContents | null): void {
  target = webContents
}

/** Проброс процента индексации в agent-stream (index_progress). */
export function setIndexProgressStreamer(fn: ((percent: number | null) => void) | null): void {
  indexProgressStreamer = fn
}

export function isIndexProgressLabel(label: string): boolean {
  return label.startsWith('Индексация')
}

function notifyIndexProgress(label: string, percent: number | null): void {
  if (!indexProgressStreamer || !isIndexProgressLabel(label)) return
  indexProgressStreamer(percent)
}

export function emitProgress(label: string, percent: number | null = null): void {
  if (target && !target.isDestroyed()) {
    target.send('progress-event', { label, percent } satisfies ProgressInfo)
  }
  notifyIndexProgress(label, percent)
}

export function clearProgress(): void {
  if (target && !target.isDestroyed()) {
    target.send('progress-event', null)
  }
  if (indexProgressStreamer) indexProgressStreamer(null)
}
