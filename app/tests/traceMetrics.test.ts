import { describe, it, expect } from 'vitest'
import { aggregateTraceEvents } from '../shared/traceMetrics'
import type { AgentTraceEvent } from '../src/types'

function ev(
  kind: AgentTraceEvent['kind'],
  ts: number,
  data: Record<string, unknown>
): AgentTraceEvent {
  return { ts, kind, label: kind, data }
}

describe('aggregateTraceEvents', () => {
  it('считает прогон, токены sessionTokens и инструменты по модели из трейса', () => {
    const events: AgentTraceEvent[] = [
      ev('run_start', 1000, { model: 'deepseek-chat', provider: 'openai' }),
      ev('tool_call', 1100, { step: 1, tool: 'read_file' }),
      ev('llm_response', 1200, { step: 1, tokens: 500, inputTokens: 300, outputTokens: 200 }),
      ev('run_end', 2000, {
        durationMs: 900,
        status: 'ok',
        sessionTokens: 1500,
        sessionCostUsd: 0.002
      })
    ]

    const { byModel, toolCount } = aggregateTraceEvents(events, 0)
    const row = byModel.get('deepseek-chat')
    expect(row?.runs).toBe(1)
    expect(row?.successRuns).toBe(1)
    expect(row?.totalTokens).toBe(1500)
    expect(row?.toolCalls).toBe(1)
    expect(row?.costUsd).toBeCloseTo(0.002)
    expect(toolCount.get('read_file')).toBe(1)
  })

  it('без sessionTokens суммирует llm_response.tokens за прогон', () => {
    const events: AgentTraceEvent[] = [
      ev('run_start', 1000, { model: 'qwen2.5-coder:7b' }),
      ev('llm_response', 1100, { step: 1, tokens: 100 }),
      ev('llm_response', 1200, { step: 2, tokens: 50 }),
      ev('run_end', 2000, { durationMs: 500, status: 'ok' })
    ]

    const row = aggregateTraceEvents(events, 0).byModel.get('qwen2.5-coder:7b')
    expect(row?.totalTokens).toBe(150)
  })

  it('фильтрует события старше cutoffTs', () => {
    const events: AgentTraceEvent[] = [
      ev('run_start', 100, { model: 'old-model' }),
      ev('run_end', 200, { durationMs: 100, status: 'ok', sessionTokens: 999 }),
      ev('run_start', 5000, { model: 'new-model' }),
      ev('run_end', 6000, { durationMs: 100, status: 'ok', sessionTokens: 10 })
    ]

    const { byModel } = aggregateTraceEvents(events, 1000)
    expect(byModel.has('old-model')).toBe(false)
    expect(byModel.get('new-model')?.totalTokens).toBe(10)
  })

  it('не считает error-прогон успешным', () => {
    const events: AgentTraceEvent[] = [
      ev('run_start', 1000, { model: 'gemini-2.5-flash' }),
      ev('run_end', 2000, { durationMs: 100, status: 'error' })
    ]

    const row = aggregateTraceEvents(events, 0).byModel.get('gemini-2.5-flash')
    expect(row?.runs).toBe(1)
    expect(row?.successRuns).toBe(0)
  })
})
