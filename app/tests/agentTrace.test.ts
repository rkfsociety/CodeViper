import { describe, it, expect } from 'vitest'
import type { OllamaMessage } from '../electron/main/agentContext'
import {
  buildToolResultTraceData,
  buildRunEndTraceData,
  buildRunStartTraceData,
  buildLlmRequestTraceData,
  buildLlmResponseTraceData,
  buildContextCompressTraceData,
  buildNudgeTraceData,
  buildMessageContextStats,
  isToolOutputError,
  isToolResultOk
} from '../electron/main/agentTrace'

describe('agentTrace helpers', () => {
  it('isToolOutputError распознаёт префиксы ошибок', () => {
    expect(isToolOutputError('Ошибка: файл не найден')).toBe(true)
    expect(isToolOutputError('⛔ Действие отклонено пользователем')).toBe(true)
    expect(isToolOutputError('Укажите id пункта из set_self_improvement_plan')).toBe(true)
    expect(isToolOutputError('Не указан параметр query')).toBe(true)
    expect(isToolOutputError('ok')).toBe(false)
  })

  it('isToolResultOk учитывает throw и текст ошибки', () => {
    expect(isToolResultOk(true, 'Ошибка: boom')).toBe(false)
    expect(isToolResultOk(false, 'Ошибка: handler')).toBe(false)
    expect(isToolResultOk(false, 'готово')).toBe(true)
  })

  it('buildToolResultTraceData помечает ошибку в data.error', () => {
    const { label, data } = buildToolResultTraceData(1, 'read_file', 'Ошибка: ENOENT', true, 12)
    expect(label).toContain('ошибка')
    expect(data.ok).toBe(false)
    expect(data.error).toBe('Ошибка: ENOENT')
  })

  it('buildToolResultTraceData для успеха пишет preview и exitCode', () => {
    const { data } = buildToolResultTraceData(
      2,
      'run_codeviper_command',
      'exit: 1\nstdout:\nfail',
      false,
      5
    )
    expect(data.ok).toBe(true)
    expect(data.preview).toContain('exit: 1')
    expect(data.exitCode).toBe(1)
  })

  it('buildRunEndTraceData включает status и error', () => {
    const { label, data } = buildRunEndTraceData(1000, 'error', {
      error: 'timeout',
      steps: 3
    })
    expect(label).toContain('Ошибка')
    expect(data.status).toBe('error')
    expect(data.error).toBe('timeout')
    expect(data.steps).toBe(3)
  })

  it('buildRunStartTraceData включает taskMode и settings', () => {
    const { data } = buildRunStartTraceData({
      model: 'qwen2.5-coder:7b',
      provider: 'ollama',
      message: 'task',
      taskMode: 'self-improve',
      settings: { contextSummarizeThreshold: 85 }
    })
    expect(data.taskMode).toBe('self-improve')
    expect(data.settings).toEqual({ contextSummarizeThreshold: 85 })
  })

  it('buildLlmRequestTraceData считает usagePercent и roles', () => {
    const messages: OllamaMessage[] = [
      { role: 'system', content: 'x'.repeat(1000) },
      { role: 'user', content: 'task' },
      { role: 'tool', content: 'Инструмент read_file:\nbody' }
    ]
    const { data, label } = buildLlmRequestTraceData({
      step: 1,
      messages,
      model: 'qwen2.5-coder:7b',
      toolsJsonChars: 5000
    })
    expect(data.step).toBe(1)
    expect(data.roles).toEqual({ system: 1, user: 1, tool: 1 })
    expect(data.toolMessages).toBe(1)
    expect(typeof data.usagePercent).toBe('number')
    expect(label).toContain('tok')
  })

  it('buildLlmResponseTraceData помечает пустой ответ', () => {
    const { data } = buildLlmResponseTraceData({
      step: 2,
      durationMs: 100,
      tokens: 8000,
      text: '',
      toolCalls: []
    })
    expect(data.emptyResponse).toBe(true)
  })

  it('buildContextCompressTraceData описывает truncate', () => {
    const before = buildMessageContextStats(
      [{ role: 'user', content: 'a'.repeat(10_000) }],
      'qwen2.5-coder:7b',
      20_000
    )
    const after = buildMessageContextStats(
      [{ role: 'user', content: 'short' }],
      'qwen2.5-coder:7b',
      20_000
    )
    const { label, data } = buildContextCompressTraceData({
      step: 3,
      durationMs: 12,
      before,
      after,
      summarized: false,
      truncated: true,
      droppedMessageCount: 2,
      attempted: true
    })
    expect(label).toContain('Сжатие')
    expect(data.method).toBe('truncate')
    expect(data.deltaChars).toBeGreaterThan(0)
  })

  it('buildNudgeTraceData сохраняет source и preview', () => {
    const { data } = buildNudgeTraceData(5, 'loop_guard', 'повтор read_file')
    expect(data.source).toBe('loop_guard')
    expect(data.preview).toBe('повтор read_file')
  })
})
