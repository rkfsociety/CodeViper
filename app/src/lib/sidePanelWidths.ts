import { tronStorage } from './tron'

export const SIDE_PANEL_MIN_WIDTH = 220
export const SIDE_PANEL_MAX_WIDTH = 900
export const SIDE_PANEL_DEFAULT_WIDTH = 400
export const SIDE_PANEL_DEFAULT_HISTORY_WIDTH = 280

export const SIDE_PANEL_WIDTHS_KEY = 'cv-side-panel-widths'

export type SidePanelWidths = {
  history: number
  metrics: number
  trace: number
}

function clampWidth(value: number): number {
  return Math.min(SIDE_PANEL_MAX_WIDTH, Math.max(SIDE_PANEL_MIN_WIDTH, Math.round(value)))
}

export function loadSidePanelWidths(): SidePanelWidths {
  const saved = tronStorage.getItem(SIDE_PANEL_WIDTHS_KEY) as Partial<SidePanelWidths> | null
  return {
    history: clampWidth(saved?.history ?? SIDE_PANEL_DEFAULT_HISTORY_WIDTH),
    metrics: clampWidth(saved?.metrics ?? SIDE_PANEL_DEFAULT_WIDTH),
    trace: clampWidth(saved?.trace ?? SIDE_PANEL_DEFAULT_WIDTH)
  }
}

export function saveSidePanelWidths(widths: SidePanelWidths): void {
  tronStorage.setItem(SIDE_PANEL_WIDTHS_KEY, widths)
}

export function adjustSidePanelWidth(current: number, deltaX: number): number {
  return clampWidth(current + deltaX)
}

/** Разделитель слева от боковой панели: тянем влево (dx<0) → панель шире. */
export function mapOuterPanelResizeDelta(deltaX: number): number {
  return -deltaX
}
