import { app } from 'electron'
import type { AgentTraceEvent } from '../../src/types'
import { CODEVIPER_GITHUB_OWNER, CODEVIPER_GITHUB_REPO } from '../../shared/constants'
import { buildTraceIssueReport, type TraceReportSource } from '../../shared/traceReport'
import { createGistViaGh, createIssueViaGh, getGhLogin } from './githubTools'

export interface ReportTraceResult {
  ok: boolean
  issueUrl?: string
  gistUrl?: string
  title?: string
  error?: string
}

const TRACE_REPO = `${CODEVIPER_GITHUB_OWNER}/${CODEVIPER_GITHUB_REPO}`

function appendGistLink(body: string, gistUrl: string): string {
  return body.replace(
    '_Ссылка на JSON будет добавлена после загрузки gist._',
    `[Скачать JSON трейса](${gistUrl})`
  )
}

function isLabelError(error: string): boolean {
  const lower = error.toLowerCase()
  return lower.includes('label') || lower.includes('422')
}

export async function reportAgentTraceToGithub(
  chatId: string,
  events: AgentTraceEvent[],
  projectPath?: string,
  userNote?: string,
  reportSource: TraceReportSource = 'user-ui'
): Promise<ReportTraceResult> {
  if (!chatId.trim()) {
    return { ok: false, error: 'Чат не выбран' }
  }
  if (events.length === 0) {
    return { ok: false, error: 'Трейс пуст — нечего отправлять' }
  }

  let appVersion: string | undefined
  try {
    appVersion = app.getVersion()
  } catch {
    /* тесты без electron app */
  }

  const reporterLogin = await getGhLogin()
  const draft = buildTraceIssueReport(events, {
    chatId,
    projectPath,
    appVersion,
    reporterLogin,
    userNote,
    reportSource
  })

  try {
    const gist = await createGistViaGh(
      { [`trace-${Date.now()}.json`]: draft.gistJson },
      draft.gistDescription
    )
    if (!gist.ok) {
      return { ok: false, error: gist.error ?? 'Не удалось создать gist', title: draft.title }
    }

    const body = appendGistLink(draft.body, gist.url!)

    let issue = await createIssueViaGh(draft.title, body, {
      repo: TRACE_REPO,
      labels: ['trace-report']
    })
    if (!issue.ok && issue.error && isLabelError(issue.error)) {
      issue = await createIssueViaGh(draft.title, body, { repo: TRACE_REPO })
    }
    if (!issue.ok) {
      return {
        ok: false,
        error: issue.error ?? 'Не удалось создать issue',
        gistUrl: gist.url,
        title: draft.title
      }
    }

    return {
      ok: true,
      issueUrl: issue.url,
      gistUrl: gist.url,
      title: draft.title
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message, title: draft.title }
  }
}
