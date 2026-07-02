/**
 * Entry для live runtime (блок 0): отдельный chunk `out/main/runtimeHandlers.js`
 * для dynamic import из клона без перезагрузки всего main process bundle.
 */
import { registerLiveRuntimeTraceIpc } from './ipc/registerLiveRuntimeTraceIpc'
import { registerLiveRuntimeGithubTraceIpc } from './ipc/registerLiveRuntimeGithubTraceIpc'
import { registerLiveRuntimeUiLayoutIpc } from './ipc/registerLiveRuntimeUiLayoutIpc'
import { installLiveShellRendererReload } from './liveShellBootstrap'
import type { BundledSourceBuildResult, BundledSourceSyncResult } from './bundledSourceBuild'

let liveShellExtrasInstalled = false

/** Вызывается из index.ts после register*Ipc (и при dynamic import runtimeHandlers из git-клона). */
export function ensureLiveRuntimeExtras(): void {
  if (liveShellExtrasInstalled) return
  liveShellExtrasInstalled = true
  registerLiveRuntimeTraceIpc()
  registerLiveRuntimeGithubTraceIpc()
  registerLiveRuntimeUiLayoutIpc()
  installLiveShellRendererReload()
  void (async () => {
    const { getRuntimeBuildHead } = await import('./bundledSourceBuild')
    const head = getRuntimeBuildHead()
    if (!head) return
    const { recordRuntimeAppliedHead } = await import('./runtimeUpdateState')
    await recordRuntimeAppliedHead(head)
  })()
}

/** Публичный экспорт для live runtime (clone out/main/runtimeHandlers.js). */
export async function maybeBuildBundledSourceAfterSync(
  syncResult: BundledSourceSyncResult,
  options?: { force?: boolean }
): Promise<BundledSourceBuildResult | null> {
  const mod = await import('./bundledSourceBuild')
  return mod.maybeBuildBundledSourceAfterSync(syncResult, options)
}

export { createProjectToolHandlers, type ProjectToolOptions } from './agentHandlersProject'
export { createGitHubToolHandlers } from './agentHandlersGitHub'
export { createGitLabToolHandlers } from './agentHandlersGitLab'
export { createJiraToolHandlers } from './agentHandlersJira'
export { createLinearToolHandlers } from './agentHandlersLinear'
export { createMemoryToolHandlers } from './agentHandlersMemory'
export { createSkillsToolHandlers } from './agentHandlersSkills'
export { createTodoToolHandlers } from './agentHandlersTodo'
export { createWebToolHandlers } from './agentHandlersWeb'
export { createMcpToolHandlers } from './mcpTools'
export type { ToolHandlers } from './agentTools'
