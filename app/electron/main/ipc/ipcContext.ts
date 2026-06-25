import type { BrowserWindow } from 'electron'
import type { AgentSettings, AgentStreamPayload } from '../../../src/types'

export interface IpcContext {
  getWindow: () => BrowserWindow | null
  stream: (chatId: string, event: AgentStreamPayload) => void
  agentRunStates: Map<string, { chatId: string }>
  activeAgentAborts: Map<string, AbortController>
  pendingConfirms: Map<string, (approved: boolean) => void>
  pendingPreviews: Map<string, (apply: boolean) => void>
  pendingHunkSelections: Map<string, number[]>
  syncTrayAgentBadge: () => void
  applyTraySettings: (settings: AgentSettings) => void
  recordRun: () => void
}
