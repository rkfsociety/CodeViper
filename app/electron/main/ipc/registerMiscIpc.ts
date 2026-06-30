import { ipcMain } from 'electron'
import { IPC, parseIpcArgs, Contracts } from '../../../shared/ipcContracts'
import {
  registerNode,
  fetchP2pCreditsBalance,
  getP2pWssConnectionState,
  isP2pWssOffline,
  syncP2pWssConnection
} from '../p2pClient'
import { runProjectAutoIndex } from '../contextRAG'
import { agentLogger } from '../agentLogger'
import { findImportCycles, buildDependencyDiagram, buildDataflowDiagram } from '../symbolIndex'
import { buildProjectMetrics } from '../projectMetricsIndex'

export function registerMiscIpc(): void {
  ipcMain.handle(IPC.REGISTER_P2P_NODE, async (_e, ...a) => {
    const [settings] = parseIpcArgs(Contracts[IPC.REGISTER_P2P_NODE].args, a)
    const result = await registerNode(settings)
    if (result.ok && result.id) {
      syncP2pWssConnection({ ...settings, p2pNodeId: result.id })
    }
    return result
  })

  ipcMain.handle(IPC.GET_P2P_CREDITS, async (_e, ...a) => {
    const [settings] = parseIpcArgs(Contracts[IPC.GET_P2P_CREDITS].args, a)
    return fetchP2pCreditsBalance(settings)
  })

  ipcMain.handle(IPC.GET_P2P_WSS_STATUS, async () => {
    const state = getP2pWssConnectionState()
    return { state, offline: isP2pWssOffline() }
  })

  ipcMain.handle(IPC.AUTO_INDEX_PROJECT, async (_e, ...a) => {
    const [projectPath, ollamaUrl, qdrantUrl, qdrantApiKey] = parseIpcArgs(
      Contracts[IPC.AUTO_INDEX_PROJECT].args,
      a
    )
    void runProjectAutoIndex(projectPath, ollamaUrl, qdrantUrl, qdrantApiKey)
  })

  ipcMain.handle(IPC.FIND_IMPORT_CYCLES, async (_e, ...a) => {
    const [projectPath, subpath] = parseIpcArgs(Contracts[IPC.FIND_IMPORT_CYCLES].args, a)
    return findImportCycles(projectPath, subpath ? { subpath } : undefined)
  })

  ipcMain.handle(IPC.BUILD_DEPENDENCY_DIAGRAM, async (_e, ...a) => {
    const [projectPath, subpath, focus] = parseIpcArgs(
      Contracts[IPC.BUILD_DEPENDENCY_DIAGRAM].args,
      a
    )
    return buildDependencyDiagram(projectPath, {
      subpath: subpath || undefined,
      focus: focus || undefined
    })
  })

  ipcMain.handle(IPC.BUILD_DATAFLOW_DIAGRAM, async (_e, ...a) => {
    const [projectPath, subpath, focus] = parseIpcArgs(
      Contracts[IPC.BUILD_DATAFLOW_DIAGRAM].args,
      a
    )
    return buildDataflowDiagram(projectPath, {
      subpath: subpath || undefined,
      focus: focus || undefined
    })
  })

  ipcMain.handle(IPC.BUILD_PROJECT_METRICS, async (_e, ...a) => {
    const [projectPath, subpath] = parseIpcArgs(Contracts[IPC.BUILD_PROJECT_METRICS].args, a)
    return buildProjectMetrics(projectPath, { subpath: subpath || undefined })
  })

  ipcMain.handle(IPC.GET_AGENT_METRICS, async (_e, ...a) => {
    const [days] = parseIpcArgs(Contracts[IPC.GET_AGENT_METRICS].args, a)
    return agentLogger.readMetrics(days ?? 30)
  })
}
