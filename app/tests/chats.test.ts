import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { rmSync } from 'fs'
import { join } from 'path'

const USER_DATA = join(process.cwd(), '.vitest-tmp', 'chats')

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/chats' }
}))

import {
  createChat,
  updateChat,
  deleteChat,
  getChatStore,
  createFolder,
  renameFolder,
  deleteFolder,
  moveChatToFolder,
  setActiveChat,
  makeChatTitle,
  deriveChatTitle
} from '../electron/main/chats'

beforeEach(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

afterAll(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

describe('создание и обновление чатов', () => {
  it('создаёт чат и делает его активным', async () => {
    const chat = await createChat()
    const store = await getChatStore()
    expect(store.chats).toHaveLength(1)
    expect(store.activeChatId).toBe(chat.id)
    expect(chat.title).toBe('Новый чат')
  })

  it('обновляет поля чата', async () => {
    const chat = await createChat()
    const updated = await updateChat(chat.id, { title: 'Моя задача' })
    expect(updated?.title).toBe('Моя задача')
    expect(await updateChat('нет', { title: 'x' })).toBeNull()
  })

  it('удаляет чат и переносит активность', async () => {
    const a = await createChat()
    const b = await createChat()
    await setActiveChat(b.id)
    await deleteChat(b.id)
    const store = await getChatStore()
    expect(store.chats.map((c) => c.id)).toEqual([a.id])
    expect(store.activeChatId).toBe(a.id)
  })
})

describe('папки', () => {
  it('создаёт, переименовывает и удаляет папку (чаты остаются)', async () => {
    const folder = await createFolder('Работа')
    const chat = await createChat(folder.id)

    await renameFolder(folder.id, 'Прод')
    let store = await getChatStore()
    expect(store.folders[0].name).toBe('Прод')

    await deleteFolder(folder.id)
    store = await getChatStore()
    expect(store.folders).toHaveLength(0)
    expect(store.chats.find((c) => c.id === chat.id)?.folderId).toBeNull()
  })

  it('переносит чат между папками', async () => {
    const folder = await createFolder('F')
    const chat = await createChat()
    await moveChatToFolder(chat.id, folder.id)
    const store = await getChatStore()
    expect(store.chats.find((c) => c.id === chat.id)?.folderId).toBe(folder.id)
  })
})

describe('заголовки', () => {
  it('makeChatTitle обрезает и подставляет дефолт', () => {
    expect(makeChatTitle('  привет   мир  ')).toBe('привет мир')
    expect(makeChatTitle('')).toBe('Новый чат')
    expect(makeChatTitle('x'.repeat(60))).toHaveLength(49) // 48 символов + …
  })

  it('deriveChatTitle берёт первое сообщение пользователя', () => {
    expect(
      deriveChatTitle([
        { id: '1', role: 'assistant', content: 'привет', timestamp: 0 },
        { id: '2', role: 'user', content: 'Сделай X', timestamp: 0 }
      ])
    ).toBe('Сделай X')
    expect(deriveChatTitle([])).toBeUndefined()
  })
})
