import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findP2pConnectionIssues } from '../electron/main/p2pConnectionAnalysis'
import { loadSettings } from '../electron/main/settings'

vi.mock('../electron/main/settings', () => ({
  loadSettings: vi.fn()
}))

const loadSettingsMock = vi.mocked(loadSettings)

function makeTempProject(): string {
  return mkdtempSync(join(tmpdir(), 'cv-p2p-connection-'))
}

beforeEach(() => {
  loadSettingsMock.mockReset()
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('findP2pConnectionIssues', () => {
  it('returns clean report for a fixed fixture', async () => {
    const dir = makeTempProject()
    try {
      writeFileSync(
        join(dir, 'p2pClient.ts'),
        `export function syncP2pWssConnection(): void {
  const maxRetries = 3
  const scheduleReconnect = () => setTimeout(scheduleReconnect, 1000)
  setTimeout(scheduleReconnect, 1000)
  void maxRetries
}

export function subscribeP2pTaskWss(): void {
  AbortSignal.timeout(5000)
}

export function acquireP2pTaskSlot(): void {}
`,
        'utf8'
      )

      loadSettingsMock.mockResolvedValue({} as never)

      const result = await findP2pConnectionIssues(dir, { path: 'p2pClient.ts' })
      expect(result).toContain('find_p2p_connection_issues():')
      expect(result).toContain('P2P connection')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports static issues in the current p2pClient.ts', async () => {
    loadSettingsMock.mockResolvedValue({ p2pServerUrl: '::::' } as never)

    const result = await findP2pConnectionIssues(join(process.cwd(), '..'), {
      path: 'app/electron/main/p2pClient.ts'
    })

    expect(result).toContain('find_p2p_connection_issues')
    expect(result).toContain('reconnect backoff/retry loop')
    expect(result).toContain('maxRetries')
    expect(result).toContain('timeout')
    expect(result).toContain('p2pServerUrl')
  })

  it('pings health endpoint when settings are valid', async () => {
    const dir = makeTempProject()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'offline'
    })

    vi.stubGlobal('fetch', fetchMock)

    try {
      writeFileSync(
        join(dir, 'p2pClient.ts'),
        `export function syncP2pWssConnection(): void {
  const maxRetries = 2
  const retry = () => setTimeout(retry, 250)
  setTimeout(retry, 250)
  void maxRetries
}

export function subscribeP2pTaskWss(): void {
  AbortSignal.timeout(3000)
}

export function acquireP2pTaskSlot(): void {}
`,
        'utf8'
      )

      loadSettingsMock.mockResolvedValue({ p2pServerUrl: 'http://localhost:4242' } as never)

      const result = await findP2pConnectionIssues(dir, { path: 'p2pClient.ts' })
      expect(fetchMock).toHaveBeenCalledWith(
        'https://localhost:4242/health',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
      expect(result).toContain('health-check 503')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
