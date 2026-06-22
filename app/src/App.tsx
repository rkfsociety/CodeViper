import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { initTraceBuffer } from './traceBuffer'
import logoUrl from '../resources/icon.png'
import type {
  AgentConfirmRequest,
  AgentSettings,
  AppState,
  ChatMessage,
  ChatStore,
  OllamaModel,
  UpdateInfo
} from './types'
import { filterToolCallingModels, isToolCallingModel } from './types'
import { ChatPanel, type ChatPanelHandle } from './components/ChatPanel'
import { useMemo } from 'react'
import type { SetStateAction } from 'react'
import { AgentProvider } from './contexts/AgentContext'
import { ChatContext, type ChatContextValue } from './contexts/ChatContext'
import { QueueProvider, useChatBusy } from './contexts/QueueContext'
import { ChatHistoryPanel, type AgentMode } from './components/ChatHistoryPanel'
import { OllamaDownloadStatus } from './components/OllamaDownloadStatus'
import { ConfirmDialog } from './components/ConfirmDialog'
import { CrashRecoveryDialog } from './components/CrashRecoveryDialog'

const TerminalPanel = lazy(() =>
  import('./components/TerminalPanel').then((m) => ({ default: m.TerminalPanel }))
)
const TracePanel = lazy(() =>
  import('./components/TracePanel').then((m) => ({ default: m.TracePanel }))
)
const PrStatusPanel = lazy(() =>
  import('./components/PrStatusPanel').then((m) => ({ default: m.PrStatusPanel }))
)
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
)
const KeyboardShortcutsModal = lazy(() =>
  import('./components/KeyboardShortcutsModal').then((m) => ({
    default: m.KeyboardShortcutsModal
  }))
)
import { useOllamaDownloadQueue } from './hooks/useOllamaDownloadQueue'
import { deriveChatTitle } from '../shared/chatTitle'
import { DEEPSEEK_API_BASE_URL, GEMINI_API_BASE_URL } from '../shared/constants'
import { makeId } from '../shared/makeId'
import { tronStorage } from './lib/tron'

const DEFAULT_SETTINGS: AgentSettings = {
  ollamaUrl: 'http://127.0.0.1:11434',
  model: '',
  selfLearning: true,
  autoModel: true,
  permissionMode: 'acceptEdits',
  clarifyMode: false,
  deepReasoning: false,
  autoPushSelfEdits: true,
  summarizeModel: '',
  gitSyncOnStartup: true,
  gitSyncStrategy: 'stash'
}

export default function App() {
  return (
    <AgentProvider>
      <QueueProvider>
        <AppContent />
      </QueueProvider>
    </AgentProvider>
  )
}

function AppContent() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS)
  const [ollamaOnline, setOllamaOnline] = useState(false)
  const [models, setModels] = useState<OllamaModel[]>([])
  const [chatStore, setChatStore] = useState<ChatStore | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<Map<string, ChatMessage[]>>(new Map())
  const { busyChats, chatBusy } = useChatBusy()
  // Сообщения активного чата — производная от Map
  const messages = activeChatId ? (chatMessages.get(activeChatId) ?? []) : []
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0)
  const [skillsRefreshKey, setSkillsRefreshKey] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [prPanelOpen, setPrPanelOpen] = useState(false)
  const [tracePanelOpen, setTracePanelOpen] = useState(false)

  useEffect(() => initTraceBuffer(), [])
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [settingsReady, setSettingsReady] = useState(false)
  const [confirmReq, setConfirmReq] = useState<AgentConfirmRequest | null>(null)
  const [lightMode, setLightMode] = useState(false)
  const [showSecurityNotice, setShowSecurityNotice] = useState(false)
  const [crashRecovery, setCrashRecovery] = useState<AppState | null>(null)
  const [agentMode, setAgentMode] = useState<AgentMode>('code')
  const lastActiveChatPerMode = useRef<Record<AgentMode, string | null>>({ chat: null, code: null })
  const agentModeRef = useRef<AgentMode>('code')
  agentModeRef.current = agentMode
  const activeChatIdRef = useRef(activeChatId)
  const chatMessagesRef = useRef<Map<string, ChatMessage[]>>(new Map())
  const messagesRef = useRef(messages)
  const chatPanelRef = useRef<ChatPanelHandle>(null)

  activeChatIdRef.current = activeChatId
  chatMessagesRef.current = chatMessages
  messagesRef.current = messages

  const activeChat = useMemo(
    () => chatStore?.chats.find((chat) => chat.id === activeChatId) ?? null,
    [chatStore, activeChatId]
  )
  const activeProjectPath = activeChat?.projectPath ?? ''

  const flushCurrentChat = useCallback(async () => {
    const chatId = activeChatIdRef.current
    if (!chatId) return
    const msgs = chatMessagesRef.current.get(chatId) ?? []
    const title = deriveChatTitle(msgs)
    await window.codeviper.updateChat(chatId, {
      messages: msgs,
      ...(title ? { title } : {})
    })
  }, [])

  // Обновить сообщения для конкретного chatId
  const setMessagesForChat = useCallback(
    (chatId: string, updater: SetStateAction<ChatMessage[]>) => {
      setChatMessages((prev) => {
        const next = new Map(prev)
        const current = prev.get(chatId) ?? []
        next.set(chatId, typeof updater === 'function' ? updater(current) : updater)
        return next
      })
    },
    []
  )

  // Обновить сообщения активного чата (обратная совместимость)
  const setMessages = useCallback(
    (updater: SetStateAction<ChatMessage[]>) => {
      const chatId = activeChatIdRef.current
      if (!chatId) return
      setMessagesForChat(chatId, updater)
    },
    [setMessagesForChat]
  )

  const refreshChatStore = useCallback(async () => {
    const store = await window.codeviper.getChatStore()
    setChatStore(store)
    return store
  }, [])

  const chatContextValue = useMemo(
    () => ({
      messages,
      setMessages,
      activeChatId,
      chatStore,
      activeChat,
      activeProjectPath,
      interruptedDraft: activeChat?.interruptedDraft,
      refreshChatStore
    }),
    [messages, activeChatId, chatStore, activeChat, activeProjectPath, refreshChatStore]
  )

  const refreshOllama = useCallback(async () => {
    const provider = settings.modelProvider

    // Ollama статус проверяем всегда — он виден в хидере независимо от провайдера
    const online = await window.codeviper.checkOllama(settings.ollamaUrl)
    setOllamaOnline(online)

    if (provider === 'deepseek') {
      try {
        const list = await window.codeviper.listProviderModels({
          type: 'deepseek',
          baseUrl: DEEPSEEK_API_BASE_URL,
          apiKey: settings.deepseekApiKey
        })
        setModels(list.map((m) => ({ name: m.name, size: m.size ?? 0, modifiedAt: '' })))
      } catch {
        setModels([])
      }
      return
    }

    if (provider === 'openai') {
      try {
        const list = await window.codeviper.listProviderModels({
          type: 'openai',
          baseUrl: settings.ollamaUrl || 'https://api.openai.com/v1',
          apiKey: settings.openaiApiKey
        })
        setModels(list.map((m) => ({ name: m.name, size: m.size ?? 0, modifiedAt: '' })))
      } catch {
        setModels([])
      }
      return
    }

    if (provider === 'openrouter') {
      try {
        const list = await window.codeviper.listProviderModels({
          type: 'openrouter',
          apiKey: settings.openrouterApiKey
        })
        setModels(
          list.map((m) => ({
            name: m.name,
            size: m.size ?? 0,
            modifiedAt: '',
            contextLength: m.contextLength
          }))
        )
      } catch {
        setModels([])
      }
      return
    }

    if (provider === 'gemini') {
      try {
        const list = await window.codeviper.listProviderModels({
          type: 'gemini',
          baseUrl: GEMINI_API_BASE_URL,
          apiKey: settings.geminiApiKey
        })
        setModels(list.map((m) => ({ name: m.name, size: m.size ?? 0, modifiedAt: '' })))
      } catch {
        setModels([])
      }
      return
    }

    if (online) {
      const list = await window.codeviper.listOllamaModels(settings.ollamaUrl)
      setModels(list)
      const toolModels = filterToolCallingModels(list)
      const names = toolModels.map((m) => m.name)
      setSettings((prev) => ({
        ...prev,
        model:
          prev.model && names.includes(prev.model) && isToolCallingModel(prev.model)
            ? prev.model
            : (names[0] ?? '')
      }))
    } else {
      setModels([])
    }
  }, [
    settings.ollamaUrl,
    settings.modelProvider,
    settings.deepseekApiKey,
    settings.openaiApiKey,
    settings.openrouterApiKey,
    settings.geminiApiKey
  ])

  const downloadQueue = useOllamaDownloadQueue({
    ollamaUrl: settings.ollamaUrl,
    ollamaOnline,
    installedModels: models,
    onRefresh: refreshOllama,
    onModelInstalled: (modelName) => {
      setSettings((prev) => ({ ...prev, model: prev.model || modelName }))
    }
  })

  useEffect(() => {
    const appendSystemMessage = (content: string) => {
      if (!activeChatIdRef.current) return
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: 'system' as const, content, timestamp: Date.now() }
      ])
    }

    const handleError = (event: ErrorEvent) => {
      window.codeviper.logFrontendError(event.message, (event.error as Error | null)?.stack)
      appendSystemMessage(`Ошибка: ${event.message}`)
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason instanceof Error ? event.reason.message : String(event.reason)
      const stack = event.reason instanceof Error ? event.reason.stack : undefined
      window.codeviper.logFrontendError(msg, stack)
      appendSystemMessage(`Необработанная ошибка: ${msg}`)
    }

    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  useEffect(() => {
    let active = true
    void window.codeviper.loadSettings().then((saved) => {
      if (active) {
        setSettings(saved)
        setSettingsReady(true)
        // Показать предупреждение о дефолтах безопасности при первом запуске
        if (!tronStorage.getItem('cv-security-notice-seen')) {
          setShowSecurityNotice(true)
          tronStorage.setItem('cv-security-notice-seen', true)
        }
      }
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    return window.codeviper.onAgentConfirm((request) => setConfirmReq(request))
  }, [])

  useEffect(() => {
    return window.codeviper.onUpdateAvailable((info) => setUpdateInfo(info))
  }, [])

  // Проверяем наличие краш-снимка при старте (файл остался после аварийного завершения)
  useEffect(() => {
    void window.codeviper.getCrashRecovery().then((state) => {
      if (state) setCrashRecovery(state)
    })
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('light-mode', lightMode)
  }, [lightMode])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
      }
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        chatPanelRef.current?.focusInput()
      }
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tag = (e.target as HTMLElement).tagName
        const editable = (e.target as HTMLElement).isContentEditable
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !editable) {
          e.preventDefault()
          setShortcutsOpen((v) => !v)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const resolveConfirm = useCallback(
    (approved: boolean) => {
      if (!confirmReq) return
      window.codeviper.respondAgentConfirm(confirmReq.id, approved)
      setConfirmReq(null)
    },
    [confirmReq]
  )

  useEffect(() => {
    if (!settingsReady) return

    void refreshOllama()
    refreshChatStore().then((store) => {
      if (!store.activeChatId) return
      const chat = store.chats.find((item) => item.id === store.activeChatId)
      if (!chat) return
      setActiveChatId(chat.id)
      setChatMessages((prev) => {
        const next = new Map(prev)
        next.set(chat.id, chat.messages)
        return next
      })
    })
  }, [settingsReady]) // eslint-disable-line react-hooks/exhaustive-deps -- функции переопределяются на каждый рендер

  useEffect(() => {
    if (!settingsReady) return
    void refreshOllama()
  }, [settings.modelProvider]) // eslint-disable-line react-hooks/exhaustive-deps -- refreshOllama стабильна внутри сессии

  useEffect(() => {
    if (!settingsReady) return

    const timer = window.setTimeout(() => {
      void window.codeviper.saveSettings(settings)
    }, 400)

    return () => window.clearTimeout(timer)
  }, [settings, settingsReady])

  useEffect(() => {
    if (!activeChatId) return

    const timer = window.setTimeout(async () => {
      await flushCurrentChat()
      setChatStore(await window.codeviper.getChatStore())
    }, 500)

    return () => window.clearTimeout(timer)
  }, [messages, activeChatId, flushCurrentChat])

  useEffect(() => {
    return () => {
      void flushCurrentChat()
    }
  }, [flushCurrentChat])

  const pickProjectForActiveChat = useCallback(async () => {
    if (!activeChatId || chatBusy || messages.length > 0) return
    const folder = await window.codeviper.selectProjectFolder()
    if (!folder) return
    await window.codeviper.updateChat(activeChatId, { projectPath: folder })
    await refreshChatStore()
  }, [activeChatId, chatBusy, messages.length, refreshChatStore])

  const selectChat = useCallback(
    async (id: string) => {
      if (id === activeChatId) return

      await flushCurrentChat()

      // Загружаем сообщения из store только если чат ещё не смонтирован
      if (!chatMessagesRef.current.has(id)) {
        const store = chatStore ?? (await refreshChatStore())
        const chat = store.chats.find((item) => item.id === id)
        if (!chat) return
        setChatMessages((prev) => {
          const next = new Map(prev)
          next.set(id, chat.messages)
          return next
        })
      }

      setActiveChatId(id)
      await window.codeviper.setActiveChat(id)
      setChatStore(await window.codeviper.getChatStore())
    },
    [activeChatId, chatStore, flushCurrentChat, refreshChatStore]
  )

  const handleCrashRestore = useCallback(async () => {
    if (!crashRecovery) return
    const id = crashRecovery.activeChatId
    setCrashRecovery(null)
    const store = chatStore ?? (await refreshChatStore())
    if (store.chats.some((c) => c.id === id)) {
      await selectChat(id)
    }
  }, [crashRecovery, chatStore, refreshChatStore, selectChat])

  const createChat = useCallback(
    async (folderId: string | null = null) => {
      await flushCurrentChat()

      const chat = await window.codeviper.createChat(folderId, agentModeRef.current)
      await refreshChatStore()
      lastActiveChatPerMode.current[agentModeRef.current] = chat.id
      setActiveChatId(chat.id)
      setChatMessages((prev) => {
        const next = new Map(prev)
        next.set(chat.id, [])
        return next
      })
    },
    [flushCurrentChat, refreshChatStore]
  )

  const handleModeChange = useCallback(
    async (newMode: AgentMode) => {
      lastActiveChatPerMode.current[agentModeRef.current] = activeChatIdRef.current
      setAgentMode(newMode)
      await flushCurrentChat()
      const store = await refreshChatStore()
      const lastId = lastActiveChatPerMode.current[newMode]
      const chats = store?.chats ?? []
      const modeChats = chats.filter((c) => (c.mode ?? 'code') === newMode)
      const target =
        lastId && modeChats.find((c) => c.id === lastId) ? lastId : (modeChats[0]?.id ?? null)
      if (target) {
        await selectChat(target)
      } else {
        setActiveChatId(null)
      }
    },
    [flushCurrentChat, refreshChatStore, selectChat]
  )

  const createFolder = useCallback(
    async (name: string) => {
      if (!name.trim()) return
      await window.codeviper.createChatFolder(name.trim())
      await refreshChatStore()
    },
    [refreshChatStore]
  )

  const deleteChat = useCallback(
    async (id: string) => {
      if (chatBusy && id === activeChatId) return
      await window.codeviper.deleteChat(id)
      setChatMessages((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
      const store = await refreshChatStore()
      if (activeChatId === id) {
        const next = store.chats[0]
        setActiveChatId(next?.id ?? null)
        if (next) {
          setChatMessages((prev) => {
            const m = new Map(prev)
            if (!m.has(next.id)) m.set(next.id, next.messages)
            return m
          })
        }
        await window.codeviper.setActiveChat(next?.id ?? null)
      }
    },
    [chatBusy, activeChatId, refreshChatStore]
  )

  const renameChat = useCallback(
    async (id: string, title: string) => {
      await window.codeviper.updateChat(id, { title })
      await refreshChatStore()
    },
    [refreshChatStore]
  )

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      await window.codeviper.renameChatFolder(id, name)
      await refreshChatStore()
    },
    [refreshChatStore]
  )

  const updateFolderProject = useCallback(
    async (id: string) => {
      const folder = await window.codeviper.selectProjectFolder()
      if (!folder) return
      await window.codeviper.updateChatFolder(id, { projectPath: folder })
      await refreshChatStore()
    },
    [refreshChatStore]
  )

  const deleteFolder = useCallback(
    async (id: string) => {
      await window.codeviper.deleteChatFolder(id)
      await refreshChatStore()
    },
    [refreshChatStore]
  )

  const moveChat = useCallback(
    async (chatId: string, folderId: string | null) => {
      await window.codeviper.moveChatToFolder(chatId, folderId)
      await refreshChatStore()
    },
    [refreshChatStore]
  )

  // chatId'ы, для которых рендерим ChatPanel: активный + все занятые (параллельные агенты)
  const mountedChatIds = useMemo(() => {
    const ids: string[] = []
    if (activeChatId) ids.push(activeChatId)
    for (const id of busyChats) {
      if (id !== activeChatId) ids.push(id)
    }
    return ids
  }, [activeChatId, busyChats])

  // Контексты для каждого смонтированного панела
  const mountedChatContexts = useMemo((): Map<string, ChatContextValue> => {
    const contexts = new Map<string, ChatContextValue>()
    for (const chatId of mountedChatIds) {
      const chat = chatStore?.chats.find((c) => c.id === chatId) ?? null
      const msgs = chatMessages.get(chatId) ?? []
      contexts.set(chatId, {
        messages: msgs,
        setMessages: (updater) => setMessagesForChat(chatId, updater),
        activeChatId: chatId,
        chatStore,
        activeChat: chat,
        activeProjectPath: chat?.projectPath ?? '',
        interruptedDraft: chat?.interruptedDraft,
        refreshChatStore
      })
    }
    return contexts
  }, [mountedChatIds, chatMessages, chatStore, refreshChatStore, setMessagesForChat])

  return (
    <ChatContext.Provider value={chatContextValue}>
      <div className={`app${settings.powerSaveMode ? ' power-save' : ''}`}>
        <header className="topbar">
          <div className="logo">
            <img src={logoUrl} alt="CodeViper" className="logo-img" />
            <span>CodeViper</span>
          </div>
          <div
            className={`status-dot ${ollamaOnline ? 'online' : 'offline'}`}
            title={ollamaOnline ? 'Ollama online' : 'Ollama offline'}
          />
          <div className="topbar-status">
            <span className={`topbar-pill ${ollamaOnline ? 'online' : 'offline'}`}>
              {ollamaOnline ? 'Ollama' : 'Ollama offline'}
            </span>
            <OllamaDownloadStatus
              pulling={downloadQueue.pulling}
              queued={downloadQueue.queued}
              progress={downloadQueue.progress}
              error={downloadQueue.error}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
          <div className="topbar-actions">
            <button className="btn" onClick={refreshOllama}>
              Обновить Ollama
            </button>
            <button
              className={`btn ${terminalOpen ? 'active' : ''}`}
              onClick={() => setTerminalOpen((open) => !open)}
              disabled={!activeProjectPath}
              title={activeProjectPath ? undefined : 'Сначала выберите проект в чате'}
            >
              Терминал
            </button>
            <button
              className={`btn ${prPanelOpen ? 'active' : ''}`}
              onClick={() => setPrPanelOpen((open) => !open)}
              title="Статус Pull Requests"
            >
              PR
            </button>
            <button
              className="btn"
              title={lightMode ? 'Тёмная тема' : 'Светлая тема'}
              onClick={() => setLightMode((v) => !v)}
            >
              {lightMode ? '🌙' : '☀️'}
            </button>
            <button
              className={`btn ${tracePanelOpen ? 'active' : ''}`}
              onClick={() => setTracePanelOpen((v) => !v)}
              title="Трассировка агента — сырой лог всех запросов к модели"
            >
              Трасса
            </button>
            <button
              className="btn"
              onClick={() => window.codeviper.openDevTools()}
              title="Открыть консоль разработчика"
            >
              DevTools
            </button>
            <button
              className="btn"
              onClick={() => setShortcutsOpen(true)}
              title="Горячие клавиши (?)"
              aria-label="Горячие клавиши"
            >
              ?
            </button>
            <button
              className="btn"
              onClick={() => setSettingsOpen(true)}
              title="Настройки (Ctrl+,)"
            >
              Настройки
            </button>
          </div>
        </header>

        {updateInfo && (
          <div className="update-banner" role="status">
            <span>
              🔄 Доступно обновление: смержено{' '}
              {updateInfo.commits === 1 ? '1 коммит' : `${updateInfo.commits} коммит(ов)`} в
              исходники. Перезапустите для пересборки.
            </span>
            <div className="update-banner-actions">
              <button className="btn primary" onClick={() => window.codeviper.restartApp()}>
                Перезапустить
              </button>
              <button className="btn" onClick={() => setUpdateInfo(null)}>
                Позже
              </button>
            </div>
          </div>
        )}

        <div className="layout">
          <section className="panel panel-history">
            <div className="panel-header">История чатов</div>
            <ChatHistoryPanel
              mode={agentMode}
              onModeChange={handleModeChange}
              onSelectChat={selectChat}
              onCreateChat={createChat}
              onCreateFolder={createFolder}
              onDeleteChat={deleteChat}
              onRenameChat={renameChat}
              onRenameFolder={renameFolder}
              onUpdateFolderProject={updateFolderProject}
              onDeleteFolder={deleteFolder}
              onMoveChat={moveChat}
              onStoreChange={() => void refreshChatStore()}
            />
          </section>

          <section className="panel panel-main">
            <div className="panel-header">Агент</div>
            {mountedChatIds.map((chatId) => (
              <ChatContext.Provider key={chatId} value={mountedChatContexts.get(chatId)!}>
                <div
                  style={chatId === activeChatId ? { display: 'contents' } : { display: 'none' }}
                >
                  <ChatPanel
                    ref={chatId === activeChatId ? chatPanelRef : undefined}
                    settings={{
                      ...settings,
                      // В режиме Chat включаем clarifyMode — агент уточняет прежде чем действовать
                      clarifyMode: agentMode === 'chat' ? true : settings.clarifyMode,
                      chatMode: agentMode === 'chat'
                    }}
                    onPickProject={pickProjectForActiveChat}
                    models={models}
                    onModelChange={(model, auto) =>
                      setSettings((prev) => ({ ...prev, model, autoModel: auto }))
                    }
                    onSettingsChange={(partial) => setSettings((prev) => ({ ...prev, ...partial }))}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onEnqueueModel={downloadQueue.enqueue}
                    onRefreshOllama={refreshOllama}
                    onLearningSaved={() => {
                      setMemoryRefreshKey((key) => key + 1)
                      setSkillsRefreshKey((key) => key + 1)
                    }}
                  />
                </div>
              </ChatContext.Provider>
            ))}

            {terminalOpen && (
              <div className="terminal-dock">
                <div className="terminal-dock-header">
                  <span>Терминал</span>
                  <button
                    type="button"
                    className="btn terminal-dock-close"
                    onClick={() => setTerminalOpen(false)}
                  >
                    Скрыть
                  </button>
                </div>
                {activeProjectPath ? (
                  <Suspense fallback={null}>
                    <TerminalPanel projectPath={activeProjectPath} embedded />
                  </Suspense>
                ) : (
                  <div className="hint">Выберите проект в чате, чтобы пользоваться терминалом</div>
                )}
              </div>
            )}

            {prPanelOpen && (
              <div className="terminal-dock">
                <div className="terminal-dock-header">
                  <span>Pull Requests</span>
                  <button
                    type="button"
                    className="btn terminal-dock-close"
                    onClick={() => setPrPanelOpen(false)}
                  >
                    Скрыть
                  </button>
                </div>
                <Suspense fallback={null}>
                  <PrStatusPanel isOpen={prPanelOpen} />
                </Suspense>
              </div>
            )}
          </section>

          {tracePanelOpen && (
            <section className="panel panel-trace">
              <Suspense fallback={null}>
                <TracePanel chatId={activeChatId} />
              </Suspense>
            </section>
          )}
        </div>

        {shortcutsOpen && (
          <Suspense fallback={null}>
            <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
          </Suspense>
        )}

        {settingsOpen && (
          <Suspense fallback={null}>
            <SettingsModal
              open={settingsOpen}
              settings={settings}
              chatProjectPath={activeProjectPath}
              ollamaOnline={ollamaOnline}
              models={models}
              downloadQueue={downloadQueue}
              memoryRefreshKey={memoryRefreshKey}
              skillsRefreshKey={skillsRefreshKey}
              onClose={() => setSettingsOpen(false)}
              onSettingsChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
              onRefreshOllama={refreshOllama}
              onSelfLearningChange={(selfLearning) =>
                setSettings((prev) => ({ ...prev, selfLearning }))
              }
            />
          </Suspense>
        )}

        <ConfirmDialog
          open={showSecurityNotice}
          title="Усилены настройки безопасности"
          message={
            'По умолчанию режим доступа теперь: «Принимать правки, спрашивать команды» вместо «Без подтверждений». Это требует подтверждения для команд и скриптов. Ты можешь изменить это в настройках.\n\nТакже включена песочница (sandbox) и добавлена проверка на скрипты .ps1 и .bat.'
          }
          confirmLabel="ОК"
          onConfirm={() => setShowSecurityNotice(false)}
          onCancel={() => setShowSecurityNotice(false)}
        />

        <ConfirmDialog
          open={!!confirmReq}
          title="Подтвердите действие агента"
          message={
            confirmReq
              ? `Инструмент: ${confirmReq.toolName}\n\n${confirmReq.toolInput.slice(0, 800)}`
              : ''
          }
          confirmLabel="Выполнить"
          onConfirm={() => resolveConfirm(true)}
          onCancel={() => resolveConfirm(false)}
        />

        <CrashRecoveryDialog
          recovery={crashRecovery}
          chatTitle={
            crashRecovery
              ? (chatStore?.chats.find((c) => c.id === crashRecovery.activeChatId)?.title ?? null)
              : null
          }
          onRestore={() => void handleCrashRestore()}
          onDismiss={() => setCrashRecovery(null)}
        />
      </div>
    </ChatContext.Provider>
  )
}
