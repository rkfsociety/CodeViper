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

describe('findP2pCreditIssues', () => {
  beforeEach(() => {
    vi.mocked(loadSettings).mockResolvedValue({
      p2pServerUrl: '',
      p2pAuthToken: ''
    } as any)
  })

  it('reports static credit limits issues', async () => {
    const dir = initTempProject()
    try {
      writeFileSync(
        join(dir, 'credits.ts'),
        `export const P2P_INITIAL_CREDITS = parseInt(process.env.P2P_INITIAL_CREDITS ?? '100', 10)
export const P2P_TASK_CREDIT_COST = parseInt(process.env.P2P_TASK_CREDIT_COST ?? '10', 10)
export const P2P_TASK_CREDIT_REWARD = parseInt(process.env.P2P_TASK_CREDIT_REWARD ?? '10', 10)
`,
        'utf8'
      )

      const result = await findP2pCreditIssues(dir, { path: 'credits.ts' })
      expect(result).toMatch(/Найдено 2 проблем/)
      expect(result).toMatch(/некорректный числовой лимит|отсутствует ограничение/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
