import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { formatElapsed, formatTokenCount } from '../shared/generationMetrics'
import { AgentProvider, useAgentState } from './contexts/AgentContext'
import { ChatHistoryPanel, type AgentMode } from './components/ChatHistoryPanel'
import { OllamaDownloadStatus } from './components/OllamaDownloadStatus'
import { ConfirmDialog } from './components/ConfirmDialog'
import { CrashRecoveryDialog } from './components/CrashRecoveryDialog'

const TerminalPanel = lazy(() =>
  import('./components/TerminalPanel').then((m) => ({ default: m.TerminalPanel }))
)
const PrStatusPanel = lazy(() =>
  import('./components/PrStatusPanel').then((m) => ({ default: m.PrStatusPanel }))
)
const SettingsModal = lazy(() =>
  import('./components/SettingsModal').then((m) => ({ default: m.SettingsModal }))
)
import { useOllamaDownloadQueue } from './hooks/useOllamaDownloadQueue'
import { deriveChatTitle } from '../shared/chatTitle'
import { DEEPSEEK_API_BASE_URL } from '../shared/constants'
import { makeId } from '../shared/makeId'

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
      <AppContent />
    </AgentProvider>
  )
}

function AppContent() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS)
  const [ollamaOnline, setOllamaOnline] = useState(false)
  const [models, setModels] = useState<OllamaModel[]>([])
  const [chatStore, setChatStore] = useState<ChatStore | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatBusy, setChatBusy] = useState(false)
  const { runStats } = useAgentState()
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0)
  const [skillsRefreshKey, setSkillsRefreshKey] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [prPanelOpen, setPrPanelOpen] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [settingsReady, setSettingsReady] = useState(false)
  const [confirmReq, setConfirmReq] = useState<AgentConfirmRequest | null>(null)
  const [lightMode, setLightMode] = useState(false)
  const [showSecurityNotice, setShowSecurityNotice] = useState(false)
  const [crashRecovery, setCrashRecovery] = useState<AppState | null>(null)
  const [agentMode, setAgentMode] = useState<AgentMode>('code')
  const activeChatIdRef = useRef(activeChatId)
  const messagesRef = useRef(messages)
  const chatPanelRef = useRef<ChatPanelHandle>(null)

  activeChatIdRef.current = activeChatId
  messagesRef.current = messages

  const activeChat = useMemo(
    () => chatStore?.chats.find((chat) => chat.id === activeChatId) ?? null,
    [chatStore, activeChatId]
  )
  const activeProjectPath = activeChat?.projectPath ?? ''

  const flushCurrentChat = useCallback(async () => {
    const chatId = activeChatIdRef.current
    const chatMessages = messagesRef.current
    if (!chatId) return

    const title = deriveChatTitle(chatMessages)
    await window.codeviper.updateChat(chatId, {
      messages: chatMessages,
      ...(title ? { title } : {})
    })
  }, [])

  const refreshChatStore = useCallback(async () => {
    const store = await window.codeviper.getChatStore()
    setChatStore(store)
    return store
  }, [])

  const refreshOllama = useCallback(async () => {
    const provider = settings.modelProvider

    // Ollama статус проверяем всегда — он виден в хидере независимо от провайдера
    const online = await window.codeviper.checkOllama(settings.ollamaUrl)
    setOllamaOnline(online)

    if (provider === 'deepseek') {
      // Для облачного провайдера: загружаем список моделей с API DeepSeek
      try {
        const list = await window.codeviper.listProviderModels({
          type: 'deepseek',
          baseUrl: DEEPSEEK_API_BASE_URL,
          apiKey: settings.providerApiKey
        })
        const ollamaModels = list.map((m) => ({ name: m.name, size: m.size ?? 0, modifiedAt: '' }))
        setModels(ollamaModels)
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
  }, [settings.ollamaUrl, settings.modelProvider, settings.providerApiKey])

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
        if (!localStorage.getItem('cv-security-notice-seen')) {
          setShowSecurityNotice(true)
          localStorage.setItem('cv-security-notice-seen', 'true')
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
      setMessages(chat.messages)
    })
  }, [settingsReady]) // eslint-disable-line react-hooks/exhaustive-deps -- функции переопределяются на каждый рендер

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
      if (chatBusy) return
      if (id === activeChatId) return

      await flushCurrentChat()

      const store = chatStore ?? (await refreshChatStore())
      const chat = store.chats.find((item) => item.id === id)
      if (!chat) return

      setActiveChatId(id)
      setMessages(chat.messages)
      await window.codeviper.setActiveChat(id)
      setChatStore(await window.codeviper.getChatStore())
    },
    [chatBusy, activeChatId, chatStore, flushCurrentChat, refreshChatStore]
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

      const chat = await window.codeviper.createChat(folderId)
      await refreshChatStore()
      setActiveChatId(chat.id)
      setMessages([])
    },
    [flushCurrentChat, refreshChatStore]
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
      const store = await refreshChatStore()
      if (activeChatId === id) {
        const next = store.chats[0]
        setActiveChatId(next?.id ?? null)
        setMessages(next?.messages ?? [])
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <span>🐍 CodeViper</span>
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
        {runStats && (
          <div className="topbar-run-stats">
            {formatElapsed(runStats.elapsedSec)}
            {runStats.tokens > 0 && <> · {formatTokenCount(runStats.tokens)} tok</>}
          </div>
        )}
        <div className="topbar-path">{activeChat?.title ?? 'Новый чат'}</div>
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
          <button className="btn" onClick={() => setSettingsOpen(true)} title="Настройки (Ctrl+,)">
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
            store={chatStore}
            activeChatId={activeChatId}
            chatBusy={chatBusy}
            mode={agentMode}
            onModeChange={setAgentMode}
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
          <ChatPanel
            ref={chatPanelRef}
            settings={{
              ...settings,
              // В режиме Chat включаем clarifyMode — агент уточняет прежде чем действовать
              clarifyMode: agentMode === 'chat' ? true : settings.clarifyMode
            }}
            projectPath={activeProjectPath}
            chatId={activeChatId}
            messages={messages}
            onMessagesChange={setMessages}
            onBusyChange={setChatBusy}
            onPickProject={pickProjectForActiveChat}
            models={models}
            onModelChange={(model, auto) =>
              setSettings((prev) => ({ ...prev, model, autoModel: auto }))
            }
            onOpenSettings={() => setSettingsOpen(true)}
            onEnqueueModel={downloadQueue.enqueue}
            onRefreshOllama={refreshOllama}
            onLearningSaved={() => {
              setMemoryRefreshKey((key) => key + 1)
              setSkillsRefreshKey((key) => key + 1)
            }}
            interruptedDraft={activeChat?.interruptedDraft}
            onInterruptedDraftChange={refreshChatStore}
          />

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
                <PrStatusPanel />
              </Suspense>
            </div>
          )}
        </section>
      </div>

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
  )
}
