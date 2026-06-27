import { describe, it, expect } from 'vitest'
import { buildTraceIssueReport, type TraceEvent } from '../shared/traceReport'

const baseEvents: TraceEvent[] = [
  {
    ts: 1000,
    kind: 'run_start',
    label: '▶ Старт',
    data: {
      model: 'gpt-4o',
      provider: 'openai',
      message: 'Исправь баг в TracePanel'
    }
  },
  {
    ts: 1100,
    kind: 'tool_call',
    label: '⚙ read_file (шаг 1)',
    data: { step: 1, tool: 'read_file', args: { path: 'app/src/TracePanel.tsx' } }
  },
  {
    ts: 1200,
    kind: 'tool_result',
    label: '✖ read_file — ошибка',
    data: { step: 1, tool: 'read_file', ok: false, error: 'Ошибка: файл не найден', durationMs: 12 }
  },
  {
    ts: 1300,
    kind: 'run_end',
    label: '■ Ошибка за 300ms',
    data: { durationMs: 300, status: 'error' }
  }
]

describe('buildTraceIssueReport', () => {
  it('формирует заголовок и тело с автоописанием ошибки', () => {
    const draft = buildTraceIssueReport(baseEvents, {
      chatId: 'chat-abc',
      projectPath: 'F:/proj',
      appVersion: '0.3.7',
      reporterLogin: 'tester'
    })

    expect(draft.title).toContain('[CodeViper Agent]')
    expect(draft.title).toContain('read_file')
    expect(draft.body).toContain('<!-- trace-report -->')
    expect(draft.body).toContain('## Отчёт агента')
    expect(draft.body).toContain('Я завершил прогон')
    expect(draft.body).toContain('Исправь баг в TracePanel')
    expect(draft.body).toContain('Ошибка: файл не найден')
    expect(draft.body).toContain('0.3.7')
    expect(draft.body).toContain('@tester')
    expect(draft.body).toContain('сформирован агентом')
    expect(draft.gistJson).toContain('"chatId": "chat-abc"')
    expect(draft.gistDescription).toContain('chat-abc')
  })

  it('добавляет комментарий пользователя', () => {
    const draft = buildTraceIssueReport(baseEvents, {
      chatId: 'chat-1',
      userNote: 'Повторяется каждый раз после обновления'
    })
    expect(draft.body).toContain('## Комментарий пользователя')
    expect(draft.body).toContain('Повторяется каждый раз после обновления')
  })
})
