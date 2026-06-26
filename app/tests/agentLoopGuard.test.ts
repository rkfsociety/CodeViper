import { describe, it, expect, beforeEach } from 'vitest'
import { LoopGuard } from '../electron/main/agentLoopGuard'
import { MAX_CONSECUTIVE_SAME_TOOL, MAX_SAME_TOOL_TOTAL } from '../shared/constants'
import type { AgentSettings } from '../src/types'
import type { ModelRuntime } from '../electron/main/modelRuntime'

describe('LoopGuard', () => {
  let loopGuard: LoopGuard

  beforeEach(() => {
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
})
