/**
 * Entry для live runtime (блок 0): отдельный chunk `out/main/runtimeHandlers.js`
 * для dynamic import из клона без перезагрузки всего main process bundle.
 */
import { registerLiveRuntimeTraceIpc } from './ipc/registerLiveRuntimeTraceIpc'
import { registerLiveRuntimeGithubTraceIpc } from './ipc/registerLiveRuntimeGithubTraceIpc'
import { registerLiveRuntimeUiLayoutIpc } from './ipc/registerLiveRuntimeUiLayoutIpc'
import { installLiveShellRendererReload } from './liveShellBootstrap'

let liveShellExtrasInstalled = false

/** Вызывается из index.ts после register*Ipc (и при dynamic import runtimeHandlers из git-клона). */
export function ensureLiveRuntimeExtras(): void {
  if (liveShellExtrasInstalled) return
  liveShellExtrasInstalled = true
  registerLiveRuntimeTraceIpc()
  registerLiveRuntimeGithubTraceIpc()
  registerLiveRuntimeUiLayoutIpc()
  installLiveShellRendererReload()
}

export { createProjectToolHandlers, type ProjectToolOptions } from './agentHandlersProject'
export { createGitHubToolHandlers } from './agentHandlersGitHub'
export { createGitLabToolHandlers } from './agentHandlersGitLab'
export { createJiraToolHandlers } from './agentHandlersJira'
export { createLinearToolHandlers } from './agentHandlersLinear'
export { createCodeViperToolHandlers } from './agentHandlersCodeViper'
export { createMemoryToolHandlers } from './agentHandlersMemory'
export { createSkillsToolHandlers } from './agentHandlersSkills'
export { createSelfImprovementToolHandlers } from './agentHandlersSelfImprovement'
export { createModelToolHandlers } from './agentHandlersModels'
export { createTodoToolHandlers } from './agentHandlersTodo'
export { createWebToolHandlers } from './agentHandlersWeb'
export { createMcpToolHandlers } from './mcpTools'
export type { ToolHandlers } from './agentTools'
export { commitAndPushSelfEdits, stageSelfEditsForRestart } from './selfCommit'
