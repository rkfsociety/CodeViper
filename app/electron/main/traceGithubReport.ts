import { app } from 'electron'
import type { AgentTraceEvent } from '../../src/types'
import { buildTraceIssueReport } from '../../shared/traceReport'
import { createGitHubIssue, getGitHubAuthStatus, resolveGitHubToken } from './githubAuth'
import { createGist } from './gist'

export interface ReportTraceResult {
  ok: boolean
  issueUrl?: string
  gistUrl?: string
  title?: string
  error?: string
}

function appendGistLink(body: string, gistUrl: string): string {
  return body.replace(
    '_Ссылка на JSON будет добавлена после загрузки gist._',
    `[Скачать JSON трейса](${gistUrl})`
  )
}

export async function reportAgentTraceToGithub(
  chatId: string,
  events: AgentTraceEvent[],
  projectPath?: string,
  userNote?: string
): Promise<ReportTraceResult> {
  if (!chatId.trim()) {
    return { ok: false, error: 'Чат не выбран' }
  }
  if (events.length === 0) {
    return { ok: false, error: 'Трейс пуст — нечего отправлять' }
  }

  const token = await resolveGitHubToken()
  if (!token) {
    const status = await getGitHubAuthStatus()
    const hint = status.hints[0] ?? 'Настройте GitHub Token или выполните gh auth login'
    return { ok: false, error: `Нет авторизации GitHub. ${hint}` }
  }

  const auth = await getGitHubAuthStatus()
  let appVersion: string | undefined
  try {
    appVersion = app.getVersion()
  } catch {
    /* тесты без electron app */
  }

  const draft = buildTraceIssueReport(events, {
    chatId,
    projectPath,
    appVersion,
    reporterLogin: auth.login,
    userNote
  })

  try {
    const gistUrl = await createGist(
      token,
      { [`trace-${Date.now()}.json`]: draft.gistJson },
      draft.gistDescription
    )
    const body = appendGistLink(draft.body, gistUrl)

    let issue = await createGitHubIssue(token, draft.title, body, ['trace-report'])
    if (!issue.ok && issue.error.includes('422')) {
      // Метка может отсутствовать в форке — повтор без labels (см. scripts/ensure-github-labels.mjs)
      issue = await createGitHubIssue(token, draft.title, body)
    }
    if (!issue.ok) {
      return { ok: false, error: issue.error, gistUrl, title: draft.title }
    }

    return {
      ok: true,
      issueUrl: issue.url,
      gistUrl,
      title: draft.title
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message, title: draft.title }
  }
}
