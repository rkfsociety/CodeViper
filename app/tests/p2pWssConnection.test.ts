import { describe, it, expect, vi, beforeEach } from 'vitest'

const { MockWs, sockets } = vi.hoisted(() => {
  const sockets: Array<{
    handlers: Map<string, Array<() => void>>
    readyState: number
    on: (event: string, fn: () => void) => void
    removeAllListeners: () => void
    close: () => void
  }> = []

  class MockWs {
    static OPEN = 1
    static CONNECTING = 0
    readyState = MockWs.CONNECTING
    handlers = new Map<string, Array<() => void>>()

    constructor(_url: string, _opts?: unknown) {
      sockets.push(this)
      queueMicrotask(() => {
        for (const fn of this.handlers.get('close') ?? []) fn()
      })
    }

    on(event: string, fn: () => void) {
      const list = this.handlers.get(event) ?? []
      list.push(fn)
      this.handlers.set(event, list)
    }

    removeAllListeners() {
      this.handlers.clear()
    }

    close() {
      for (const fn of this.handlers.get('close') ?? []) fn()
    }
  }

  return { MockWs, sockets }
})

vi.mock('ws', () => ({
  default: MockWs,
  WebSocket: MockWs
}))

import {
  getP2pWssConnectionState,
  isP2pWssOffline,
  resetP2pWssStateForTests,
  syncP2pWssConnection
} from '../electron/main/p2pClient'
import type { AgentSettings } from '../src/types'

const baseSettings: AgentSettings = {
  model: 'qwen2.5-coder:7b',
  ollamaUrl: 'http://127.0.0.1:11434',
  shareCompute: true,
  p2pServerUrl: 'http://localhost:4242',
  p2pAuthToken: 'token',
  p2pNodeId: 'node-1'
}

describe('P2P WSS disconnect', () => {
  beforeEach(() => {
    sockets.length = 0
    resetP2pWssStateForTests()
  })

  it('переходит в disconnected при обрыве WSS', async () => {
    syncP2pWssConnection(baseSettings)
    expect(getP2pWssConnectionState()).toBe('connecting')
    await Promise.resolve()
    expect(getP2pWssConnectionState()).toBe('disconnected')
    expect(isP2pWssOffline()).toBe(true)
  })
})
