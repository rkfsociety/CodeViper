import { ipcMain } from 'electron'
import {
  createChat,
  createFolder,
  deleteChat,
  deleteFolder,
  exportChats,
  getChatStore,
  importChats,
  moveChatToFolder,
  renameFolder,
  updateFolder,
  setActiveChat,
  updateChat
} from '../chats'
import { loadSettings } from '../settings'
import { buildVectorStoreConfig } from '../vectorStore'
import type { SavedChat } from '../../../src/types'

export function registerChatsIpc(): void {
  ipcMain.handle('get-chat-store', async () => getChatStore())

  ipcMain.handle('create-chat', async (_e, folderId?: string | null, mode?: 'chat' | 'code') =>
    createChat(folderId ?? null, mode)
  )

  ipcMain.handle(
    'update-chat',
    async (
      _e,
      id: string,
      patch: Partial<
        Pick<SavedChat, 'title' | 'messages' | 'folderId' | 'projectPath' | 'pinned' | 'tags'>
      >
    ) => {
      const settings = await loadSettings()
      const ollamaUrl = settings.ollamaUrl || 'http://127.0.0.1:11434'
      const projectPath = patch.projectPath || ''

      return updateChat(
        id,
        patch,
        projectPath && ollamaUrl
          ? {
              ollamaUrl,
              storeConfig: buildVectorStoreConfig(settings, projectPath)
            }
          : undefined
      )
    }
  )

  ipcMain.handle('delete-chat', async (_e, id: string, projectPath?: string) => {
    const settings = await loadSettings()
    return deleteChat(id, projectPath, buildVectorStoreConfig(settings, projectPath))
  })

  ipcMain.handle('create-chat-folder', async (_e, name: string) => createFolder(name))

  ipcMain.handle('rename-chat-folder', async (_e, id: string, name: string) =>
    renameFolder(id, name)
  )

  ipcMain.handle(
    'update-chat-folder',
    async (_e, id: string, patch: Partial<{ name: string; projectPath: string }>) =>
      updateFolder(id, patch)
  )

  ipcMain.handle('delete-chat-folder', async (_e, id: string) => deleteFolder(id))

  ipcMain.handle('set-active-chat', async (_e, id: string | null) => setActiveChat(id))

  ipcMain.handle('move-chat-to-folder', async (_e, chatId: string, folderId: string | null) =>
    moveChatToFolder(chatId, folderId)
  )

  ipcMain.handle('export-chats', async () => exportChats())

  ipcMain.handle('import-chats', async (_e, chats: SavedChat[]) => importChats(chats))
}
