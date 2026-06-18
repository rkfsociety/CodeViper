import { useCallback, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ChatFolder, ChatStore, SavedChat } from '../types'
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
  onUpdateFolderProject: (id: string) => void
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

type FlatItem =
  | { kind: 'folder-head'; folder: ChatFolder }
  | { kind: 'folder-chat'; chat: SavedChat; folderId: string }
  | { kind: 'root-head' }
  | { kind: 'root-chat'; chat: SavedChat }

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
  onUpdateFolderProject,
  onMoveChat
}: Props) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [draggingChatId, setDraggingChatId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | undefined>(undefined)
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filteredChats = useMemo(() => {
    const chats = store?.chats ?? []
    const query = searchQuery.trim().toLowerCase()
    const tag = tagFilter.trim().toLowerCase()
    let filtered = query ? chats.filter((chat) => chatMatchesQuery(chat, query)) : chats
    if (tag) {
      filtered = filtered.filter((chat) => chat.tags?.some((t) => t.toLowerCase().includes(tag)))
    }
    return [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return 0
    })
  }, [store, searchQuery, tagFilter])

  const chatsByFolder = useMemo(() => {
    const map = new Map<string | null, SavedChat[]>()
    for (const chat of filteredChats) {
      const key = chat.folderId
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(chat)
    }
    return map
  }, [filteredChats])

  const folders = useMemo(() => store?.folders ?? [], [store])
  const rootChats = useMemo(() => chatsByFolder.get(null) ?? [], [chatsByFolder])

  const formattedDates = useMemo(() => {
    const map = new Map<string, string>()
    for (const chat of store?.chats ?? []) {
      map.set(chat.id, formatDate(chat.updatedAt))
    }
    return map
  }, [store?.chats])

  const flatItems = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = []
    for (const folder of folders) {
      items.push({ kind: 'folder-head', folder })
      if (!collapsed[folder.id]) {
        for (const chat of chatsByFolder.get(folder.id) ?? []) {
          items.push({ kind: 'folder-chat', chat, folderId: folder.id })
        }
      }
    }
    if (rootChats.length > 0 || draggingChatId) {
      items.push({ kind: 'root-head' })
      for (const chat of rootChats) {
        items.push({ kind: 'root-chat', chat })
      }
    }
    return items
  }, [folders, chatsByFolder, collapsed, rootChats, draggingChatId])

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => listRef.current,
    estimateSize: (i) => {
      const item = flatItems[i]
      if (!item || item.kind === 'folder-head' || item.kind === 'root-head') return 42
      return 74
    },
    overscan: 5
  })

  const toggleFolder = useCallback((folderId: string) => {
    setCollapsed((prev) => ({ ...prev, [folderId]: !prev[folderId] }))
  }, [])

  const handleDragStart = useCallback(
    (chatId: string, e: React.DragEvent) => {
      if (chatBusy) return
      e.dataTransfer.setData('text/plain', chatId)
      e.dataTransfer.effectAllowed = 'move'
      setDraggingChatId(chatId)
    },
    [chatBusy]
  )

  const handleDragEnd = useCallback(() => {
    setDraggingChatId(null)
    setDropTarget(undefined)
  }, [])

  const handleDragOver = useCallback(
    (target: DropTarget, e: React.DragEvent) => {
      if (!draggingChatId) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(target)
    },
    [draggingChatId]
  )

  const handleDrop = useCallback(
    (target: DropTarget, e: React.DragEvent) => {
      e.preventDefault()
      const chatId = e.dataTransfer.getData('text/plain') || draggingChatId
      if (!chatId) return
      const folderId = target === 'root' ? null : target
      onMoveChat(chatId, folderId)
      handleDragEnd()
    },
    [draggingChatId, onMoveChat, handleDragEnd]
  )

  const handlePromptConfirm = useCallback(
    (value: string) => {
      if (!prompt) return
      if (prompt.kind === 'create-folder') onCreateFolder(value)
      if (prompt.kind === 'rename-folder') onRenameFolder(prompt.folderId, value)
      if (prompt.kind === 'rename-chat') onRenameChat(prompt.chatId, value)
      setPrompt(null)
    },
    [prompt, onCreateFolder, onRenameFolder, onRenameChat]
  )

  const handleConfirmAction = useCallback(() => {
    if (!confirm) return
    if (confirm.kind === 'delete-chat') onDeleteChat(confirm.chatId)
    if (confirm.kind === 'delete-folder') onDeleteFolder(confirm.folderId)
    setConfirm(null)
  }, [confirm, onDeleteChat, onDeleteFolder])

  function renderChat(chat: SavedChat) {
    const isActive = chat.id === activeChatId
    const isDragging = draggingChatId === chat.id

    return (
      <div
        key={chat.id}
        className={`chat-history-item ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${chat.pinned ? 'pinned' : ''}`}
        draggable={!chatBusy}
        onDragStart={(e) => handleDragStart(chat.id, e)}
        onDragEnd={handleDragEnd}
        onClick={() => !chatBusy && onSelectChat(chat.id)}
      >
        <div className="chat-history-item-main">
          <div className="chat-history-title">
            {chat.pinned && <span className="chat-pin-icon">📌 </span>}
            {chat.title}
          </div>
          <div className="chat-history-meta">
            {formatProject(chat.projectPath)} · {formattedDates.get(chat.id)}
          </div>
          {chat.tags && chat.tags.length > 0 && (
            <div className="chat-tags">
              {chat.tags.map((tag) => (
                <span
                  key={tag}
                  className="chat-tag"
                  onClick={(e) => {
                    e.stopPropagation()
                    setTagFilter(tag)
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="chat-history-actions">
          <button
            className={`btn chat-history-btn${chat.pinned ? ' active' : ''}`}
            title={chat.pinned ? 'Открепить' : 'Закрепить'}
            aria-label={chat.pinned ? 'Открепить чат' : 'Закрепить чат'}
            aria-pressed={chat.pinned ?? false}
            onClick={(e) => {
              e.stopPropagation()
              void window.codeviper.updateChat(chat.id, { pinned: !chat.pinned })
            }}
          >
            📌
          </button>
          <button
            className="btn chat-history-btn"
            title="Переименовать"
            aria-label="Переименовать чат"
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
            aria-label="Удалить чат"
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

  function renderFolderHead(folder: ChatFolder) {
    const isCollapsed = collapsed[folder.id]
    const chats = chatsByFolder.get(folder.id) ?? []
    return (
      <div
        className={`chat-history-folder-head ${dropTarget === folder.id ? 'drop-target' : ''}`}
        onDragOver={(e) => handleDragOver(folder.id, e)}
        onDragLeave={() => setDropTarget(undefined)}
        onDrop={(e) => handleDrop(folder.id, e)}
      >
        <button className="chat-history-folder-toggle" onClick={() => toggleFolder(folder.id)}>
          {isCollapsed ? '▶' : '▼'}
        </button>
        <span className="chat-history-folder-label">
          <span
            className="chat-history-folder-name"
            onDoubleClick={() =>
              setPrompt({
                kind: 'rename-folder',
                folderId: folder.id,
                defaultValue: folder.name
              })
            }
          >
            📁 {folder.name}
          </span>
          {folder.projectPath && (
            <span className="chat-history-folder-project" title={folder.projectPath}>
              {formatProject(folder.projectPath)}
            </span>
          )}
        </span>
        <span className="chat-history-folder-count">{chats.length}</span>
        <button
          className="btn chat-history-btn"
          title={folder.projectPath ? `Проект: ${folder.projectPath}` : 'Привязать проект к папке'}
          aria-label={
            folder.projectPath ? `Проект папки: ${folder.projectPath}` : 'Привязать проект к папке'
          }
          onClick={() => onUpdateFolderProject(folder.id)}
        >
          📂
        </button>
        <button
          className="btn chat-history-btn"
          title="Новый чат в папке"
          aria-label="Новый чат в папке"
          disabled={chatBusy}
          onClick={() => onCreateChat(folder.id)}
        >
          +
        </button>
        <button
          className="btn chat-history-btn"
          title="Удалить папку"
          aria-label="Удалить папку"
          onClick={() =>
            setConfirm({ kind: 'delete-folder', folderId: folder.id, name: folder.name })
          }
        >
          ✕
        </button>
      </div>
    )
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
        {tagFilter && (
          <div className="chat-tag-filter">
            <span className="chat-tag">{tagFilter}</span>
            <button type="button" className="btn chat-history-btn" onClick={() => setTagFilter('')}>
              ✕
            </button>
          </div>
        )}
      </div>

      <div ref={listRef} className="chat-history-list" role="tree" aria-label="История чатов">
        {filteredChats.length === 0 && (
          <div className="empty">
            {searchQuery.trim()
              ? 'Ничего не найдено.'
              : 'Нет чатов. Создай первый — кнопка «+ Чат».'}
          </div>
        )}

        {flatItems.length > 0 && (
          <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((vRow) => {
              const item = flatItems[vRow.index]
              if (!item) return null

              return (
                <div
                  key={vRow.key}
                  ref={rowVirtualizer.measureElement}
                  data-index={vRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${vRow.start}px)`,
                    paddingBottom: 4
                  }}
                >
                  {item.kind === 'folder-head' && renderFolderHead(item.folder)}

                  {item.kind === 'folder-chat' && (
                    <div
                      className={dropTarget === item.folderId ? 'drop-target' : ''}
                      onDragOver={(e) => handleDragOver(item.folderId, e)}
                      onDragLeave={() => setDropTarget(undefined)}
                      onDrop={(e) => handleDrop(item.folderId, e)}
                    >
                      {renderChat(item.chat)}
                    </div>
                  )}

                  {item.kind === 'root-head' && (
                    <div
                      className={`chat-history-section-title${dropTarget === 'root' ? ' drop-target' : ''}`}
                      onDragOver={(e) => handleDragOver('root', e)}
                      onDragLeave={() => setDropTarget(undefined)}
                      onDrop={(e) => handleDrop('root', e)}
                    >
                      Без папки
                    </div>
                  )}

                  {item.kind === 'root-chat' && (
                    <div
                      className={dropTarget === 'root' ? 'drop-target' : ''}
                      onDragOver={(e) => handleDragOver('root', e)}
                      onDragLeave={() => setDropTarget(undefined)}
                      onDrop={(e) => handleDrop('root', e)}
                    >
                      {renderChat(item.chat)}
                    </div>
                  )}
                </div>
              )
            })}
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
