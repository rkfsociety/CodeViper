/**
 * Цепочка fallbackModels: primary 429 → secondary ok.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { buildModelFallbackChain } from '../electron/main/agentContextManager'

const chatState = vi.hoisted(() => ({
  models: [] as string[]
}))

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/model-fallback' }
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

vi.mock('../electron/main/modelRuntime', async (importOriginal) => {
  const original = await importOriginal<typeof import('../electron/main/modelRuntime')>()

  function MockModelRuntime() {
    /* пустой конструктор */
  }

  MockModelRuntime.prototype.getModelPlacement = function () {
    return Promise.resolve('gpu')
  }

  MockModelRuntime.prototype.chat = async function* (options: { model?: string }) {
    const model = options.model ?? ''
    chatState.models.push(model)
    if (model === 'primary-model') {
      throw new Error('OpenAI API error 429: rate limit exceeded')
    }
    yield { content: 'ok', stop_reason: 'stop' }
  }

  return { ...original, ModelRuntime: MockModelRuntime }
})

import { AgentRunner } from '../electron/main/agent'
import type { AgentSettings, AgentStreamPayload } from '../src/types'

function makeSettings(overrides: Partial<AgentSettings> = {}): AgentSettings {
  return {
    model: 'primary-model',
    modelProvider: 'openai',
    openaiApiKey: 'sk-test',
    ollamaUrl: 'http://127.0.0.1:11434',
    orchestratorEnabled: false,
    fallbackModels: ['backup-model'],
    ...overrides
  }
}

describe('buildModelFallbackChain', () => {
  it('дедуплицирует и сохраняет порядок', () => {
    expect(buildModelFallbackChain('gpt-4o', ['gpt-4o-mini', 'gpt-4o'])).toEqual([
      'gpt-4o',
      'gpt-4o-mini'
    ])
  })
})

describe('AgentRunner — fallbackModels при 429', () => {
  let projectDir: string
  let emitted: AgentStreamPayload[]

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cv-model-fallback-'))
    emitted = []
    chatState.models = []
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('primary fail 429 → secondary ok', async () => {
    const runner = new AgentRunner({
      settings: makeSettings(),
      projectPath: projectDir,
      emit: (e) => emitted.push(e)
    })

    await runner.run([], 'привет')

    expect(chatState.models).toEqual(['primary-model', 'backup-model'])
    expect(emitted.some((e) => e.type === 'model_fallback')).toBe(true)
    expect(emitted.some((e) => e.type === 'assistant' || e.type === 'token')).toBe(true)
    expect(emitted.map((e) => e.type)).toContain('done')
  })

  it('без fallbackModels не переключает модель при 429', async () => {
    const runner = new AgentRunner({
      settings: makeSettings({ fallbackModels: [] }),
      projectPath: projectDir,
      emit: (e) => emitted.push(e)
    })

    await expect(runner.run([], 'привет')).rejects.toThrow(/429/)
    expect(chatState.models).toEqual(['primary-model'])
    expect(emitted.some((e) => e.type === 'model_fallback')).toBe(false)
  })
})
