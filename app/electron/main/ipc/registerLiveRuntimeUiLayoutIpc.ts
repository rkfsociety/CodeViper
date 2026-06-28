import { ipcMain } from 'electron'
import { IPC, parseIpcArgs, Contracts } from '../../../shared/ipcContracts'
import { loadUiLayout, saveUiLayout } from '../uiLayout'

function safeIpcHandle(channel: string, handler: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, handler)
}

/**
 * Packaged shell (asar) может быть старше git-клона: renderer сохраняет layout панелей,
 * а main из установщика ещё не регистрировал load/save-ui-layout. Подключается из runtimeHandlers.js клона.
 */
export function registerLiveRuntimeUiLayoutIpc(): void {
  safeIpcHandle(IPC.LOAD_UI_LAYOUT, async () => loadUiLayout())

  safeIpcHandle(IPC.SAVE_UI_LAYOUT, async (_e, ...a) => {
    const [layout] = parseIpcArgs(Contracts[IPC.SAVE_UI_LAYOUT].args, a)
    return saveUiLayout(layout)
  })
}
