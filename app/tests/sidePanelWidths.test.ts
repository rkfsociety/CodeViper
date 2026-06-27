import { describe, it, expect } from 'vitest'
import {
  adjustSidePanelWidth,
  mapOuterPanelResizeDelta,
  SIDE_PANEL_MIN_WIDTH
} from '../src/lib/sidePanelWidths'

describe('sidePanelWidths', () => {
  it('adjustSidePanelWidth увеличивает ширину при положительном delta', () => {
    expect(adjustSidePanelWidth(400, 50)).toBe(450)
  })

  it('adjustSidePanelWidth не опускается ниже минимума', () => {
    expect(adjustSidePanelWidth(SIDE_PANEL_MIN_WIDTH, -100)).toBe(SIDE_PANEL_MIN_WIDTH)
  })

  it('mapOuterPanelResizeDelta: тянем разделитель влево — панель шире', () => {
    const dragLeft = -30
    expect(adjustSidePanelWidth(400, mapOuterPanelResizeDelta(dragLeft))).toBe(430)
  })

  it('mapOuterPanelResizeDelta: тянем разделитель вправо — панель уже', () => {
    const dragRight = 30
    expect(adjustSidePanelWidth(400, mapOuterPanelResizeDelta(dragRight))).toBe(370)
  })
})
