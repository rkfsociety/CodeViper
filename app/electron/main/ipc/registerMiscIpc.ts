import { ipcMain } from 'electron'
import { IPC, parseIpcArgs, Contracts } from '../../../shared/ipcContracts'
import { registerNode, fetchP2pCreditsBalance } from '../p2pClient'
import { runProjectAutoIndex } from '../contextRAG'

export function registerMiscIpc(): void {
  ipcMain.handle(IPC.REGISTER_P2P_NODE, async (_e, ...a) => {
    const [settings] = parseIpcArgs(Contracts[IPC.REGISTER_P2P_NODE].args, a)
    return registerNode(settings)
  })

  ipcMain.handle(IPC.GET_P2P_CREDITS, async (_e, ...a) => {
    const [settings] = parseIpcArgs(Contracts[IPC.GET_P2P_CREDITS].args, a)
    return fetchP2pCreditsBalance(settings)
  })

  ipcMain.handle(IPC.AUTO_INDEX_PROJECT, async (_e, ...a) => {
    const [projectPath, ollamaUrl, qdrantUrl, qdrantApiKey] = parseIpcArgs(
      Contracts[IPC.AUTO_INDEX_PROJECT].args,
      a
    )
    void runProjectAutoIndex(projectPath, ollamaUrl, qdrantUrl, qdrantApiKey)
  })
}
