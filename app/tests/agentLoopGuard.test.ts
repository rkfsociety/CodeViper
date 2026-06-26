import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LoopGuard } from '../electron/main/agentLoopGuard'
import { MAX_CONSECUTIVE_SAME_TOOL, MAX_SAME_TOOL_TOTAL } from '../shared/constants'
import type { AgentSettings } from '../src/types'
import type { ModelRuntime } from '../electron/main/modelRuntime'

vi.mock('../electron/main/agentOllamaApi', () => ({
  fetchOllamaModels: vi.fn()
}))

import { fetchOllamaModels } from '../electron/main/agentOllamaApi'

function createRuntime(chatImpl: () => AsyncGenerator<{ content?: string; stop_reason?: string }>) {
  return { chat: chatImpl } as unknown as ModelRuntime
}

describe('LoopGuard', () => {
  let loopGuard: LoopGuard

  beforeEach(() => {
    vi.mocked(fetchOllamaModels).mockReset()
    const mockSettings = { model: 'test-model' } as AgentSettings
    const mockRuntime = {} as ModelRuntime
    loopGuard = new LoopGuard(mockSettings, mockRuntime)
  })

  it('should block after MAX_CONSECUTIVE_SAME_TOOL consecutive calls', () => {
    const toolName = 'testTool'
    const signature = 'sig1'

    for (let i = 0; i < MAX_CONSECUTIVE_SAME_TOOL; i++) {
      const result = loopGuard.checkConsecutive(signature, toolName)
      expect(result).toBeNull()
    }

    const result = loopGuard.checkConsecutive(signature, toolName)
    expect(result).toContain(`Ты вызываешь инструмент "${toolName}"`)
  })

  it('should reset consecutive count when tool changes', () => {
    const toolName = 'testTool'
    const sig1 = 'sig1'
    const sig2 = 'sig2'

    for (let i = 0; i < MAX_CONSECUTIVE_SAME_TOOL; i++) {
      loopGuard.checkConsecutive(sig1, toolName)
    }

    // Change tool
    const result = loopGuard.checkConsecutive(sig2, toolName)
    expect(result).toBeNull()
  })

  it('should block after MAX_SAME_TOOL_TOTAL total calls', () => {
    const toolName = 'testTool'

    for (let i = 0; i < MAX_SAME_TOOL_TOTAL; i++) {
      const result = loopGuard.checkTotal(toolName)
      expect(result).toBeNull()
    }

    const result = loopGuard.checkTotal(toolName)
    expect(result).toContain(`Ты слишком часто используешь инструмент "${toolName}"`)
  })

  describe('decideNoToolAction', () => {
    it('passthrough для информационного вопроса без инструментов', async () => {
      const result = await loopGuard.decideNoToolAction(
        'Что такое TypeScript?',
        'TypeScript — типизированный надмножество JavaScript.',
        new Set(),
        false,
        false
      )
      expect(result).toEqual({ action: 'passthrough' })
    })

    it('retry когда mutating-задача без инструментов', async () => {
      const result = await loopGuard.decideNoToolAction(
        'Создай файл utils.ts с функцией foo',
        'Я создал файл utils.ts с функцией foo.',
        new Set(),
        false,
        false
      )
      expect(result.action).toBe('retry')
      if (result.action === 'retry') {
        expect(result.nudgeMessage).toContain('tool')
      }
    })

    it('failed после исчерпания verification retries', async () => {
      const guard = new LoopGuard(
        { model: 'test-model', ollamaUrl: 'http://localhost:11434' } as AgentSettings,
        createRuntime(async function* () {
          yield { content: '{"needsAction":true}', stop_reason: 'stop' }
        })
      )

      await guard.decideNoToolAction(
        'Изучи структуру проекта и перечисли модули',
        'Сейчас изучу проект…',
        new Set(),
        false,
        false
      )

      const result = await guard.decideNoToolAction(
        'Изучи структуру проекта и перечисли модули',
        'Вот список модулей без вызова инструментов…',
        new Set(),
        false,
        false
      )
      expect(result).toEqual({ action: 'failed' })
    })

    it('escalate при refusal и autoModel', async () => {
      vi.mocked(fetchOllamaModels).mockResolvedValue([
        { name: 'qwen2.5-coder:7b', size: 4_000_000_000, modifiedAt: '' },
        { name: 'qwen2.5-coder:32b', size: 20_000_000_000, modifiedAt: '' }
      ])

      const guard = new LoopGuard(
        {
          model: 'qwen2.5-coder:7b',
          ollamaUrl: 'http://localhost:11434',
          autoModel: true
        } as AgentSettings,
        createRuntime(async function* () {
          yield { content: '', stop_reason: 'stop' }
        })
      )

      const result = await guard.decideNoToolAction(
        'прочитай README',
        "I can't access files on your computer.",
        new Set(),
        false,
        true
      )

      expect(result).toEqual({ action: 'escalate', toModel: 'qwen2.5-coder:32b' })
      expect(guard.escalated).toBe(true)
    })
  })

  describe('classifyMutationNeededByLLM', () => {
    it('парсит needsAction:true из ответа модели', async () => {
      const guard = new LoopGuard(
        { model: 'test-model' } as AgentSettings,
        createRuntime(async function* () {
          yield { content: '{"needsAction":true}', stop_reason: 'stop' }
        })
      )
      expect(await guard.classifyMutationNeededByLLM('исправь баг в login')).toBe(true)
    })

    it('парсит needsAction:false', async () => {
      const guard = new LoopGuard(
        { model: 'test-model' } as AgentSettings,
        createRuntime(async function* () {
          yield { content: '{"needsAction":false}', stop_reason: 'stop' }
        })
      )
      expect(await guard.classifyMutationNeededByLLM('объясни что такое REST')).toBe(false)
    })

    it('возвращает null при невалидном ответе', async () => {
      const guard = new LoopGuard(
        { model: 'test-model' } as AgentSettings,
        createRuntime(async function* () {
          yield { content: 'не json', stop_reason: 'stop' }
        })
      )
      expect(await guard.classifyMutationNeededByLLM('исправь баг')).toBeNull()
    })
  })
})
