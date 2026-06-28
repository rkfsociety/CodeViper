import { z } from 'zod'

export const SIDE_PANEL_MIN_WIDTH = 220
export const SIDE_PANEL_MAX_WIDTH = 900
export const SIDE_PANEL_DEFAULT_WIDTH = 400
export const SIDE_PANEL_DEFAULT_HISTORY_WIDTH = 280

export const SidePanelWidthsSchema = z.object({
  history: z.number().int(),
  metrics: z.number().int(),
  trace: z.number().int()
})

export const UiLayoutPanelsSchema = z.object({
  fileTreeOpen: z.boolean(),
  terminalOpen: z.boolean(),
  prPanelOpen: z.boolean(),
  tracePanelOpen: z.boolean(),
  metricsPanelOpen: z.boolean()
})

export const UiLayoutStateSchema = z.object({
  version: z.literal(1),
  sidePanelWidths: SidePanelWidthsSchema,
  panels: UiLayoutPanelsSchema
})

export type SidePanelWidths = z.infer<typeof SidePanelWidthsSchema>
export type UiLayoutPanels = z.infer<typeof UiLayoutPanelsSchema>
export type UiLayoutState = z.infer<typeof UiLayoutStateSchema>

export function clampSidePanelWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDE_PANEL_DEFAULT_WIDTH
  return Math.min(SIDE_PANEL_MAX_WIDTH, Math.max(SIDE_PANEL_MIN_WIDTH, Math.round(value)))
}

export function normalizeSidePanelWidths(raw?: Partial<SidePanelWidths> | null): SidePanelWidths {
  return {
    history: clampSidePanelWidth(raw?.history ?? SIDE_PANEL_DEFAULT_HISTORY_WIDTH),
    metrics: clampSidePanelWidth(raw?.metrics ?? SIDE_PANEL_DEFAULT_WIDTH),
    trace: clampSidePanelWidth(raw?.trace ?? SIDE_PANEL_DEFAULT_WIDTH)
  }
}

export function defaultUiLayoutPanels(): UiLayoutPanels {
  return {
    fileTreeOpen: true,
    terminalOpen: false,
    prPanelOpen: false,
    tracePanelOpen: false,
    metricsPanelOpen: false
  }
}

export function defaultUiLayoutState(): UiLayoutState {
  return {
    version: 1,
    sidePanelWidths: normalizeSidePanelWidths(null),
    panels: defaultUiLayoutPanels()
  }
}

export function normalizeUiLayoutState(raw: unknown): UiLayoutState {
  const parsed = UiLayoutStateSchema.safeParse(raw)
  if (!parsed.success) return defaultUiLayoutState()

  return {
    version: 1,
    sidePanelWidths: normalizeSidePanelWidths(parsed.data.sidePanelWidths),
    panels: {
      fileTreeOpen: parsed.data.panels.fileTreeOpen,
      terminalOpen: parsed.data.panels.terminalOpen,
      prPanelOpen: parsed.data.panels.prPanelOpen,
      tracePanelOpen: parsed.data.panels.tracePanelOpen,
      metricsPanelOpen: parsed.data.panels.metricsPanelOpen
    }
  }
}

export function mergeUiLayoutState(
  base: UiLayoutState,
  patch: {
    panels?: Partial<UiLayoutPanels>
    sidePanelWidths?: Partial<SidePanelWidths>
  }
): UiLayoutState {
  return normalizeUiLayoutState({
    version: 1,
    sidePanelWidths: { ...base.sidePanelWidths, ...patch.sidePanelWidths },
    panels: { ...base.panels, ...patch.panels }
  })
}

export function adjustSidePanelWidth(current: number, deltaX: number): number {
  return clampSidePanelWidth(current + deltaX)
}

/** Разделитель слева от боковой панели: тянем влево (dx<0) → панель шире. */
export function mapOuterPanelResizeDelta(deltaX: number): number {
  return -deltaX
}
