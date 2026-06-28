export interface TraceEvent {
  ts: number
  kind:
    | 'run_start'
    | 'llm_request'
    | 'llm_response'
    | 'tool_call'
    | 'tool_result'
    | 'context_compress'
    | 'nudge'
    | 'run_end'
  label: string
  data: Record<string, unknown>
}

export type TraceReportSource = 'agent-auto' | 'agent-tool' | 'user-ui'

export interface TraceReportMeta {
  chatId: string
  projectPath?: string
  appVersion?: string
  reporterLogin?: string
  userNote?: string
  /** agent-auto — после ошибки прогона; agent-tool — инструмент; user-ui — кнопка в панели */
  reportSource?: TraceReportSource
}

export interface TraceIssueDraft {
  title: string
  body: string
  gistJson: string
  gistDescription: string
}

interface TraceError {
  step?: number
  tool?: string
  kind: string
  message: string
}

interface TraceSummary {
  status: 'ok' | 'error' | 'aborted' | 'unknown'
  userMessage: string
  model: string
  provider: string
  durationMs: number | null
  stepCount: number
  toolsUsed: string[]
  nudgeCount: number
  contextCompressCount: number
  maxContextUsagePercent: number | null
  errors: TraceError[]
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function isFailedTraceEvent(ev: TraceEvent): boolean {
  if (ev.data.ok === false) return true
  if (ev.data.status === 'error' || ev.data.status === 'aborted') return true
  const error = asString(ev.data.error)
  return Boolean(error)
}

function summarizeTrace(events: TraceEvent[]): TraceSummary {
  const runStart = events.find((ev) => ev.kind === 'run_start')
  const runEnd = [...events].reverse().find((ev) => ev.kind === 'run_end')
  const toolsUsed = new Set<string>()
  const errors: TraceError[] = []
  let stepCount = 0
  let nudgeCount = 0
  let contextCompressCount = 0
  let maxContextUsagePercent: number | null = null

  for (const ev of events) {
    if (ev.kind === 'llm_request') {
      const step = asNumber(ev.data.step)
      if (step != null) stepCount = Math.max(stepCount, step)
      const usage = asNumber(ev.data.usagePercent)
      if (usage != null) {
        maxContextUsagePercent =
          maxContextUsagePercent == null ? usage : Math.max(maxContextUsagePercent, usage)
      }
    }
    if (ev.kind === 'context_compress') {
      contextCompressCount++
      const after = ev.data.after as Record<string, unknown> | undefined
      const afterUsage = asNumber(after?.usagePercent)
      if (afterUsage != null) {
        maxContextUsagePercent =
          maxContextUsagePercent == null ? afterUsage : Math.max(maxContextUsagePercent, afterUsage)
      }
    }
    if (ev.kind === 'nudge') nudgeCount++
    if (ev.kind === 'tool_call') {
      const tool = asString(ev.data.tool)
      if (tool) toolsUsed.add(tool)
    }
    if (!isFailedTraceEvent(ev)) continue

    const step = asNumber(ev.data.step)
    const tool = asString(ev.data.tool)
    const error =
      asString(ev.data.error) ??
      (ev.data.status === 'aborted' ? 'Прогон остановлен пользователем' : undefined) ??
      ev.label

    errors.push({
      step,
      tool,
      kind: ev.kind,
      message: truncate(error, 500)
    })
  }

  const endStatus = asString(runEnd?.data.status)
  const status: TraceSummary['status'] =
    endStatus === 'ok' || endStatus === 'error' || endStatus === 'aborted' ? endStatus : 'unknown'

  return {
    status: errors.length > 0 && status === 'unknown' ? 'error' : status,
    userMessage: asString(runStart?.data.message) ?? '',
    model: asString(runStart?.data.model) ?? '—',
    provider: asString(runStart?.data.provider) ?? '—',
    durationMs: asNumber(runEnd?.data.durationMs) ?? null,
    stepCount,
    toolsUsed: [...toolsUsed],
    nudgeCount,
    contextCompressCount,
    maxContextUsagePercent,
    errors
  }
}

function buildTitle(summary: TraceSummary): string {
  const prefix = '[CodeViper Agent]'
  if (summary.errors.length > 0) {
    const first = summary.errors[0]
    const where =
      first.tool != null
        ? `${first.tool}${first.step != null ? ` (шаг ${first.step})` : ''}`
        : first.kind
    return truncate(`${prefix} Не удалось: ${where}`, 120)
  }
  if (summary.status === 'aborted') {
    return truncate(`${prefix} Прогон прерван`, 120)
  }
  if (summary.userMessage) {
    return truncate(`${prefix} ${summary.userMessage}`, 120)
  }
  return `${prefix} Отчёт о прогоне`
}

function formatDuration(durationMs: number | null): string {
  if (durationMs == null) return '—'
  if (durationMs < 1000) return `${durationMs} мс`
  return `${(durationMs / 1000).toFixed(1)} с`
}

function buildTimeline(events: TraceEvent[]): string[] {
  const significant = events.filter(
    (ev) =>
      ev.kind === 'run_start' ||
      ev.kind === 'run_end' ||
      ev.kind === 'tool_call' ||
      ev.kind === 'context_compress' ||
      ev.kind === 'nudge' ||
      (ev.kind === 'tool_result' && isFailedTraceEvent(ev)) ||
      (ev.kind === 'llm_response' && isFailedTraceEvent(ev))
  )
  const tail = significant.slice(-20)
  return tail.map((ev) => `- \`${new Date(ev.ts).toISOString()}\` **${ev.kind}** — ${ev.label}`)
}

function buildAutoDescription(summary: TraceSummary): string {
  const lines: string[] = []
  if (summary.errors.length > 0) {
    lines.push(
      `Я завершил прогон с ${summary.errors.length} ошибкой(ами) после ${summary.stepCount || '—'} шаг(ов) LLM.`
    )
    const first = summary.errors[0]
    lines.push(`Первая ошибка: ${first.message}`)
  } else if (summary.status === 'aborted') {
    lines.push('Мой прогон был прерван до завершения.')
  } else if (summary.status === 'ok') {
    lines.push('Прогон завершился без явных ошибок в трейсе; отправляю отчёт для анализа.')
  } else {
    lines.push('Отправляю автоматический отчёт по своему трейсу.')
  }
  if (summary.toolsUsed.length > 0) {
    lines.push(`Использовал инструменты: ${summary.toolsUsed.join(', ')}.`)
  }
  return lines.join(' ')
}

function reportSourceFooter(source: TraceReportMeta['reportSource']): string {
  if (source === 'agent-auto') {
    return '_Issue создан агентом CodeViper автоматически после ошибки прогона._'
  }
  if (source === 'agent-tool') {
    return '_Issue создан агентом CodeViper по запросу через инструмент report_trace_to_github._'
  }
  if (source === 'user-ui') {
    return '_Issue создан по кнопке «На GitHub»; текст сформирован агентом из трейса._'
  }
  return '_Отчёт сформирован агентом CodeViper из трейса прогона._'
}

export function buildTraceIssueReport(
  events: TraceEvent[],
  meta: TraceReportMeta
): TraceIssueDraft {
  const summary = summarizeTrace(events)
  const title = buildTitle(summary)
  const gistPayload = {
    chatId: meta.chatId,
    ...(meta.projectPath?.trim() ? { projectPath: meta.projectPath.trim() } : {}),
    exportedAt: Date.now(),
    appVersion: meta.appVersion,
    reporterLogin: meta.reporterLogin,
    events
  }

  const bodyParts = [
    '<!-- trace-report -->',
    '## Отчёт агента',
    buildAutoDescription(summary),
    '',
    '## Задача пользователя',
    summary.userMessage
      ? `\`\`\`\n${summary.userMessage.slice(0, 4000)}\n\`\`\``
      : '_Не найден в трейсе (run_start)_',
    '',
    '## Окружение',
    `- Версия CodeViper: ${meta.appVersion ?? '—'}`,
    `- Модель: \`${summary.model}\` (${summary.provider})`,
    `- Длительность: ${formatDuration(summary.durationMs)}`,
    `- Шагов LLM: ${summary.stepCount || '—'}`,
    ...(summary.maxContextUsagePercent != null
      ? [`- Пик заполнения контекста: ${summary.maxContextUsagePercent}%`]
      : []),
    ...(summary.nudgeCount > 0 ? [`- Nudge-сообщений агента: ${summary.nudgeCount}`] : []),
    ...(summary.contextCompressCount > 0
      ? [`- Сжатий контекста: ${summary.contextCompressCount}`]
      : []),
    `- Chat ID: \`${meta.chatId}\``,
    ...(meta.projectPath?.trim() ? [`- Проект: \`${meta.projectPath.trim()}\``] : []),
    ...(meta.reporterLogin ? [`- GitHub (gh): @${meta.reporterLogin}`] : [])
  ]

  if (meta.userNote?.trim()) {
    bodyParts.push('', '## Комментарий пользователя', meta.userNote.trim())
  }

  if (summary.errors.length > 0) {
    bodyParts.push('', '## Ошибки')
    for (const err of summary.errors.slice(0, 10)) {
      const where =
        err.tool != null
          ? `\`${err.tool}\`${err.step != null ? `, шаг ${err.step}` : ''}`
          : err.kind
      bodyParts.push(`- **${where}**: ${err.message}`)
    }
    if (summary.errors.length > 10) {
      bodyParts.push(`- _…и ещё ${summary.errors.length - 10}_`)
    }
  }

  const timeline = buildTimeline(events)
  if (timeline.length > 0) {
    bodyParts.push('', '## Краткая хронология', ...timeline)
  }

  bodyParts.push('', '## Полный трейс', '_Ссылка на JSON будет добавлена после загрузки gist._')
  bodyParts.push('', reportSourceFooter(meta.reportSource))

  return {
    title,
    body: bodyParts.join('\n'),
    gistJson: JSON.stringify(gistPayload, null, 2),
    gistDescription: `CodeViper agent trace — ${meta.chatId}`
  }
}
