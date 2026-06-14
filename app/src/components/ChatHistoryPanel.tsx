import { useMemo, useState } from 'react'
import type { ChatStore, SavedChat } from '../types'
import { PromptDialog } from './PromptDialog'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  store: ChatStore | null
  activeChatId: string | null
  chatBusy: boolean
  onSelectChat: (id: string) => void
  onCreateChat: (folderId?: string | null) => void
  onCreateFolder: (name: string) => void
  onDeleteChat: (id: string) => void
  onDeleteFolder: (id: string) => void
  onRenameChat: (id: string, title: string) => void
  onRenameFolder: (id: string, name: string) => void
  onMoveChat: (chatId: string, folderId: string | null) => void
}

type DropTarget = string | null | 'root'

type PromptState =
  | { kind: 'create-folder'; defaultValue: string }
  | { kind: 'rename-folder'; folderId: string; defaultValue: string }
  | { kind: 'rename-chat'; chatId: string; defaultValue: string }

type ConfirmState =
  | { kind: 'delete-chat'; chatId: string; title: string }
  | { kind: 'delete-folder'; folderId: string; name: string }

function formatProject(path: string): string {
  if (!path.trim()) return 'без проекта'
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function chatMatchesQuery(chat: SavedChat, query: string): boolean {
  const haystack = [chat.title, chat.projectPath, formatProject(chat.projectPath)]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export function ChatHistoryPanel({
  store,
  activeChatId,
  chatBusy,
  onSelectChat,
  onCreateChat,
  onCreateFolder,
  onDeleteChat,
  onDeleteFolder,
  onRenameChat,
  onRenameFolder,
  onMoveChat
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [draggingChatId, setDraggingChatId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | undefined>(undefined)
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)

  const filteredChats = useMemo(() => {
    const chats = store?.chats ?? []
    const query = searchQuery.trim().toLowerCase()
    if (!query) return chats
    return chats.filter((chat) => chatMatchesQuery(chat, query))
  }, [store, searchQuery])

  const chatsByFolder = useMemo(() => {
    const map = new Map<string | null, SavedChat[]>()
    for (const chat of filteredChats) {
      const key = chat.folderId
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(chat)
    }
    return map
  }, [filteredChats])

  const folders = store?.folders ?? []
  const rootChats = chatsByFolder.get(null) ?? []

  function toggleFolder(folderId: string) {
    setCollapsed((prev) => ({ ...prev, [folderId]: !prev[folderId] }))
  }

  function handleDragStart(chatId: string, e: React.DragEvent) {
    if (chatBusy) return
    e.dataTransfer.setData('text/plain', chatId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingChatId(chatId)
  }

  function handleDragEnd() {
    setDraggingChatId(null)
    setDropTarget(undefined)
  }

  function handleDragOver(target: DropTarget, e: React.DragEvent) {
    if (!draggingChatId) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget(target)
  }

  function handleDrop(target: DropTarget, e: React.DragEvent) {
    e.preventDefault()
    const chatId = e.dataTransfer.getData('text/plain') || draggingChatId
    if (!chatId) return
    const folderId = target === 'root' ? null : target
    onMoveChat(chatId, folderId)
    handleDragEnd()
  }

  function handlePromptConfirm(value: string) {
    if (!prompt) return
    if (prompt.kind === 'create-folder') onCreateFolder(value)
    if (prompt.kind === 'rename-folder') onRenameFolder(prompt.folderId, value)
    if (prompt.kind === 'rename-chat') onRenameChat(prompt.chatId, value)
    setPrompt(null)
  }

  function handleConfirmAction() {
    if (!confirm) return
    if (confirm.kind === 'delete-chat') onDeleteChat(confirm.chatId)
    if (confirm.kind === 'delete-folder') onDeleteFolder(confirm.folderId)
    setConfirm(null)
  }

  function renderChat(chat: SavedChat) {
    const isActive = chat.id === activeChatId
    const isDragging = draggingChatId === chat.id

    return (
      <div
        key={chat.id}
        className={`chat-history-item ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
        draggable={!chatBusy}
        onDragStart={(e) => handleDragStart(chat.id, e)}
        onDragEnd={handleDragEnd}
        onClick={() => !chatBusy && onSelectChat(chat.id)}
      >
        <div className="chat-history-item-main">
          <div className="chat-history-title">{chat.title}</div>
          <div className="chat-history-meta">
            {formatProject(chat.projectPath)} · {formatDate(chat.updatedAt)}
          </div>
        </div>
        <div className="chat-history-actions">
          <button
            className="btn chat-history-btn"
            title="Переименовать"
            onClick={(e) => {
              e.stopPropagation()
              setPrompt({ kind: 'rename-chat', chatId: chat.id, defaultValue: chat.title })
            }}
          >
            ✎
          </button>
          <button
            className="btn chat-history-btn"
            title="Удалить"
            onClick={(e) => {
              e.stopPropagation()
              setConfirm({ kind: 'delete-chat', chatId: chat.id, title: chat.title })
            }}
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  function dropZoneClass(target: DropTarget): string {
    return dropTarget === target ? 'drop-target' : ''
  }

  return (
    <div className="chat-history">
      <div className="chat-history-toolbar">
        <button className="btn primary" onClick={() => onCreateChat(null)} disabled={chatBusy}>
          + Чат
        </button>
        <button
          className="btn"
          onClick={() => setPrompt({ kind: 'create-folder', defaultValue: 'Новая папка' })}
        >
          + Папка
        </button>
      </div>

      <div className="chat-history-search">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по названию или проекту…"
        />
      </div>

      <div className="chat-history-list">
        {folders.map((folder) => {
          const chats = chatsByFolder.get(folder.id) ?? []
          const isCollapsed = collapsed[folder.id]

          return (
            <div key={folder.id} className="chat-history-folder">
              <div
                className={`chat-history-folder-head ${dropZoneClass(folder.id)}`}
                onDragOver={(e) => handleDragOver(folder.id, e)}
                onDragLeave={() => setDropTarget(undefined)}
                onDrop={(e) => handleDrop(folder.id, e)}
              >
                <button className="chat-history-folder-toggle" onClick={() => toggleFolder(folder.id)}>
                  {isCollapsed ? '▶' : '▼'}
                </button>
                <span
                  className="chat-history-folder-name"
                  onDoubleClick={() =>
                    setPrompt({ kind: 'rename-folder', folderId: folder.id, defaultValue: folder.name })
                  }
                >
                  📁 {folder.name}
                </span>
                <span className="chat-history-folder-count">{chats.length}</span>
                <button
                  className="btn chat-history-btn"
                  title="Новый чат в папке"
                  disabled={chatBusy}
                  onClick={() => onCreateChat(folder.id)}
                >
                  +
                </button>
                <button
                  className="btn chat-history-btn"
                  title="Удалить папку"
                  onClick={() =>
                    setConfirm({ kind: 'delete-folder', folderId: folder.id, name: folder.name })
                  }
                >
                  ✕
                </button>
              </div>
              {!isCollapsed && (
                <div
                  className={`chat-history-folder-chats ${dropZoneClass(folder.id)}`}
                  onDragOver={(e) => handleDragOver(folder.id, e)}
                  onDragLeave={() => setDropTarget(undefined)}
                  onDrop={(e) => handleDrop(folder.id, e)}
                >
                  {chats.map(renderChat)}
                </div>
              )}
            </div>
          )
        })}

        {(rootChats.length > 0 || draggingChatId) && (
          <div
            className={`chat-history-section ${dropZoneClass('root')}`}
            onDragOver={(e) => handleDragOver('root', e)}
            onDragLeave={() => setDropTarget(undefined)}
            onDrop={(e) => handleDrop('root', e)}
          >
            <div className="chat-history-section-title">Без папки</div>
            {rootChats.map(renderChat)}
          </div>
        )}

        {!filteredChats.length && (
          <div className="empty">
            {searchQuery.trim() ? 'Ничего не найдено.' : 'Нет чатов. Создай первый — кнопка «+ Чат».'}
          </div>
        )}
      </div>

      <PromptDialog
        open={prompt?.kind === 'create-folder'}
        title="Новая папка"
        label="Название"
        defaultValue={prompt?.kind === 'create-folder' ? prompt.defaultValue : ''}
        confirmLabel="Создать"
        onConfirm={handlePromptConfirm}
        onCancel={() => setPrompt(null)}
      />

      <PromptDialog
        open={prompt?.kind === 'rename-folder'}
        title="Переименовать папку"
        label="Название"
        defaultValue={prompt?.kind === 'rename-folder' ? prompt.defaultValue : ''}
        onConfirm={handlePromptConfirm}
        onCancel={() => setPrompt(null)}
      />

      <PromptDialog
        open={prompt?.kind === 'rename-chat'}
        title="Переименовать чат"
        label="Название"
        defaultValue={prompt?.kind === 'rename-chat' ? prompt.defaultValue : ''}
        onConfirm={handlePromptConfirm}
        onCancel={() => setPrompt(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === 'delete-chat'}
        title="Удалить чат"
        message={
          confirm?.kind === 'delete-chat'
            ? `Удалить чат «${confirm.title}»? Это действие нельзя отменить.`
            : ''
        }
        confirmLabel="Удалить"
        danger
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirm(null)}
      />

      <ConfirmDialog
        open={confirm?.kind === 'delete-folder'}
        title="Удалить папку"
        message={
          confirm?.kind === 'delete-folder'
            ? `Удалить папку «${confirm.name}»? Чаты останутся без папки.`
            : ''
        }
        confirmLabel="Удалить"
        danger
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
