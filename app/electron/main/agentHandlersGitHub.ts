import type { ToolHandlers } from './agentTools'
import { createIssue, createPr, listIssues, openIssue, triggerGithubWorkflow } from './githubTools'
import { getGitHubAuthStatus, formatGitHubAuthStatus } from './githubAuth'
import { formatPullRequestListResult, listPullRequests } from './githubPr'

export function createGitHubToolHandlers(): Partial<ToolHandlers> {
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
    }
  }
  return handlers
}
