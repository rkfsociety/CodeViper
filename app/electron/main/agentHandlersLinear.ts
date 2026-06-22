import type { AgentSettings } from '../../src/types'
import type { ToolHandlers } from './agentTools'
import { createLinearIssue } from './linearTools'

export function createLinearToolHandlers(settings: AgentSettings): Partial<ToolHandlers> {
  const { linearApiKey } = settings
  const handlers: Partial<ToolHandlers> = {
    create_linear_issue: async (args: any) => {
      return createLinearIssue(
        args.title,
        args.team_key,
        linearApiKey,
        args.description,
        args.priority
      )
    }
  }
  return handlers
}
