import { useCallback, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ChatFolder, ImportResult, SavedChat } from '../types'
import { PromptDialog } from './PromptDialog'
import { ConfirmDialog } from './ConfirmDialog'
import styles from './ChatHistoryPanel.module.css'
import { useChatContext } from '../contexts/ChatContext'
import { useChatBusy } from '../contexts/QueueContext'

export type AgentMode = 'chat' | 'code'

interface Props {
  mode: AgentMode
  onModeChange: (mode: AgentMode) => void
  onSelectChat: (id: string) => void
  onCreateChat: (folderId?: string | null) => void
  onCreateFolder: (name: string) => void
  onDeleteChat: (id: string) => void
  onDeleteFolder: (id: string) => void
  onRenameChat: (id: string, title: string) => void
  onRenameFolder: (id: string, name: string) => void
  onUpdateFolderProject: (id: string) => void
  onMoveChat: (chatId: string, folderId: string | null) => void
  onStoreChange?: () => void
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

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function chatsToMarkdown(chats: SavedChat[]): string {
  const ROLE_LABEL: Record<string, string> = {
    user: 'Вы',
    assistant: 'CodeViper',
    tool: 'Инструмент',
    system: 'Система'
  }
  const parts: string[] = [`# История чатов CodeViper\n`]
  for (const chat of chats) {
    parts.push(`## ${chat.title}`)
    parts.push(`*Проект: ${chat.projectPath || 'не указан'} · ${chat.updatedAt.slice(0, 10)}*\n`)
    for (const msg of chat.messages) {
      const label = ROLE_LABEL[msg.role] ?? msg.role
      parts.push(`**${label}:**\n\n${msg.content}\n`)
    }
    parts.push('---\n')
  }
  return parts.join('\n')
}

function validateImportPayload(raw: unknown): SavedChat[] {
  if (!raw || typeof raw !== 'object') throw new Error('Неверный формат файла')
  const obj = raw as Record<string, unknown>

  let list: unknown[] = []
  if (Array.isArray(obj)) {
    list = obj
  } else if (Array.isArray(obj['chats'])) {
    list = obj['chats'] as unknown[]
  } else {
    throw new Error('Файл должен содержать массив чатов или объект с полем "chats"')
  }

  return list.filter((item): item is SavedChat => {
    if (!item || typeof item !== 'object') return false
    const c = item as Record<string, unknown>
    return (
      typeof c['id'] === 'string' && typeof c['title'] === 'string' && Array.isArray(c['messages'])
    )
  })
}

function chatMatchesQuery(chat: SavedChat, query: string): boolean {
  const haystack = [chat.title, chat.projectPath, formatProject(chat.projectPath)]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export function ChatHistoryPanel({
  mode,
  onModeChange,
  onSelectChat,
  onCreateChat,
  onCreateFolder,
  onDeleteChat,
  onDeleteFolder,
  onRenameChat,
  onRenameFolder,
  onUpdateFolderProject,
  onMoveChat,
  onStoreChange
}: Props) {
  const { chatStore: store, activeChatId } = useChatContext()
  const { chatBusy } = useChatBusy()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [draggingChatId, setDraggingChatId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | undefined>(undefined)
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [ioMenuOpen, setIoMenuOpen] = useState(false)
  const [ioStatus, setIoStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const handleExportJson = useCallback(async () => {
    setIoMenuOpen(false)
    try {
      const chatStore = await window.codeviper.exportChats()
      const json = JSON.stringify(chatStore, null, 2)
      downloadBlob(new Blob([json], { type: 'application/json' }), 'codeviper-chats.json')
    } catch (e) {
      setIoStatus(`Ошибка экспорта: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [])

  const handleExportMarkdown = useCallback(async () => {
    setIoMenuOpen(false)
    try {
      const chatStore = await window.codeviper.exportChats()
      const md = chatsToMarkdown(chatStore.chats)
      downloadBlob(new Blob([md], { type: 'text/markdown' }), 'codeviper-chats.md')
    } catch (e) {
      setIoStatus(`Ошибка экспорта: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [])

  const handleImportClick = useCallback(() => {
    setIoMenuOpen(false)
    fileInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      e.target.value = ''
      try {
        const text = await file.text()
        const raw: unknown = JSON.parse(text)
        const chats = validateImportPayload(raw)
        if (chats.length === 0) {
          setIoStatus('Файл не содержит подходящих чатов')
          return
        }
        const result: ImportResult = await window.codeviper.importChats(chats)
        setIoStatus(`Импорт: добавлено ${result.added}, пропущено ${result.skipped}`)
        if (result.added > 0) onStoreChange?.()
      } catch (err) {
        setIoStatus(`Ошибка импорта: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
    [onStoreChange]
  )

  const filteredChats = useMemo(() => {
    const chats = store?.chats ?? []
    const query = searchQuery.trim().toLowerCase()
    const tag = tagFilter.trim().toLowerCase()
    let filtered = chats.filter((chat) => (chat.mode ?? 'code') === mode)
    if (query) filtered = filtered.filter((chat) => chatMatchesQuery(chat, query))
    if (tag) {
      filtered = filtered.filter((chat) => chat.tags?.some((t) => t.toLowerCase().includes(tag)))
    }
    return [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return 0
    })
  }, [store, searchQuery, tagFilter, mode])

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
      if (chatBusy && chatId === activeChatId) return
      e.dataTransfer.setData('text/plain', chatId)
      e.dataTransfer.effectAllowed = 'move'
      setDraggingChatId(chatId)
    },
    [chatBusy, activeChatId]
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
        className={`${styles.item} ${isActive ? styles.active : ''} ${isDragging ? styles.dragging : ''} ${chat.pinned ? styles.pinned : ''}`}
        draggable={!(chatBusy && chat.id === activeChatId)}
        onDragStart={(e) => handleDragStart(chat.id, e)}
        onDragEnd={handleDragEnd}
        onClick={() => !(chatBusy && chat.id === activeChatId) && onSelectChat(chat.id)}
      >
        <div className={styles.itemMain}>
          <div className={styles.title}>
            {chat.pinned && <span className={styles.pinIcon}>📌 </span>}
            {chat.title}
          </div>
          <div className={styles.meta}>
            {formatProject(chat.projectPath)} · {formattedDates.get(chat.id)}
          </div>
          {chat.tags && chat.tags.length > 0 && (
            <div className={styles.tags}>
              {chat.tags.map((tag) => (
                <span
                  key={tag}
                  className={styles.tag}
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
        <div className={styles.actions}>
          <button
            className={`btn ${styles.historyBtn}${chat.pinned ? ' active' : ''}`}
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
            className={`btn ${styles.historyBtn}`}
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
            className={`btn ${styles.historyBtn}`}
            title={
              chatBusy && chat.id === activeChatId
                ? 'Нельзя удалять активный чат пока агент работает'
                : 'Удалить'
            }
            aria-label="Удалить чат"
            disabled={chatBusy && chat.id === activeChatId}
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
        className={`${styles.folderHead} ${dropTarget === folder.id ? styles.dropTarget : ''}`}
        onDragOver={(e) => handleDragOver(folder.id, e)}
        onDragLeave={() => setDropTarget(undefined)}
        onDrop={(e) => handleDrop(folder.id, e)}
      >
        <button className={styles.folderToggle} onClick={() => toggleFolder(folder.id)}>
          {isCollapsed ? '▶' : '▼'}
        </button>
        <span className="chat-history-folder-label">
          <span
            className={styles.folderName}
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
        <span className={styles.folderCount}>{chats.length}</span>
        <button
          className={`btn ${styles.historyBtn}`}
          title={folder.projectPath ? `Проект: ${folder.projectPath}` : 'Привязать проект к папке'}
          aria-label={
            folder.projectPath ? `Проект папки: ${folder.projectPath}` : 'Привязать проект к папке'
          }
          onClick={() => onUpdateFolderProject(folder.id)}
        >
          📂
        </button>
        <button
          className={`btn ${styles.historyBtn}`}
          title="Новый чат в папке"
          aria-label="Новый чат в папке"
          onClick={() => onCreateChat(folder.id)}
        >
          +
        </button>
        <button
          className={`btn ${styles.historyBtn}`}
          title={chatBusy ? 'Нельзя удалять папку пока агент работает' : 'Удалить папку'}
          aria-label="Удалить папку"
          disabled={chatBusy}
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
    <div className={styles.panel}>
      {/* Переключатель режима агента */}
      <div className={styles.modeTabs}>
        <button
          type="button"
          className={`${styles.modeTab}${mode === 'chat' ? ' ' + styles.modeTabActive : ''}`}
          onClick={() => onModeChange('chat')}
          title="Режим разговора — агент отвечает на вопросы и объясняет"
        >
          💬 Chat
        </button>
        <button
          type="button"
          className={`${styles.modeTab}${mode === 'code' ? ' ' + styles.modeTabActive : ''}`}
          onClick={() => onModeChange('code')}
          title="Режим кода — агент сразу пишет и правит файлы"
        >
          {'</>'} Code
        </button>
      </div>

      <div className={styles.toolbar}>
        <button className="btn primary" onClick={() => onCreateChat(null)}>
          + Чат
        </button>
        <button
          className="btn"
          onClick={() => setPrompt({ kind: 'create-folder', defaultValue: 'Новая папка' })}
        >
          + Папка
        </button>
        <div className={styles.ioMenuWrap}>
          <button
            className="btn"
            title="Экспорт / Импорт"
            aria-label="Экспорт и импорт чатов"
            onClick={() => setIoMenuOpen((v) => !v)}
          >
            ⇅
          </button>
          {ioMenuOpen && (
            <div className={styles.ioMenu} role="menu">
              <button role="menuitem" onClick={() => void handleExportJson()}>
                Экспорт JSON
              </button>
              <button role="menuitem" onClick={() => void handleExportMarkdown()}>
                Экспорт Markdown
              </button>
              <button role="menuitem" onClick={handleImportClick}>
                Импорт JSON
              </button>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={(e) => void handleImportFile(e)}
        />
      </div>

      {ioStatus && (
        <div className={styles.ioStatus}>
          {ioStatus}
          <button
            type="button"
            className={`btn ${styles.historyBtn}`}
            onClick={() => setIoStatus(null)}
          >
            ✕
          </button>
        </div>
      )}

      <div className={styles.search}>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по названию или проекту…"
        />
        {tagFilter && (
          <div className={styles.tagFilter}>
            <span className={styles.tag}>{tagFilter}</span>
            <button
              type="button"
              className={`btn ${styles.historyBtn}`}
              onClick={() => setTagFilter('')}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div ref={listRef} className={styles.list} role="tree" aria-label="История чатов">
        {filteredChats.length === 0 && (
          <div className="empty">
            {searchQuery.trim()
              ? 'Ничего не найдено.'
              : `Нет чатов в режиме ${mode === 'chat' ? 'Chat' : 'Code'}. Создай первый — кнопка «+ Чат».`}
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
                      className={dropTarget === item.folderId ? styles.dropTarget : ''}
                      onDragOver={(e) => handleDragOver(item.folderId, e)}
                      onDragLeave={() => setDropTarget(undefined)}
                      onDrop={(e) => handleDrop(item.folderId, e)}
                    >
                      {renderChat(item.chat)}
                    </div>
                  )}

                  {item.kind === 'root-head' && (
                    <div
                      className={`${styles.sectionTitle}${dropTarget === 'root' ? ' ' + styles.dropTarget : ''}`}
                      onDragOver={(e) => handleDragOver('root', e)}
                      onDragLeave={() => setDropTarget(undefined)}
                      onDrop={(e) => handleDrop('root', e)}
                    >
                      Без папки
                    </div>
                  )}

                  {item.kind === 'root-chat' && (
                    <div
                      className={dropTarget === 'root' ? styles.dropTarget : ''}
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
