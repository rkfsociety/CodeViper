import type { AgentSettings } from '../../src/types'
import type { ToolHandlers } from './agentTools'
import { createJiraIssue } from './jiraTools'

export function createJiraToolHandlers(settings: AgentSettings): Partial<ToolHandlers> {
  const { jiraUrl, jiraToken } = settings
  const handlers: Partial<ToolHandlers> = {
    create_jira_issue: async (args) => {
      return createJiraIssue(
        args.summary,
        args.project_key,
        jiraUrl,
        jiraToken,
        args.description,
        args.issue_type
      )
    }
  }
  return handlers
}
