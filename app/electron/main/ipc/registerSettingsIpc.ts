import { ipcMain } from 'electron'
import { IPC, parseIpcArgs, Contracts } from '../../../shared/ipcContracts'
import { loadSettings, saveSettings } from '../settings'
import { addMcpServer, healthCheckMcpServers, removeMcpServer } from '../mcpRegistry'
import { setSourceRootOverride } from '../codeviperSource'
import type { IpcContext } from './ipcContext'

export function registerSettingsIpc(ctx: IpcContext): void {
  const { applyTraySettings } = ctx

  ipcMain.handle(IPC.LOAD_SETTINGS, async () => loadSettings())

  ipcMain.handle(IPC.SAVE_SETTINGS, async (_e, ...a) => {
    const [settings] = parseIpcArgs(Contracts[IPC.SAVE_SETTINGS].args, a)
    const saved = await saveSettings(settings)
    applyTraySettings(saved)
    if (saved.sourceRootOverride) {
      setSourceRootOverride(saved.sourceRootOverride)
    } else {
      setSourceRootOverride(null)
    }
    return saved
  })

  ipcMain.handle(IPC.ADD_MCP_SERVER, async (_e, ...a) => {
    const [settings, serverUrl] = parseIpcArgs(Contracts[IPC.ADD_MCP_SERVER].args, a)
    return addMcpServer(settings, serverUrl)
  })

  ipcMain.handle(IPC.REMOVE_MCP_SERVER, async (_e, ...a) => {
    const [settings, serverUrl] = parseIpcArgs(Contracts[IPC.REMOVE_MCP_SERVER].args, a)
    return removeMcpServer(settings, serverUrl)
  })

  ipcMain.handle(IPC.CHECK_MCP_HEALTH, async (_e, ...a) => {
    const [settings] = parseIpcArgs(Contracts[IPC.CHECK_MCP_HEALTH].args, a)
    const results = await healthCheckMcpServers(settings.mcpServers ?? [])
    return { results }
  })
}
