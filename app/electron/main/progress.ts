import type { WebContents } from 'electron'

export interface ProgressInfo {
  label: string
  /** 0–100 для определённого прогресса; null — индикатор без процента (indeterminate) */
  percent: number | null
}

let target: WebContents | null = null

export function setProgressTarget(webContents: WebContents | null): void {
  target = webContents
}

export function emitProgress(label: string, percent: number | null = null): void {
  if (target && !target.isDestroyed()) {
    target.send('progress-event', { label, percent } satisfies ProgressInfo)
  }
}

export function clearProgress(): void {
  if (target && !target.isDestroyed()) {
    target.send('progress-event', null)
  }
}
