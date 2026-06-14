import { app } from 'electron'
import { existsSync } from 'fs'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import type { ChatFolder, ChatMessage, ChatStore, SavedChat } from '../../src/types'

function storePath(): string {
  return join(app.getPath('userData'), 'chats.json')
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function emptyStore(): ChatStore {
  return { version: 1, folders: [], chats: [], activeChatId: null }
}

async function loadStore(): Promise<ChatStore> {
  const path = storePath()
  if (!existsSync(path)) return emptyStore()

  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as ChatStore
    if (!Array.isArray(parsed.folders) || !Array.isArray(parsed.chats)) return emptyStore()
    return parsed
  } catch {
    return emptyStore()
  }
}

async function saveStore(store: ChatStore): Promise<void> {
  const path = storePath()
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(store, null, 2), 'utf-8')
}

export function makeChatTitle(text: string): string {
  const line = text.trim().replace(/\s+/g, ' ')
  if (!line) return 'Новый чат'
  return line.length > 48 ? `${line.slice(0, 48)}…` : line
}

export async function getChatStore(): Promise<ChatStore> {
  return loadStore()
}

export async function createChat(
  projectPath: string,
  folderId: string | null = null
): Promise<SavedChat> {
  const store = await loadStore()
  const now = new Date().toISOString()

  const chat: SavedChat = {
    id: makeId(),
    title: 'Новый чат',
    folderId,
    projectPath,
    messages: [],
    createdAt: now,
    updatedAt: now
  }

  store.chats.unshift(chat)
  store.activeChatId = chat.id
  await saveStore(store)
  return chat
}

export async function updateChat(
  id: string,
  patch: Partial<Pick<SavedChat, 'title' | 'messages' | 'folderId' | 'projectPath'>>
): Promise<SavedChat | null> {
  const store = await loadStore()
  const chat = store.chats.find((item) => item.id === id)
  if (!chat) return null

  if (patch.title !== undefined) chat.title = patch.title
  if (patch.messages !== undefined) chat.messages = patch.messages
  if (patch.folderId !== undefined) chat.folderId = patch.folderId
  if (patch.projectPath !== undefined) chat.projectPath = patch.projectPath
  chat.updatedAt = new Date().toISOString()

  await saveStore(store)
  return chat
}

export async function deleteChat(id: string): Promise<void> {
  const store = await loadStore()
  store.chats = store.chats.filter((chat) => chat.id !== id)
  if (store.activeChatId === id) {
    store.activeChatId = store.chats[0]?.id ?? null
  }
  await saveStore(store)
}

export async function createFolder(name: string): Promise<ChatFolder> {
  const store = await loadStore()
  const now = new Date().toISOString()
  const folder: ChatFolder = {
    id: makeId(),
    name: name.trim() || 'Новая папка',
    createdAt: now,
    updatedAt: now
  }
  store.folders.unshift(folder)
  await saveStore(store)
  return folder
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const store = await loadStore()
  const folder = store.folders.find((item) => item.id === id)
  if (!folder) return
  folder.name = name.trim() || folder.name
  folder.updatedAt = new Date().toISOString()
  await saveStore(store)
}

export async function deleteFolder(id: string): Promise<void> {
  const store = await loadStore()
  store.folders = store.folders.filter((folder) => folder.id !== id)
  for (const chat of store.chats) {
    if (chat.folderId === id) chat.folderId = null
  }
  await saveStore(store)
}

export async function setActiveChat(id: string | null): Promise<void> {
  const store = await loadStore()
  store.activeChatId = id
  await saveStore(store)
}

export async function moveChatToFolder(
  chatId: string,
  folderId: string | null
): Promise<void> {
  const store = await loadStore()
  const chat = store.chats.find((item) => item.id === chatId)
  if (!chat) return
  chat.folderId = folderId
  chat.updatedAt = new Date().toISOString()
  await saveStore(store)
}

export function deriveChatTitle(messages: ChatMessage[]): string | undefined {
  const firstUser = messages.find((message) => message.role === 'user')
  if (!firstUser?.content.trim()) return undefined
  return makeChatTitle(firstUser.content)
}
