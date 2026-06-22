import type { AgentSettings } from '../../src/types'
import type { ToolHandlers } from './agentTools'
import { listGitlabMrs, createGitlabMr, getGitlabPipeline } from './gitlabTools'

export function createGitLabToolHandlers(
  projectPath: string,
  settings: AgentSettings
): Partial<ToolHandlers> {
  const { gitlabToken, gitlabUrl } = settings
  const handlers: Partial<ToolHandlers> = {
    list_gitlab_mrs: async () => {
      return listGitlabMrs(projectPath, gitlabToken, gitlabUrl)
    },

    create_gitlab_mr: async (args: any) => {
      return createGitlabMr(
        projectPath,
        gitlabToken,
        gitlabUrl,
        args.source_branch,
        args.target_branch,
        args.title,
        args.description
      )
    },

    get_gitlab_pipeline: async (args: any) => {
      return getGitlabPipeline(projectPath, gitlabToken, gitlabUrl, args.pipeline_id)
    }
  }
  return handlers
}
