import {
  defaultUiLayoutState,
  mergeUiLayoutState,
  normalizeSidePanelWidths,
  type SidePanelWidths,
  type UiLayoutPanels,
  type UiLayoutState
} from '../../shared/uiLayout'
import { tronStorage } from './tron'

const LEGACY_SIDE_PANEL_WIDTHS_KEY = 'cv-side-panel-widths'
const LEGACY_FILE_TREE_VISIBLE_KEY = 'cv-file-tree-visible'

const SAVE_DEBOUNCE_MS = 300

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingLayout: UiLayoutState | null = null

function readLegacyLocalLayout(): {
  panels?: Partial<UiLayoutPanels>
  sidePanelWidths?: Partial<SidePanelWidths>
} | null {
  const legacyWidths = tronStorage.getItem(
    LEGACY_SIDE_PANEL_WIDTHS_KEY
  ) as Partial<SidePanelWidths> | null
  const legacyFileTree = tronStorage.getItem(LEGACY_FILE_TREE_VISIBLE_KEY)

  if (!legacyWidths && legacyFileTree === null) return null

  const patch: {
    panels?: Partial<UiLayoutPanels>
    sidePanelWidths?: Partial<SidePanelWidths>
  } = {}

  if (legacyWidths) {
    patch.sidePanelWidths = normalizeSidePanelWidths(legacyWidths)
  }
  if (legacyFileTree !== null) {
    patch.panels = { fileTreeOpen: legacyFileTree !== false }
  }

  return patch
}

function clearLegacyLocalLayout(): void {
  tronStorage.removeItem(LEGACY_SIDE_PANEL_WIDTHS_KEY)
  tronStorage.removeItem(LEGACY_FILE_TREE_VISIBLE_KEY)
}

export async function loadUiLayoutWithMigration(): Promise<UiLayoutState> {
  const fromMain = await window.codeviper.loadUiLayout()
  const legacy = readLegacyLocalLayout()
  if (!legacy) return fromMain

  const merged = mergeUiLayoutState(fromMain, legacy)
  clearLegacyLocalLayout()
  scheduleSaveUiLayout(merged)
  return merged
}

export function scheduleSaveUiLayout(layout: UiLayoutState): void {
  pendingLayout = layout
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const snapshot = pendingLayout ?? defaultUiLayoutState()
    pendingLayout = null
    saveTimer = null
    void window.codeviper.saveUiLayout(snapshot)
  }, SAVE_DEBOUNCE_MS)
}
