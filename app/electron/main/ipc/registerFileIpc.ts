import { dialog, ipcMain } from 'electron'
import { unlink } from 'fs/promises'
import { IPC, parseIpcArgs, Contracts } from '../../../shared/ipcContracts'
import { safeReadFile, safeWriteFile, runCommand, buildFileTree } from '../services'
import { readFileHistory } from '../fileHistory'
import { loadSettings } from '../settings'
import { exportAgentTrace } from '../traceStorage'
import type { IpcContext } from './ipcContext'

const ATTACHMENT_SIZE_LIMIT = 200 * 1024

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'])
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml'
}

export function registerFileIpc(ctx: IpcContext): void {
  const { getWindow } = ctx

  ipcMain.handle('select-project-folder', async () => {
    const result = await dialog.showOpenDialog(getWindow()!, {
      properties: ['openDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('select-files', async () => {
    const { stat } = await import('fs/promises')
    const result = await dialog.showOpenDialog(getWindow()!, {
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled) return []
    return Promise.all(
      result.filePaths.map(async (p) => {
        const info = await stat(p)
        return { path: p, size: info.size }
      })
    )
  })

  ipcMain.handle('read-attachment', async (_e, filePath: string) => {
    const { stat, readFile } = await import('fs/promises')
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const isImage = IMAGE_EXTENSIONS.has(ext)

    const info = await stat(filePath)
    if (info.size > ATTACHMENT_SIZE_LIMIT) {
      return {
        ok: false,
        error: `Файл слишком большой (${(info.size / 1024).toFixed(0)} КБ, лимит 200 КБ)`
      }
    }

    if (isImage) {
      const buf = await readFile(filePath)
      const mime = IMAGE_MIME[ext] ?? 'image/png'
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      return { ok: true, isImage: true, dataUrl, mime }
    }

    const content = await readFile(filePath, 'utf-8')
    return { ok: true, isImage: false, content }
  })

  ipcMain.handle('read-file', async (_e, projectPath: string, filePath: string) =>
    safeReadFile(projectPath, filePath)
  )

  ipcMain.handle(IPC.WRITE_FILE, async (_e, ...a) => {
    const [projectPath, filePath, content] = parseIpcArgs(Contracts[IPC.WRITE_FILE].args, a)
    return safeWriteFile(projectPath, filePath, content)
  })

  ipcMain.handle(IPC.GET_PROJECT_TREE, async (_e, ...a) => {
    const [projectPath, maxDepth] = parseIpcArgs(Contracts[IPC.GET_PROJECT_TREE].args, a)
    return buildFileTree(projectPath, 0, maxDepth ?? 8)
  })

  ipcMain.handle(IPC.READ_FILE_HISTORY, async (_e, projectPath: string, filePath: string) =>
    readFileHistory(projectPath, filePath)
  )

  ipcMain.handle(IPC.EXPORT_TRACE, async (_e, ...a) => {
    const [chatId, events, projectPath] = parseIpcArgs(Contracts[IPC.EXPORT_TRACE].args, a)
    return exportAgentTrace(chatId, events, projectPath)
  })

  ipcMain.handle(IPC.RUN_TERMINAL_COMMAND, async (_e, ...a) => {
    const [cwd, command] = parseIpcArgs(Contracts[IPC.RUN_TERMINAL_COMMAND].args, a)
    const settings = await loadSettings()
    return runCommand(
      cwd,
      command,
      undefined,
      settings.commandBlocklist,
      undefined,
      settings.commandAllowlist
    )
  })

  ipcMain.handle(IPC.DELETE_GGUF_FILE, async (_e, filePath: string) => {
    await unlink(filePath)
  })
}
