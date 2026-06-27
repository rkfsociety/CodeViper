import { ipcMain } from 'electron'
import { IPC, parseIpcArgs, Contracts } from '../../../shared/ipcContracts'
import { reportAgentTraceToGithub } from '../traceGithubReport'

function safeIpcHandle(channel: string, handler: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, handler)
}

/**
 * Packaged shell (asar) может быть старше git-клона: кнопка «На GitHub» в панели «Трасса»
 * должна использовать код из клона (gh CLI), а не REST API из установщика.
 */
export function registerLiveRuntimeGithubTraceIpc(): void {
  safeIpcHandle(IPC.REPORT_TRACE_TO_GITHUB, async (_e, ...a) => {
    const [chatId, events, projectPath, userNote] = parseIpcArgs(
      Contracts[IPC.REPORT_TRACE_TO_GITHUB].args,
      a
    )
    return reportAgentTraceToGithub(chatId, events, projectPath, userNote)
  })
}
