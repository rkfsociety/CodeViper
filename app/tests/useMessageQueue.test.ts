import { describe, it, expect } from 'vitest'
import { planAssistantRegenerate } from '../src/hooks/useMessageQueue'
import type { ChatMessage } from '../src/types'

function msg(id: string, role: ChatMessage['role'], content: string): ChatMessage {
  return { id, role, content, timestamp: 1 }
}

describe('planAssistantRegenerate', () => {
  it('обрезает user-turn и ответ assistant', () => {
    const messages = [
      msg('u1', 'user', 'привет'),
      msg('a1', 'assistant', 'ответ 1'),
      msg('u2', 'user', 'ещё раз'),
      msg('t1', 'tool', 'tool output'),
      msg('a2', 'assistant', 'ответ 2')
    ]
    const plan = planAssistantRegenerate(messages, 'a2')
    expect(plan).not.toBeNull()
    expect(plan!.truncated.map((m) => m.id)).toEqual(['u1', 'a1'])
    expect(plan!.userContent).toBe('ещё раз')
  })

  it('возвращает null без предшествующего user', () => {
    const messages = [msg('a1', 'assistant', 'один')]
    expect(planAssistantRegenerate(messages, 'a1')).toBeNull()
  })
})
