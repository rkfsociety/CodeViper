import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, rename, unlink } from 'fs/promises'
import { join } from 'path'
import { makeId } from '../../shared/makeId'
import { backupCorruptFile, writeJsonAtomic } from './fsUtil'
import { clearChatFromRAG, addMessageToRAG } from './contextRAG'
import { clearChatTrace } from './traceStorage'
import type { VectorStoreConfig } from './vectorStore'
import type {
  ChatFolder,
  ChatMessage,
  ChatStore,
  InterruptedDraft,
  SavedChat
} from '../../src/types'

export { makeChatTitle, deriveChatTitle } from '../../shared/chatTitle'

const MAX_CHATS = 150
const MAX_MESSAGES_PER_CHAT = 400
const MAX_CHAT_JSON_CHARS = 1_500_000

interface ChatDataFile {
  messages: ChatMessage[]
  interruptedDraft?: InterruptedDraft | null
}

interface ChatIndexEntry {
  id: string
  title: string
  folderId: string | null
  projectPath: string
  createdAt: string
  updatedAt: string
  pinned?: boolean
  tags?: string[]
  mode?: 'chat' | 'code'
}

interface ChatsIndex {
  version: 2
  folders: ChatFolder[]
  chats: ChatIndexEntry[]
  activeChatId: string | null
}

function chatsRoot(): string {
  return join(app.getPath('userData'), 'chats')
}

function indexPath(): string {
  return join(chatsRoot(), 'index.json')
}

function legacyStorePath(): string {
  return join(app.getPath('userData'), 'chats.json')
}

function chatDataPath(id: string): string {
  return join(chatsRoot(), 'data', `${id}.json`)
}

function emptyIndex(): ChatsIndex {
  return { version: 2, folders: [], chats: [], activeChatId: null }
}

export function trimChatMessages(messages: ChatMessage[]): ChatMessage[] {
  let trimmed =
    messages.length > MAX_MESSAGES_PER_CHAT ? messages.slice(-MAX_MESSAGES_PER_CHAT) : [...messages]

  while (trimmed.length > 20 && JSON.stringify(trimmed).length > MAX_CHAT_JSON_CHARS) {
    trimmed = trimmed.slice(1)
  }

  return trimmed
}

async function loadIndex(): Promise<ChatsIndex> {
  await migrateLegacyStoreIfNeeded()

  const path = indexPath()
  if (!existsSync(path)) return emptyIndex()

  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as ChatsIndex
    if (parsed.version !== 2 || !Array.isArray(parsed.folders) || !Array.isArray(parsed.chats)) {
      throw new Error('bad index shape')
    }
    return parsed
  } catch {
    // Индекс повреждён — спасаем файл, чтобы не затереть список чатов пустым.
    await backupCorruptFile(path)
    return emptyIndex()
  }
}

async function saveIndex(index: ChatsIndex): Promise<void> {
  await writeJsonAtomic(indexPath(), index)
}

async function loadChatData(id: string): Promise<ChatDataFile> {
  const path = chatDataPath(id)
  if (!existsSync(path)) return { messages: [] }

  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as ChatDataFile
    if (!Array.isArray(parsed.messages)) throw new Error('bad chat data shape')
    return {
      messages: parsed.messages,
      interruptedDraft: parsed.interruptedDraft ?? null
    }
  } catch {
    // Файл чата повреждён — спасаем его, иначе автосейв затрёт сообщения пустым массивом.
    await backupCorruptFile(path)
    return { messages: [] }
  }
}

async function saveChatData(
  id: string,
  messages: ChatMessage[],
  interruptedDraft?: InterruptedDraft | null
): Promise<void> {
  const trimmed = trimChatMessages(messages)
  const data: ChatDataFile = { messages: trimmed }
  if (interruptedDraft !== undefined) data.interruptedDraft = interruptedDraft
  await writeJsonAtomic(chatDataPath(id), data)
}

function indexEntryFromChat(chat: SavedChat): ChatIndexEntry {
  return {
    id: chat.id,
    title: chat.title,
    folderId: chat.folderId,
    projectPath: chat.projectPath,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    ...(chat.pinned !== undefined ? { pinned: chat.pinned } : {}),
    ...(chat.tags?.length ? { tags: chat.tags } : {}),
    ...(chat.mode ? { mode: chat.mode } : {})
  }
}

async function hydrateChat(entry: ChatIndexEntry): Promise<SavedChat> {
  const data = await loadChatData(entry.id)
  return {
    ...entry,
    messages: data.messages,
    ...(entry.pinned !== undefined ? { pinned: entry.pinned } : {}),
    ...(entry.tags?.length ? { tags: entry.tags } : {}),
    ...(data.interruptedDraft ? { interruptedDraft: data.interruptedDraft } : {})
  }
}

async function migrateLegacyStoreIfNeeded(): Promise<void> {
  const legacy = legacyStorePath()
  if (!existsSync(legacy) || existsSync(indexPath())) return

  try {
    const raw = await readFile(legacy, 'utf-8')
    const parsed = JSON.parse(raw) as {
      folders?: ChatFolder[]
      chats?: SavedChat[]
      activeChatId?: string | null
    }

    const index: ChatsIndex = {
      version: 2,
      folders: parsed.folders ?? [],
      chats: [],
      activeChatId: parsed.activeChatId ?? null
    }

    await mkdir(join(chatsRoot(), 'data'), { recursive: true })

    for (const chat of parsed.chats ?? []) {
      const messages = trimChatMessages(chat.messages ?? [])
      await saveChatData(chat.id, messages, null)
      index.chats.push(indexEntryFromChat({ ...chat, messages }))
    }

    await saveIndex(index)
    await rename(legacy, `${legacy}.bak`).catch(async () => {
      await unlink(legacy).catch(() => {})
    })
  } catch {
    // если миграция не удалась — не блокируем запуск
  }
}

function enforceChatLimit(index: ChatsIndex): void {
  if (index.chats.length <= MAX_CHATS) return

  const sorted = [...index.chats].sort(
    (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
  )
  const toRemove = sorted.slice(0, index.chats.length - MAX_CHATS)
  index.chats = index.chats.filter((chat) => !toRemove.some((item) => item.id === chat.id))

  if (index.activeChatId && !index.chats.some((chat) => chat.id === index.activeChatId)) {
    index.activeChatId = index.chats[0]?.id ?? null
  }

  for (const chat of toRemove) {
    unlink(chatDataPath(chat.id)).catch(() => {})
  }
}

export async function getChatStore(): Promise<ChatStore> {
  const index = await loadIndex()
  const chats = await Promise.all(index.chats.map(hydrateChat))
  return {
    version: 2,
    folders: index.folders,
    chats,
    activeChatId: index.activeChatId
  }
}

export async function createChat(
  folderId: string | null = null,
  mode?: 'chat' | 'code'
): Promise<SavedChat> {
  const index = await loadIndex()
  const now = new Date().toISOString()

  const folderProjectPath = folderId
    ? (index.folders.find((f) => f.id === folderId)?.projectPath ?? '')
    : ''
  const lastProjectPath =
    folderProjectPath || (index.chats.find((c) => c.projectPath)?.projectPath ?? '')

  const chat: SavedChat = {
    id: makeId(),
    title: 'Новый чат',
    folderId,
    projectPath: lastProjectPath,
    messages: [],
    createdAt: now,
    updatedAt: now,
    ...(mode ? { mode } : {})
  }

  index.chats.unshift(indexEntryFromChat(chat))
  index.activeChatId = chat.id
  enforceChatLimit(index)

  await saveChatData(chat.id, [], null)
  await saveIndex(index)
  return chat
}

export async function updateChat(
  id: string,
  patch: Partial<
    Pick<
      SavedChat,
      'title' | 'messages' | 'folderId' | 'projectPath' | 'pinned' | 'tags' | 'interruptedDraft'
    >
  >,
  /** Параметры для RAG индексирования новых сообщений */
  ragOptions?: { ollamaUrl: string; storeConfig: VectorStoreConfig }
): Promise<SavedChat | null> {
  const index = await loadIndex()
  const entry = index.chats.find((item) => item.id === id)
  if (!entry) return null

  if (patch.title !== undefined) entry.title = patch.title
  if (patch.folderId !== undefined) entry.folderId = patch.folderId
  if (patch.projectPath !== undefined) entry.projectPath = patch.projectPath
  if (patch.pinned !== undefined) entry.pinned = patch.pinned
  if (patch.tags !== undefined) entry.tags = patch.tags
  entry.updatedAt = new Date().toISOString()

  if (patch.messages !== undefined || patch.interruptedDraft !== undefined) {
    const existing = await loadChatData(id)
    const messages = patch.messages ?? existing.messages
    const interruptedDraft =
      patch.interruptedDraft !== undefined ? patch.interruptedDraft : existing.interruptedDraft
    await saveChatData(id, messages, interruptedDraft)

    // Индексируем новые сообщения в RAG (асинхронно, не блокируя)
    if (ragOptions && patch.messages && patch.messages.length > existing.messages.length) {
      const newMessages = patch.messages.slice(existing.messages.length)
      for (const msg of newMessages) {
        if (msg.role === 'system') continue
        // Преобразуем ChatMessage в OllamaMessage для RAG индексирования
        const ollamaMsg = {
          role: msg.role as 'user' | 'assistant' | 'tool',
          content: msg.content
        }
        addMessageToRAG(msg.id, ollamaMsg, id, ragOptions.ollamaUrl, ragOptions.storeConfig).catch(
          () => {
            /* Ошибки RAG индексирования не критичны */
          }
        )
      }
    }
  }

  await saveIndex(index)
  return hydrateChat(entry)
}

export async function deleteChat(
  id: string,
  projectPath?: string,
  storeConfig?: VectorStoreConfig
): Promise<void> {
  const index = await loadIndex()
  index.chats = index.chats.filter((chat) => chat.id !== id)
  if (index.activeChatId === id) {
    index.activeChatId = index.chats[0]?.id ?? null
  }
  await saveIndex(index)
  await unlink(chatDataPath(id)).catch(() => {})
  await clearChatTrace(id)

  // Очищаем RAG индекс для удалённого чата
  clearChatFromRAG(id, storeConfig ?? { provider: 'local', projectPath }).catch(() => {
    /* Ошибки очистки RAG не критичны */
  })
}

export async function createFolder(name: string): Promise<ChatFolder> {
  const index = await loadIndex()
  const now = new Date().toISOString()
  const folder: ChatFolder = {
    id: makeId(),
    name: name.trim() || 'Новая папка',
    createdAt: now,
    updatedAt: now
  }
  index.folders.unshift(folder)
  await saveIndex(index)
  return folder
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const index = await loadIndex()
  const folder = index.folders.find((item) => item.id === id)
  if (!folder) return
  folder.name = name.trim() || folder.name
  folder.updatedAt = new Date().toISOString()
  await saveIndex(index)
}

export async function updateFolder(
  id: string,
  patch: Partial<Pick<ChatFolder, 'name' | 'projectPath'>>
): Promise<void> {
  const index = await loadIndex()
  const folder = index.folders.find((item) => item.id === id)
  if (!folder) return
  if (patch.name !== undefined) folder.name = patch.name.trim() || folder.name
  if (patch.projectPath !== undefined) folder.projectPath = patch.projectPath
  folder.updatedAt = new Date().toISOString()
  await saveIndex(index)
}

export async function deleteFolder(id: string): Promise<void> {
  const index = await loadIndex()
  index.folders = index.folders.filter((folder) => folder.id !== id)
  for (const chat of index.chats) {
    if (chat.folderId === id) chat.folderId = null
  }
  await saveIndex(index)
}

export async function setActiveChat(id: string | null): Promise<void> {
  const index = await loadIndex()
  index.activeChatId = id
  await saveIndex(index)
}

export async function moveChatToFolder(chatId: string, folderId: string | null): Promise<void> {
  const index = await loadIndex()
  const chat = index.chats.find((item) => item.id === chatId)
  if (!chat) return
  chat.folderId = folderId
  chat.updatedAt = new Date().toISOString()
  await saveIndex(index)
}

export interface ImportResult {
  added: number
  skipped: number
}

export async function exportChats(): Promise<ChatStore> {
  return getChatStore()
}

export async function importChats(incoming: SavedChat[]): Promise<ImportResult> {
  const index = await loadIndex()
  const existingIds = new Set(index.chats.map((c) => c.id))

  let added = 0
  let skipped = 0

  await mkdir(join(chatsRoot(), 'data'), { recursive: true })

  for (const chat of incoming) {
    if (!chat.id || typeof chat.id !== 'string') {
      skipped++
      continue
    }
    if (existingIds.has(chat.id)) {
      skipped++
      continue
    }

    const messages = trimChatMessages(Array.isArray(chat.messages) ? chat.messages : [])
    await saveChatData(chat.id, messages, null)
    index.chats.push(indexEntryFromChat({ ...chat, messages }))
    existingIds.add(chat.id)
    added++
  }

  if (added > 0) {
    enforceChatLimit(index)
    await saveIndex(index)
  }

  return { added, skipped }
}
