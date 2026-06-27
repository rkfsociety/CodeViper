import { describe, it, expect } from 'vitest'
import { adjustSidePanelWidth, SIDE_PANEL_MIN_WIDTH } from '../src/lib/sidePanelWidths'

describe('sidePanelWidths', () => {
  it('adjustSidePanelWidth увеличивает ширину при положительном delta', () => {
    expect(adjustSidePanelWidth(400, 50)).toBe(450)
  })

  it('adjustSidePanelWidth не опускается ниже минимума', () => {
    expect(adjustSidePanelWidth(SIDE_PANEL_MIN_WIDTH, -100)).toBe(SIDE_PANEL_MIN_WIDTH)
  })
})
