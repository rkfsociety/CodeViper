import { useMemo, useState } from 'react'
import type { ChatStore, SavedChat } from '../types'

interface Props {
  store: ChatStore | null
  projectPath: string
  activeChatId: string | null
  chatBusy: boolean
  onSelectChat: (id: string) => void
  onCreateChat: (folderId?: string | null) => void
  onCreateFolder: () => void
  onDeleteChat: (id: string) => void
  onDeleteFolder: (id: string) => void
  onRenameChat: (id: string, title: string) => void
  onRenameFolder: (id: string, name: string) => void
  onMoveChat: (chatId: string, folderId: string | null) => void
}

function formatProject(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function promptText(label: string, value: string): string | null {
  const result = window.prompt(label, value)
  if (result === null) return null
  return result.trim()
}

export function ChatHistoryPanel({
  store,
  projectPath,
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
  const [showAll, setShowAll] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const visibleChats = useMemo(() => {
    if (!store) return []
    if (showAll || !projectPath) return store.chats
    return store.chats.filter((chat) => chat.projectPath === projectPath)
  }, [store, showAll, projectPath])

  const chatsByFolder = useMemo(() => {
    const map = new Map<string | null, SavedChat[]>()
    for (const chat of visibleChats) {
      const key = chat.folderId
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(chat)
    }
    return map
  }, [visibleChats])

  const folders = store?.folders ?? []
  const rootChats = chatsByFolder.get(null) ?? []

  function toggleFolder(folderId: string) {
    setCollapsed((prev) => ({ ...prev, [folderId]: !prev[folderId] }))
  }

  function renderChat(chat: SavedChat) {
    const isActive = chat.id === activeChatId
    return (
      <div
        key={chat.id}
        className={`chat-history-item ${isActive ? 'active' : ''}`}
        onClick={() => !chatBusy && onSelectChat(chat.id)}
      >
        <div className="chat-history-item-main">
          <div className="chat-history-title">{chat.title}</div>
          <div className="chat-history-meta">
            {formatProject(chat.projectPath)} · {formatDate(chat.updatedAt)}
          </div>
        </div>
        <div className="chat-history-actions">
          <select
            value={chat.folderId ?? ''}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onMoveChat(chat.id, e.target.value || null)}
            title="Папка"
          >
            <option value="">Без папки</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <button
            className="btn chat-history-btn"
            title="Переименовать"
            onClick={(e) => {
              e.stopPropagation()
              const title = promptText('Название чата', chat.title)
              if (title) onRenameChat(chat.id, title)
            }}
          >
            ✎
          </button>
          <button
            className="btn chat-history-btn"
            title="Удалить"
            onClick={(e) => {
              e.stopPropagation()
              if (window.confirm(`Удалить чат «${chat.title}»?`)) onDeleteChat(chat.id)
            }}
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="chat-history">
      <div className="chat-history-toolbar">
        <button className="btn primary" onClick={() => onCreateChat(null)} disabled={!projectPath || chatBusy}>
          + Чат
        </button>
        <button className="btn" onClick={onCreateFolder}>
          + Папка
        </button>
      </div>

      <label className="chat-history-filter">
        <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
        Все чаты
      </label>

      {!projectPath && (
        <div className="chat-history-hint">Открой проект, чтобы создавать новые чаты</div>
      )}

      <div className="chat-history-list">
        {folders.map((folder) => {
          const chats = chatsByFolder.get(folder.id) ?? []
          const isCollapsed = collapsed[folder.id]

          return (
            <div key={folder.id} className="chat-history-folder">
              <div className="chat-history-folder-head">
                <button className="chat-history-folder-toggle" onClick={() => toggleFolder(folder.id)}>
                  {isCollapsed ? '▶' : '▼'}
                </button>
                <span
                  className="chat-history-folder-name"
                  onDoubleClick={() => {
                    const name = promptText('Название папки', folder.name)
                    if (name) onRenameFolder(folder.id, name)
                  }}
                >
                  📁 {folder.name}
                </span>
                <span className="chat-history-folder-count">{chats.length}</span>
                <button
                  className="btn chat-history-btn"
                  title="Новый чат в папке"
                  disabled={!projectPath || chatBusy}
                  onClick={() => onCreateChat(folder.id)}
                >
                  +
                </button>
                <button
                  className="btn chat-history-btn"
                  title="Удалить папку"
                  onClick={() => {
                    if (window.confirm(`Удалить папку «${folder.name}»? Чаты останутся без папки.`)) {
                      onDeleteFolder(folder.id)
                    }
                  }}
                >
                  ✕
                </button>
              </div>
              {!isCollapsed && <div className="chat-history-folder-chats">{chats.map(renderChat)}</div>}
            </div>
          )
        })}

        {rootChats.length > 0 && (
          <div className="chat-history-section">
            <div className="chat-history-section-title">Без папки</div>
            {rootChats.map(renderChat)}
          </div>
        )}

        {!visibleChats.length && (
          <div className="empty">Нет чатов. Создай первый — кнопка «+ Чат».</div>
        )}
      </div>
    </div>
  )
}
