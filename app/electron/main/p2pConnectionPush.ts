import type { WebContents } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import {
  getP2pWssConnectionState,
  isP2pWssOffline,
  onP2pWssConnectionChange,
  type P2pWssConnectionState
} from './p2pClient'

let target: WebContents | null = null

function payload(state: P2pWssConnectionState = getP2pWssConnectionState()) {
  return { state, offline: state === 'disconnected' || isP2pWssOffline() }
}

function send(): void {
  if (target && !target.isDestroyed()) {
    target.send(IPC.P2P_WSS_STATUS, payload())
  }
}

export function startP2pWssStatusPush(webContents: WebContents): void {
  target = webContents
  send()
}

export function stopP2pWssStatusPush(): void {
  target = null
}

onP2pWssConnectionChange(() => send())
