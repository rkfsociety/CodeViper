import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  CreditStore,
  P2P_INITIAL_CREDITS,
  P2P_TASK_CREDIT_COST,
  P2P_TASK_CREDIT_REWARD,
  resetCreditsStoreForTests
} from '../../server/p2p/src/credits.js'
import { fetchP2pCreditsBalance } from '../electron/main/p2pClient'
import { formatP2pCreditsLabel } from '../src/components/AgentStatusBar'
import type { AgentSettings } from '../src/types'

describe('CreditStore', () => {
  beforeEach(() => {
    resetCreditsStoreForTests()
  })

  it('обновляет баланс после mock P2P-задачи (+N/−N)', async () => {
    const store = new CreditStore(null)
    const sender = 'user-sender'
    const provider = 'user-provider'

    expect(await store.getBalance(sender)).toBe(P2P_INITIAL_CREDITS)
    expect(await store.getBalance(provider)).toBe(P2P_INITIAL_CREDITS)

    const settled = await store.settleTask(sender, provider)
    expect(settled.senderBalance).toBe(P2P_INITIAL_CREDITS - P2P_TASK_CREDIT_COST)
    expect(settled.providerBalance).toBe(P2P_INITIAL_CREDITS + P2P_TASK_CREDIT_REWARD)
    expect(await store.getBalance(sender)).toBe(P2P_INITIAL_CREDITS - P2P_TASK_CREDIT_COST)
  })
})

describe('fetchP2pCreditsBalance', () => {
  it('возвращает баланс с сервера', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, balance: 42 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const settings: AgentSettings = {
      model: 'qwen2.5-coder:7b',
      ollamaUrl: 'http://127.0.0.1:11434',
      p2pServerUrl: 'http://localhost:4242',
      p2pAuthToken: 'test-token'
    }

    const result = await fetchP2pCreditsBalance(settings)
    expect(result).toEqual({ ok: true, balance: 42 })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://localhost:4242/credits/balance',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' }
      })
    )

    vi.unstubAllGlobals()
  })
})

describe('formatP2pCreditsLabel', () => {
  it('форматирует чип баланса', () => {
    expect(formatP2pCreditsLabel(90)).toBe('⚡ P2P 90 кр.')
  })
})
