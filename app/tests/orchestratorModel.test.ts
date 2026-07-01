import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  analyze,
  analyzeGguf,
  analyzeOllama,
  analyzeCloud,
  parseOrchestratorResult,
  buildOrchestratorPrompt
} from '../electron/main/orchestratorModel'

vi.mock('../electron/main/nodeLlama', () => ({
  loadModel: vi.fn(),
  unloadModel: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../electron/main/providers/ollamaProvider', () => ({
  OllamaProvider: vi.fn().mockImplementation(function OllamaProvider() {
    return { chat: vi.fn() }
  })
}))

const cloudChat = vi.fn()
vi.mock('../electron/main/modelRuntime', () => ({
  ModelRuntime: vi.fn().mockImplementation(function ModelRuntime() {
    return { chat: cloudChat }
  })
}))

import { loadModel } from '../electron/main/nodeLlama'
import { OllamaProvider } from '../electron/main/providers/ollamaProvider'

const FAKE_PATH = '/fake/model.gguf'
const mockComplete = vi.fn()

function setupGgufMock(response: string) {
  mockComplete.mockResolvedValue(response)
  vi.mocked(loadModel).mockResolvedValue({
    modelPath: FAKE_PATH,
    complete: mockComplete,
    unload: vi.fn().mockResolvedValue(undefined)
  })
}

function setupOllamaMock(chunks: Array<{ content: string; stop_reason?: string }>) {
  const chat = vi.fn().mockImplementation(async function* () {
    for (const chunk of chunks) {
      yield chunk
    }
  })
  vi.mocked(OllamaProvider).mockImplementation(function MockOllamaProvider() {
    return { chat } as unknown as InstanceType<typeof OllamaProvider>
  })
  return chat
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('orchestratorModel.analyze', () => {
  it('парсит валидный JSON без обёртки (GGUF)', async () => {
    setupGgufMock('{"plan":"1. читать файл 2. добавить лог","isComplex":false}')
    const r = await analyzeGguf('добавь лог', FAKE_PATH)
    expect(r.plan).toBe('1. читать файл 2. добавить лог')
    expect(r.isComplex).toBe(false)
  })

  it('парсит JSON с prefix-текстом', async () => {
    setupGgufMock('Here is the analysis:\n{"plan":"шаги","isComplex":true}')
    const r = await analyzeGguf('сложная задача', FAKE_PATH)
    expect(r.plan).toBe('шаги')
    expect(r.isComplex).toBe(true)
  })

  it('analyzeOllama собирает стрим в результат', async () => {
    const chat = setupOllamaMock([
      { content: '{"plan":"план ollama","isComplex":false}', stop_reason: 'stop' }
    ])
    const r = await analyzeOllama('задача', 'http://127.0.0.1:11434', 'qwen2.5:3b')
    expect(r.plan).toBe('план ollama')
    expect(chat).toHaveBeenCalled()
  })

  it('analyze() маршрутизирует на Ollama', async () => {
    setupOllamaMock([{ content: '{"plan":"x","isComplex":false}', stop_reason: 'stop' }])
    const r = await analyze('тест', {
      backend: 'ollama',
      ollamaUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'qwen2.5:3b'
    })
    expect(r.plan).toBe('x')
  })

  it('buildOrchestratorPrompt не просит rephrased', () => {
    expect(buildOrchestratorPrompt('задача')).not.toMatch(/rephrased/i)
  })

  it('buildOrchestratorPrompt требует нумерованные шаги, не пересказ задачи', () => {
    const prompt = buildOrchestratorPrompt('найди magic numbers')
    expect(prompt).toMatch(/numbered steps/i)
    expect(prompt).toMatch(/NOT a restatement/i)
    expect(prompt).toMatch(/1\./)
  })

  it('fallback если не JSON', () => {
    const r = parseOrchestratorResult('Sorry, I cannot help.')
    expect(r.isComplex).toBe(false)
    expect(r.plan).toBe('')
  })

  it('analyze() маршрутизирует на cloud', async () => {
    cloudChat.mockImplementation(async function* () {
      yield { content: '{"plan":"облако","isComplex":false}', stop_reason: 'stop' }
    })
    const r = await analyze('тест', {
      backend: 'cloud',
      cloudProviderConfig: {
        type: 'literouter',
        baseUrl: 'https://lr.example',
        apiKey: 'k',
        model: 'deepseek:free'
      }
    })
    expect(r.plan).toBe('облако')
    expect(cloudChat).toHaveBeenCalled()
  })

  it('строковый второй аргумент — GGUF (обратная совместимость)', async () => {
    setupGgufMock('{"plan":"","isComplex":false}')
    await analyze('тест', FAKE_PATH)
    expect(vi.mocked(loadModel)).toHaveBeenCalledWith(FAKE_PATH)
  })
})
