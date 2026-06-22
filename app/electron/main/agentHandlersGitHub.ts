import type { ToolHandlers } from './agentTools'
import { createIssue, createPr, listIssues, openIssue, triggerGithubWorkflow } from './githubTools'

export function createGitHubToolHandlers(): Partial<ToolHandlers> {
  // @ts-expect-error TS parameter type mismatch
  const handlers: Partial<ToolHandlers> = {
    create_issue: async (args: any) => {
      return createIssue(args.title, args.body, args.labels)
    },

    create_pr: async (args: any) => {
      return createPr(args.title, args.body)
    },

    list_issues: async () => {
      return listIssues()
    },

    open_issue: async (args: any) => {
      return openIssue(args.number)
    },

    trigger_github_workflow: async (args: any) => {
      return triggerGithubWorkflow(args.workflow_id, args.ref, args.fields)
    }
  }
  return handlers
}
