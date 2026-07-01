import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { rmSync } from 'fs'
import { join } from 'path'

const USER_DATA = join(process.cwd(), '.vitest-tmp', 'chats')

vi.mock('electron', () => ({
  app: { getPath: () => join(process.cwd(), '.vitest-tmp') }
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
  exportChatForAnalysis,
  makeChatTitle,
  deriveChatTitle,
  trimChatMessages
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

  it('в режиме chat не подставляет projectPath из других чатов', async () => {
    const codeChat = await createChat()
    await updateChat(codeChat.id, { projectPath: 'C:\\demo\\project' })
    const chat = await createChat(null, 'chat')
    expect(chat.mode).toBe('chat')
    expect(chat.projectPath).toBe('')
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

describe('trimChatMessages', () => {
  it('обрезает по количеству сообщений', () => {
    const messages = Array.from({ length: 450 }, (_, i) => ({
      id: String(i),
      role: 'user' as const,
      content: `msg ${i}`,
      timestamp: i
    }))
    const trimmed = trimChatMessages(messages)
    expect(trimmed).toHaveLength(400)
    expect(trimmed[0].content).toBe('msg 50')
  })

  it('сохраняет сообщения при нормальном размере', () => {
    const messages = [{ id: '1', role: 'user' as const, content: 'hello', timestamp: 0 }]
    expect(trimChatMessages(messages)).toEqual(messages)
  })
})

describe('защита от потери при повреждении', () => {
  it('повреждённый файл чата бэкапится, сообщения не затираются', async () => {
    const { writeFileSync, readdirSync } = await import('fs')
    const chat = await createChat()
    await updateChat(chat.id, {
      messages: [{ id: 'm1', role: 'user', content: 'привет', timestamp: 0 }]
    })

    const dataFile = join(USER_DATA, 'data', `${chat.id}.json`)
    writeFileSync(dataFile, '{битый json', 'utf-8')

    const store = await getChatStore()
    expect(store.chats.find((c) => c.id === chat.id)?.messages).toEqual([])

    const backups = readdirSync(join(USER_DATA, 'data')).filter((f) => f.includes('.corrupt-'))
    expect(backups).toHaveLength(1)
  })

  it('повреждённый индекс бэкапится, не затирается пустым', async () => {
    const { writeFileSync, readdirSync } = await import('fs')
    await createChat()
    const idx = join(USER_DATA, 'index.json')
    writeFileSync(idx, '{не json', 'utf-8')

    const store = await getChatStore()
    expect(store.chats).toEqual([])

    const backups = readdirSync(USER_DATA).filter((f) => f.includes('.corrupt-'))
    expect(backups).toHaveLength(1)
  })

  it('exportChatForAnalysis возвращает чат с сообщениями', async () => {
    const created = await createChat()
    await updateChat(created.id, {
      title: 'Экспорт',
      messages: [{ id: 'm1', role: 'user', content: 'тест', timestamp: 1 }]
    })
    const payload = await exportChatForAnalysis(created.id)
    expect(payload?.chat.title).toBe('Экспорт')
    expect(payload?.chat.messages).toHaveLength(1)
    expect(payload?.exportSchemaVersion).toBe(1)
    expect(await exportChatForAnalysis('missing')).toBeNull()
  })
})
