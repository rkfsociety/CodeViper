import type { AgentStreamPayload, AgentTraceEvent } from '../../src/types'

export function emitAgentTrace(
  emit: (event: AgentStreamPayload) => void,
  kind: AgentTraceEvent['kind'],
  label: string,
  data: Record<string, unknown>
): void {
  emit({ type: 'trace', traceEvent: { ts: Date.now(), kind, label, data } })
}

const TOOL_VALIDATION_ERROR_PREFIXES = [
  'Укажите ',
  'Не указан параметр ',
  'Неизвестный инструмент:',
  'План не задан.'
] as const

export function isToolOutputError(output: string): boolean {
  if (output.startsWith('Ошибка:') || output.startsWith('⛔')) return true
  return TOOL_VALIDATION_ERROR_PREFIXES.some((prefix) => output.startsWith(prefix))
}

export function isToolResultOk(threw: boolean, output: string): boolean {
  return !threw && !isToolOutputError(output)
}

export function buildToolCallTraceData(
  step: number,
  tool: string,
  args: Record<string, string>
): { label: string; data: Record<string, unknown> } {
  return {
    label: `⚙ ${tool} (шаг ${step})`,
    data: { step, tool, args }
  }
}

export function buildToolResultTraceData(
  step: number,
  tool: string,
  output: string,
  threw: boolean,
  durationMs: number
): { label: string; data: Record<string, unknown> } {
  const failed = !isToolResultOk(threw, output)
  const label = failed
    ? `✖ ${tool} — ошибка (${durationMs}ms)`
    : `✓ ${tool} (${durationMs}ms, ${output.length} симв.)`
  const data: Record<string, unknown> = {
    step,
    tool,
    ok: !failed,
    durationMs
  }
  if (failed) {
    data.error = output.slice(0, 1000)
  } else {
    data.outputLen = output.length
    if (output.length > 0) data.preview = output.slice(0, 200)
  }
  return { label, data }
}

export function buildRunEndTraceData(
  durationMs: number,
  status: 'ok' | 'error' | 'aborted',
  extra: Record<string, unknown> = {}
): { label: string; data: Record<string, unknown> } {
  const statusLabel =
    status === 'ok' ? '■ Завершено' : status === 'aborted' ? '■ Остановлено' : '■ Ошибка'
  return {
    label: `${statusLabel} за ${durationMs}ms`,
    data: { durationMs, status, ...extra }
  }
}
