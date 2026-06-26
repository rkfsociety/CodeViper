import { describe, it, expect } from 'vitest'
import {
  buildToolResultTraceData,
  buildRunEndTraceData,
  isToolOutputError,
  isToolResultOk
} from '../electron/main/agentTrace'

describe('agentTrace helpers', () => {
  it('isToolOutputError распознаёт префиксы ошибок', () => {
    expect(isToolOutputError('Ошибка: файл не найден')).toBe(true)
    expect(isToolOutputError('⛔ Действие отклонено пользователем')).toBe(true)
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

  it('buildToolResultTraceData для успеха пишет preview', () => {
    const { data } = buildToolResultTraceData(2, 'grep_files', 'match', false, 5)
    expect(data.ok).toBe(true)
    expect(data.preview).toBe('match')
    expect(data.error).toBeUndefined()
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
})
