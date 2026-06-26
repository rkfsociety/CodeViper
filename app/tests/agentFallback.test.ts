/**
 * Unit-тест: CircuitBreakerOpenError → emit ollama_fallback_offer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const openUntilMs = vi.hoisted(() => Date.now() + 30_000)

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/agent-fallback' }
}))

vi.mock('../electron/main/agentLogger', () => ({
  agentLogger: { write: vi.fn().mockResolvedValue(undefined) }
}))

vi.mock('../electron/main/agentContext', async (importOriginal) => {
  const original = await importOriginal<typeof import('../electron/main/agentContext')>()
  return {
    ...original,
    prepareAgentRunContext: vi.fn().mockResolvedValue({
      messages: [{ role: 'system', content: 'system prompt' }],
      preview: {
        sections: [],
        totalChars: 100,
        contextUsagePercent: 5,
        historySummarized: false
      }
    })
  }
})

vi.mock('../electron/main/selfCommit', () => ({
  commitAndPushSelfEdits: vi.fn().mockResolvedValue({ ok: true, message: 'ok' })
}))

vi.mock('../electron/main/agentOllamaApi', () => ({
  pingOllama: vi.fn(async () => true)
}))

vi.mock('../electron/main/modelRuntime', async (importOriginal) => {
  const original = await importOriginal<typeof import('../electron/main/modelRuntime')>()

  function MockModelRuntime() {
    /* пустой конструктор */
  }

  MockModelRuntime.prototype.getModelPlacement = function () {
    return Promise.resolve('gpu')
  }

  MockModelRuntime.prototype.chat = async function* () {
    throw new original.CircuitBreakerOpenError(openUntilMs)
  }

  return { ...original, ModelRuntime: MockModelRuntime }
})

import { AgentRunner } from '../electron/main/agent'
import { pingOllama } from '../electron/main/agentOllamaApi'
import type { AgentStreamPayload, AgentSettings } from '../src/types'

function makeSettings(overrides: Partial<AgentSettings> = {}): AgentSettings {
  return {
    model: 'gpt-4o',
    modelProvider: 'openai',
    openaiApiKey: 'sk-test',
    ollamaUrl: 'http://127.0.0.1:11434',
    orchestratorEnabled: false,
    ...overrides
  }
}

describe('AgentRunner — Ollama fallback при circuit open', () => {
  let projectDir: string
  let emitted: AgentStreamPayload[]
  let emit: (e: AgentStreamPayload) => void

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cv-fallback-'))
    emitted = []
    emit = (e) => emitted.push(e)
    vi.mocked(pingOllama).mockResolvedValue(true)
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('эмитит ollama_fallback_offer с URL при CircuitBreakerOpenError', async () => {
    const runner = new AgentRunner({
      settings: makeSettings(),
      projectPath: projectDir,
      emit
    })

    await runner.run([], 'привет')

    const types = emitted.map((e) => e.type)
    expect(types).toContain('circuit_breaker')
    expect(types).toContain('ollama_fallback_offer')
    expect(types).toContain('done')

    const cbEvent = emitted.find((e) => e.type === 'circuit_breaker')
    expect(cbEvent?.circuitBreakerState).toBe('open')
    expect(cbEvent?.circuitBreakerOpenUntilMs).toBe(openUntilMs)

    const fallback = emitted.find((e) => e.type === 'ollama_fallback_offer')
    expect(fallback).toMatchObject({
      type: 'ollama_fallback_offer',
      ollamaFallbackUrl: 'http://127.0.0.1:11434'
    })

    expect(pingOllama).toHaveBeenCalledWith('http://127.0.0.1:11434')
  })

  it('не предлагает fallback если Ollama недоступна', async () => {
    vi.mocked(pingOllama).mockResolvedValue(false)

    const runner = new AgentRunner({
      settings: makeSettings(),
      projectPath: projectDir,
      emit
    })

    await runner.run([], 'привет')

    const types = emitted.map((e) => e.type)
    expect(types).not.toContain('ollama_fallback_offer')
    expect(types).toContain('error')
    expect(types).toContain('done')
  })
})
