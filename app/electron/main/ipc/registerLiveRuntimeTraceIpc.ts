import { ipcMain } from 'electron'
import { IPC, parseIpcArgs, Contracts } from '../../../shared/ipcContracts'
import { clearChatTrace, loadChatTrace } from '../traceStorage'

function safeIpcHandle(channel: string, handler: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, handler)
}

/**
 * Packaged shell (asar) может быть старше git-клона: renderer вызывает load/clear chat trace,
 * а main из установщика ещё не регистрировал эти каналы. Подключается из runtimeHandlers.js клона.
 */
export function registerLiveRuntimeTraceIpc(): void {
  safeIpcHandle(IPC.LOAD_CHAT_TRACE, async (_e, ...a) => {
    const [chatId] = parseIpcArgs(Contracts[IPC.LOAD_CHAT_TRACE].args, a)
    return loadChatTrace(chatId)
  })

  safeIpcHandle(IPC.CLEAR_CHAT_TRACE, async (_e, ...a) => {
    const [chatId] = parseIpcArgs(Contracts[IPC.CLEAR_CHAT_TRACE].args, a)
    await clearChatTrace(chatId)
  })
}
