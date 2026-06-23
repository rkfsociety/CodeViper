import { app, BrowserWindow, Menu, Tray, nativeImage, type Event } from 'electron'
import { trayTooltip } from '../../shared/trayStatus'
import { resolveAppIconPath } from './appIcon'

let tray: Tray | null = null
let quitting = false
let activeAgentChats = 0
let getMainWindow: (() => BrowserWindow | null) | null = null

function buildMenu(): Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Показать CodeViper',
      click: () => showMainWindow()
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => requestAppQuit()
    }
  ])
}

function refreshTooltip(): void {
  tray?.setToolTip(trayTooltip(activeAgentChats))
}

export function isAppQuitting(): boolean {
  return quitting
}

export function requestAppQuit(): void {
  quitting = true
  destroyTray()
  app.quit()
}

export function showMainWindow(): void {
  const win = getMainWindow?.()
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) win.show()
  win.focus()
}

export function updateTrayAgentActivity(count: number): void {
  activeAgentChats = Math.max(0, count)
  refreshTooltip()
}

export function createTray(mainWindowGetter: () => BrowserWindow | null): void {
  if (tray) return
  getMainWindow = mainWindowGetter

  const iconPath = resolveAppIconPath()
  if (!iconPath) return

  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) return

  if (process.platform === 'darwin') {
    image.setTemplateImage(true)
  }

  tray = new Tray(image)
  tray.setContextMenu(buildMenu())
  refreshTooltip()

  tray.on('click', () => showMainWindow())
  tray.on('double-click', () => showMainWindow())
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}

export function handleMainWindowClose(
  event: Event,
  minimizeToTray: boolean,
  win: BrowserWindow
): void {
  if (quitting || !minimizeToTray) return
  event.preventDefault()
  if (!win.isDestroyed()) win.hide()
}
