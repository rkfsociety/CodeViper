import { describe, it, expect } from 'vitest'
import {
  adjustSidePanelWidth,
  clampSidePanelWidth,
  defaultUiLayoutState,
  mergeUiLayoutState,
  normalizeSidePanelWidths,
  normalizeUiLayoutState,
  SIDE_PANEL_MIN_WIDTH
} from '../shared/uiLayout'

describe('uiLayout', () => {
  it('normalizeSidePanelWidths подставляет значения по умолчанию', () => {
    expect(normalizeSidePanelWidths(null)).toEqual({
      history: 280,
      preview: 400,
      metrics: 400,
      trace: 400
    })
  })

  it('clampSidePanelWidth не опускается ниже минимума', () => {
    expect(clampSidePanelWidth(100)).toBe(SIDE_PANEL_MIN_WIDTH)
  })

  it('normalizeUiLayoutState отбрасывает невалидные данные', () => {
    expect(normalizeUiLayoutState({ version: 2 })).toEqual(defaultUiLayoutState())
  })

  it('mergeUiLayoutState объединяет частичные правки', () => {
    const base = defaultUiLayoutState()
    const merged = mergeUiLayoutState(base, {
      sidePanelWidths: { history: 360 },
      panels: { tracePanelOpen: true }
    })
    expect(merged.sidePanelWidths.history).toBe(360)
    expect(merged.sidePanelWidths.metrics).toBe(400)
    expect(merged.panels.tracePanelOpen).toBe(true)
    expect(merged.panels.terminalOpen).toBe(false)
  })

  it('adjustSidePanelWidth увеличивает ширину при положительном delta', () => {
    expect(adjustSidePanelWidth(400, 50)).toBe(450)
  })
})
