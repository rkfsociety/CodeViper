import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const userDataDir = mkdtempSync(join(tmpdir(), 'cv-trace-userdata-'))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? userDataDir : process.cwd())
  }
}))

import {
  exportAgentTrace,
  getAgentTracesDir,
  loadChatTrace,
  appendChatTraceEvent,
  clearChatTrace,
  flushPendingChatTraceWrites
} from '../electron/main/traceStorage'

const sampleEvent = {
  ts: 1000,
  kind: 'run_start' as const,
  label: 'start',
  data: {}
}

describe('traceStorage', () => {
  afterEach(async () => {
    vi.useRealTimers()
    await flushPendingChatTraceWrites().catch(() => {})
    await clearChatTrace('chat-1').catch(() => {})
    await clearChatTrace('chat-2').catch(() => {})
    rmSync(getAgentTracesDir(), { recursive: true, force: true })
  })

  it('сохраняет трейс в userData/traces, не в папку проекта', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'cv-trace-project-'))
    const events = [sampleEvent]

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

  it('привязывает трейс к чату и восстанавливает после перезапуска кэша', async () => {
    await appendChatTraceEvent('chat-1', sampleEvent)
    await flushPendingChatTraceWrites()

    const path = join(getAgentTracesDir(), 'chats', 'chat-1.json')
    expect(existsSync(path)).toBe(true)

    const first = await loadChatTrace('chat-1')
    expect(first).toHaveLength(1)
    expect(first[0]?.label).toBe('start')

    await clearChatTrace('chat-1')
    const cleared = await loadChatTrace('chat-1')
    expect(cleared).toHaveLength(0)
    expect(existsSync(path)).toBe(false)
  })

  it('дописывает события в файл чата с debounce', async () => {
    vi.useFakeTimers()
    const pending = appendChatTraceEvent('chat-1', sampleEvent)
    await pending
    await appendChatTraceEvent('chat-1', { ...sampleEvent, ts: 2000, label: 'step 2' })
    await vi.advanceTimersByTimeAsync(300)
    vi.useRealTimers()
    await flushPendingChatTraceWrites()

    const loaded = await loadChatTrace('chat-1')
    expect(loaded).toHaveLength(2)
    expect(loaded[1]?.label).toBe('step 2')
  })
})
