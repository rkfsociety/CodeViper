import type { ToolHandlers } from './agentTools'
import { createIssue, createPr, listIssues, openIssue, triggerGithubWorkflow } from './githubTools'

export function createGitHubToolHandlers(): Partial<ToolHandlers> {
  return {
    create_issue: async (args) => {
      return createIssue(args.title, args.body, args.labels)
    },

    create_pr: async (args) => {
      return createPr(args.title, args.body)
    },

    list_issues: async () => {
      return listIssues()
    },

    open_issue: async (args) => {
      return openIssue(args.number)
    },

    trigger_github_workflow: async (args) => {
      return triggerGithubWorkflow(args.workflow_id, args.ref, args.fields)
    }
  }
}
