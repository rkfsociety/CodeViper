import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const userDataDir = mkdtempSync(join(tmpdir(), 'cv-trace-userdata-'))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? userDataDir : process.cwd())
  }
}))

import { exportAgentTrace, getAgentTracesDir } from '../electron/main/traceStorage'

describe('traceStorage', () => {
  afterEach(() => {
    rmSync(getAgentTracesDir(), { recursive: true, force: true })
  })

  it('сохраняет трейс в userData/traces, не в папку проекта', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'cv-trace-project-'))
    const events = [{ ts: 1, kind: 'run_start' as const, label: 'start', data: {} }]

    const result = await exportAgentTrace('chat-1', events, projectDir)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.path.startsWith(getAgentTracesDir())).toBe(true)
    expect(result.path.includes(projectDir)).toBe(false)

    const saved = JSON.parse(readFileSync(result.path, 'utf8'))
    expect(saved.chatId).toBe('chat-1')
    expect(saved.projectPath).toBe(projectDir)
    expect(saved.events).toHaveLength(1)

    rmSync(projectDir, { recursive: true, force: true })
  })

  it('экспорт без projectPath не требует выбранного проекта', async () => {
    const result = await exportAgentTrace('chat-2', [])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const saved = JSON.parse(readFileSync(result.path, 'utf8'))
    expect(saved.projectPath).toBeUndefined()
  })
})
