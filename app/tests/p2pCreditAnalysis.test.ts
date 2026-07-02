import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findP2pCreditIssues } from '../electron/main/p2pCreditAnalysis'

vi.mock('../electron/main/settings', () => ({
  loadSettings: vi.fn()
}))

import { loadSettings } from '../electron/main/settings'

function initTempProject(): string {
  return mkdtempSync(join(tmpdir(), 'cv-p2p-credit-'))
}

function writeCreditsFixture(dir: string, source: string): void {
  writeFileSync(join(dir, 'credits.ts'), source, 'utf8')
}

describe('findP2pCreditIssues', () => {
  beforeEach(() => {
    vi.mocked(loadSettings).mockResolvedValue({
      p2pServerUrl: '',
      p2pAuthToken: ''
    } as any)
    vi.unstubAllGlobals()
  })

  it('reports static balance, NaN and limit issues', async () => {
    const dir = initTempProject()
    try {
      writeCreditsFixture(
        dir,
        `export const P2P_INITIAL_CREDITS = parseInt(process.env.P2P_INITIAL_CREDITS ?? 'foo', 10)
export const P2P_TASK_CREDIT_COST = parseInt(process.env.P2P_TASK_CREDIT_COST ?? '-10', 10)
export const P2P_TASK_CREDIT_REWARD = parseInt(process.env.P2P_TASK_CREDIT_REWARD ?? '10', 10)

const memBalances = new Map<string, number>()

export class CreditStore {
  constructor(private readonly redis: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> } | null) {}

  private key(userId: string): string {
    return 'credits:' + userId
  }

  private async readRaw(userId: string): Promise<number | null> {
    if (this.redis) {
      const raw = await this.redis.get(this.key(userId))
      return raw != null ? parseInt(raw, 10) : null
    }
    return memBalances.get(userId) ?? null
  }

  private async writeRaw(userId: string, balance: number): Promise<void> {
    const value = String(balance)
    if (this.redis) {
      await this.redis.set(this.key(userId), value)
    } else {
      memBalances.set(userId, parseInt(value, 10))
    }
  }

  async getBalance(userId: string): Promise<number> {
    const raw = await this.readRaw(userId)
    if (raw === null) {
      await this.writeRaw(userId, P2P_INITIAL_CREDITS)
      return P2P_INITIAL_CREDITS
    }
    return raw
  }

  async adjust(userId: string, delta: number): Promise<number> {
    const current = await this.getBalance(userId)
    const next = current + delta
    await this.writeRaw(userId, next)
    return next
  }

  async settleTask(senderUserId: string, providerUserId: string): Promise<void> {
    const senderBalance = await this.getBalance(senderUserId)
    const newSender = await this.adjust(senderUserId, -P2P_TASK_CREDIT_COST)
    const newProvider = await this.adjust(providerUserId, P2P_TASK_CREDIT_REWARD)
    void senderBalance
    void newSender
    void newProvider
  }
}`
      )

      const result = await findP2pCreditIssues(dir, { path: 'credits.ts' })
      expect(result).toContain('Найдено 5 проблем P2P credits')
      expect(result).toContain('P2P_INITIAL_CREDITS использует некорректный дефолт "foo"')
      expect(result).toContain('P2P_TASK_CREDIT_COST содержит отрицательный лимит -10')
      expect(result).toContain('readRaw() возвращает parseInt(raw, 10) без проверки NaN')
      expect(result).toContain(
        'writeRaw() не ограничивает записываемый баланс через Math.max(0, balance)'
      )
      expect(result).toContain('settleTask() не проверяет senderBalance < cost перед списанием')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports runtime credit store issues when balance endpoint is available', async () => {
    const dir = initTempProject()
    try {
      writeCreditsFixture(
        dir,
        `export const P2P_INITIAL_CREDITS = parseInt(process.env.P2P_INITIAL_CREDITS ?? '100', 10)
export const P2P_TASK_CREDIT_COST = parseInt(process.env.P2P_TASK_CREDIT_COST ?? '10', 10)
export const P2P_TASK_CREDIT_REWARD = parseInt(process.env.P2P_TASK_CREDIT_REWARD ?? '10', 10)

const memBalances = new Map<string, number>()

export class CreditStore {
  constructor(private readonly redis: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> } | null) {}

  private key(userId: string): string {
    return 'credits:' + userId
  }

  private async readRaw(userId: string): Promise<number | null> {
    if (this.redis) {
      const raw = await this.redis.get(this.key(userId))
      const value = Number(raw)
      return Number.isFinite(value) ? value : null
    }
    return memBalances.get(userId) ?? null
  }

  private async writeRaw(userId: string, balance: number): Promise<void> {
    const value = String(Math.max(0, balance))
    if (this.redis) {
      await this.redis.set(this.key(userId), value)
    } else {
      memBalances.set(userId, parseInt(value, 10))
    }
  }

  async getBalance(userId: string): Promise<number> {
    const raw = await this.readRaw(userId)
    if (raw === null) {
      await this.writeRaw(userId, P2P_INITIAL_CREDITS)
      return P2P_INITIAL_CREDITS
    }
    return raw
  }

  async adjust(userId: string, delta: number): Promise<number> {
    const current = await this.getBalance(userId)
    const next = Math.max(0, current + delta)
    await this.writeRaw(userId, next)
    return next
  }

  async settleTask(senderUserId: string, providerUserId: string): Promise<void> {
    const senderBalance = await this.getBalance(senderUserId)
    if (senderBalance < P2P_TASK_CREDIT_COST) {
      throw new Error('insufficient credits')
    }
    await this.adjust(senderUserId, -P2P_TASK_CREDIT_COST)
    await this.adjust(providerUserId, P2P_TASK_CREDIT_REWARD)
  }
}`
      )

      vi.mocked(loadSettings).mockResolvedValue({
        p2pServerUrl: 'http://localhost:4242',
        p2pAuthToken: 'test-token'
      } as any)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ ok: true, balance: -7 })
        })
      )

      const result = await findP2pCreditIssues(dir, { path: 'credits.ts' })
      expect(result).toContain('Найдено 1 проблем P2P credits')
      expect(result).toContain('[runtime] runtime balance отрицательный: -7')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns clean report for a healthy credits store', async () => {
    const dir = initTempProject()
    try {
      writeCreditsFixture(
        dir,
        `export const P2P_INITIAL_CREDITS = parseInt(process.env.P2P_INITIAL_CREDITS ?? '100', 10)
export const P2P_TASK_CREDIT_COST = parseInt(process.env.P2P_TASK_CREDIT_COST ?? '10', 10)
export const P2P_TASK_CREDIT_REWARD = parseInt(process.env.P2P_TASK_CREDIT_REWARD ?? '10', 10)

const memBalances = new Map<string, number>()

export class CreditStore {
  constructor(private readonly redis: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> } | null) {}

  private key(userId: string): string {
    return 'credits:' + userId
  }

  private async readRaw(userId: string): Promise<number | null> {
    if (this.redis) {
      const raw = await this.redis.get(this.key(userId))
      const value = Number(raw)
      return Number.isFinite(value) ? value : null
    }
    return memBalances.get(userId) ?? null
  }

  private async writeRaw(userId: string, balance: number): Promise<void> {
    const value = String(Math.max(0, balance))
    if (this.redis) {
      await this.redis.set(this.key(userId), value)
    } else {
      memBalances.set(userId, parseInt(value, 10))
    }
  }

  async getBalance(userId: string): Promise<number> {
    const raw = await this.readRaw(userId)
    if (raw === null) {
      await this.writeRaw(userId, P2P_INITIAL_CREDITS)
      return P2P_INITIAL_CREDITS
    }
    return raw
  }

  async adjust(userId: string, delta: number): Promise<number> {
    const current = await this.getBalance(userId)
    const next = Math.max(0, current + delta)
    await this.writeRaw(userId, next)
    return next
  }

  async settleTask(senderUserId: string, providerUserId: string): Promise<void> {
    const senderBalance = await this.getBalance(senderUserId)
    if (senderBalance < P2P_TASK_CREDIT_COST) {
      throw new Error('insufficient credits')
    }
    await this.adjust(senderUserId, -P2P_TASK_CREDIT_COST)
    await this.adjust(providerUserId, P2P_TASK_CREDIT_REWARD)
  }
}`
      )

      const result = await findP2pCreditIssues(dir, { path: 'credits.ts' })
      expect(result).toBe('Некорректных P2P credits не найдено.')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
