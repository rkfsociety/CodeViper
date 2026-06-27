import type { AgentStreamPayload } from '../../src/types'
import type { ToolHandlers } from './agentTools'
import { createIssue, createPr, listIssues, openIssue, triggerGithubWorkflow } from './githubTools'
import { getGitHubAuthStatus, formatGitHubAuthStatus } from './githubAuth'
import { formatPullRequestListResult, listPullRequests } from './githubPr'
import { loadChatTrace } from './traceStorage'
import { reportAgentTraceToGithub } from './traceGithubReport'

export interface GitHubToolHandlerContext {
  projectPath: string
  chatId?: string
  emit?: (event: AgentStreamPayload) => void
}

export function createGitHubToolHandlers(ctx?: GitHubToolHandlerContext): Partial<ToolHandlers> {
  const handlers: Partial<ToolHandlers> = {
    check_github_auth: async () => {
      const status = await getGitHubAuthStatus()
      return formatGitHubAuthStatus(status)
    },

    create_issue: async (args) => {
      return createIssue(args.title, args.body, args.labels)
    },

    create_pr: async (args) => {
      return createPr(args.title, args.body)
    },

    list_issues: async () => {
      return listIssues()
    },

    list_pull_requests: async () => {
      const result = await listPullRequests()
      return formatPullRequestListResult(result)
    },

    open_issue: async (args) => {
      return openIssue(args.number)
    },

    trigger_github_workflow: async (args) => {
      return triggerGithubWorkflow(args.workflow_id, args.ref, args.fields)
    },

    report_trace_to_github: async (args: { note?: string }) => {
      if (!ctx?.chatId?.trim()) {
        return 'Ошибка: идентификатор чата недоступен — отчёт можно отправить только во время прогона агента.'
      }

      const events = await loadChatTrace(ctx.chatId)
      if (events.length === 0) {
        return 'Трейс пуст — нечего отправлять на GitHub.'
      }

      const result = await reportAgentTraceToGithub(
        ctx.chatId,
        events,
        ctx.projectPath,
        args.note,
        'agent-tool'
      )

      if (!result.ok) {
        return result.error ?? 'Не удалось создать GitHub Issue'
      }

      ctx.emit?.({
        type: 'trace_report',
        traceReportAuto: false,
        traceReportIssueUrl: result.issueUrl,
        traceReportGistUrl: result.gistUrl,
        traceReportTitle: result.title,
        content: result.issueUrl
      })

      const lines = [`Issue: ${result.issueUrl}`]
      if (result.gistUrl) lines.push(`Gist: ${result.gistUrl}`)
      if (result.title) lines.push(`Заголовок: ${result.title}`)
      return lines.join('\n')
    }
  }
  return handlers
}
