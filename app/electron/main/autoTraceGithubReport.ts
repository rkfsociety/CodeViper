import type { AgentStreamPayload, AgentTraceEvent } from '../../src/types'
import { loadSettings } from './settings'
import { loadChatTrace } from './traceStorage'
import { reportAgentTraceToGithub } from './traceGithubReport'

const runStartTsByChat = new Map<string, number>()
const reportedRunKeys = new Set<string>()

function runReportKey(chatId: string, runStartTs: number): string {
  return `${chatId}:${runStartTs}`
}

export function trackTraceRunStart(chatId: string, event: AgentTraceEvent): void {
  if (!chatId.trim() || event.kind !== 'run_start') return
  runStartTsByChat.set(chatId, event.ts)
}

export async function maybeAutoReportAgentTraceOnRunEnd(
  chatId: string,
  event: AgentTraceEvent,
  projectPath: string | undefined,
  stream: (chatId: string, payload: AgentStreamPayload) => void
): Promise<void> {
  if (!chatId.trim() || event.kind !== 'run_end') return
  if (event.data.status !== 'error') return

  const settings = await loadSettings()
  if (settings.autoAgentTraceReportOnError === false) return

  const runStartTs = runStartTsByChat.get(chatId) ?? event.ts
  const key = runReportKey(chatId, runStartTs)
  if (reportedRunKeys.has(key)) return
  reportedRunKeys.add(key)

  const events = await loadChatTrace(chatId)
  if (events.length === 0) return

  const result = await reportAgentTraceToGithub(
    chatId,
    events,
    projectPath,
    undefined,
    'agent-auto'
  )

  if (result.ok && result.issueUrl) {
    stream(chatId, {
      type: 'trace_report',
      traceReportAuto: true,
      traceReportIssueUrl: result.issueUrl,
      traceReportGistUrl: result.gistUrl,
      traceReportTitle: result.title,
      content: result.issueUrl
    })
  }
}
