import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initTraceBuffer } from './traceBuffer'
import logoUrl from '../resources/icon.png'
import type {
  AgentConfirmRequest,
  AgentClarifyRequest,
  AgentSettings,
  AppState,
  ChatMessage,
  ChatStore,
  OllamaModel
} from './types'
import { filterToolCallingModels, isToolCallingModel } from './types'
import { ChatPanel, type ChatPanelHandle } from './components/ChatPanel'
import { useMemo } from 'react'
import type { SetStateAction } from 'react'
import { AgentProvider } from './contexts/AgentContext'
import { ChatContext, type ChatContextValue } from './contexts/ChatContext'
import { QueueProvider, useChatBusy } from './contexts/QueueContext'
import { ChatHistoryPanel, type AgentMode } from './components/ChatHistoryPanel'
import { CHAT_TEMPLATES } from '../shared/chatTemplates'
import { ProjectTreePanel } from './components/ProjectTreePanel'
import { FilePreviewPanel } from './components/FilePreviewPanel'
import { OllamaDownloadStatus } from './components/OllamaDownloadStatus'
import { UpdateBanner, applyUpdateInfo } from './components/UpdateBanner'
import type { PendingUpdates } from '../shared/updateBannerView'
import { ConfirmDialog } from './components/ConfirmDialog'
import { PromptDialog } from './components/PromptDialog'
import { CrashRecoveryDialog } from './components/CrashRecoveryDialog'
import { OnboardingWizard } from './components/OnboardingWizard'
import { ToastProvider, useToast } from './components/Toast'
import { useAgentWaitingApprovalNotify } from './hooks/useAgentWaitingApprovalNotify'

const TerminalPanel = lazy(() =>
  import('./components/TerminalPanel').then((m) => ({ default: m.TerminalPanel }))
)
const TracePanel = lazy(() =>
  import('./components/TracePanel').then((m) => ({ default: m.TracePanel }))
)
const MetricsPanel = lazy(() =>
  import('./components/MetricsPanel').then((m) => ({ default: m.MetricsPanel }))
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
import {
  CUSTOM_API_BASE_URL,
  DEEPSEEK_API_BASE_URL,
  GEMINI_API_BASE_URL
} from '../shared/constants'
import { makeId } from '../shared/makeId'
import { tronStorage } from './lib/tron'
import { PanelResizer } from './components/PanelResizer'
import {
  adjustSidePanelWidth,
  mapOuterPanelResizeDelta,
  type SidePanelWidths
} from './lib/sidePanelWidths'
import { defaultUiLayoutState, mergeUiLayoutState, type UiLayoutPanels } from '../shared/uiLayout'
import { loadUiLayoutWithMigration, scheduleSaveUiLayout } from './lib/uiLayoutPersistence'
import { QuickOpenPalette } from './components/QuickOpenPalette'
import { touchRecentProject } from '../shared/recentProjects'

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
    <ErrorBoundary>
      <ToastProvider>
        <AgentProvider>
          <QueueProvider>
            <AppContent />
          </QueueProvider>
        </AgentProvider>
      </ToastProvider>
    </ErrorBoundary>
  )
}

function McpHealthToastListener() {
  const { toast } = useToast()

  useEffect(() => {
    return window.codeviper.onMcpHealthStatus(({ results }) => {
      const failures = results.filter((r) => !r.ok)
      if (failures.length === 0) return
      if (failures.length === 1) {
        toast(`MCP-сервер недоступен: ${failures[0].url}`, 'error')
        return
      }
      toast(`Недоступно MCP-серверов: ${failures.length}`, 'error')
    })
  }, [toast])

  return null
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
  const [quickOpenOpen, setQuickOpenOpen] = useState(false)
  const initialLayout = defaultUiLayoutState()
  const layoutRef = useRef(initialLayout)
  const [terminalOpen, setTerminalOpen] = useState(initialLayout.panels.terminalOpen)
  const [prPanelOpen, setPrPanelOpen] = useState(initialLayout.panels.prPanelOpen)
  const [tracePanelOpen, setTracePanelOpen] = useState(initialLayout.panels.tracePanelOpen)
  const [metricsPanelOpen, setMetricsPanelOpen] = useState(initialLayout.panels.metricsPanelOpen)
  const [previewOpen, setPreviewOpen] = useState(initialLayout.panels.previewOpen)
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [sidePanelWidths, setSidePanelWidths] = useState(initialLayout.sidePanelWidths)
  const [fileTreeOpen, setFileTreeOpen] = useState(initialLayout.panels.fileTreeOpen)

  const persistLayout = useCallback(
    (patch: { panels?: Partial<UiLayoutPanels>; sidePanelWidths?: Partial<SidePanelWidths> }) => {
      layoutRef.current = mergeUiLayoutState(layoutRef.current, patch)
      scheduleSaveUiLayout(layoutRef.current)
    },
    []
  )

  useEffect(() => {
    void loadUiLayoutWithMigration().then((layout) => {
      layoutRef.current = layout
      setSidePanelWidths(layout.sidePanelWidths)
      setFileTreeOpen(layout.panels.fileTreeOpen)
      setTerminalOpen(layout.panels.terminalOpen)
      setPrPanelOpen(layout.panels.prPanelOpen)
      setTracePanelOpen(layout.panels.tracePanelOpen)
      setMetricsPanelOpen(layout.panels.metricsPanelOpen)
      setPreviewOpen(layout.panels.previewOpen)
    })
  }, [])

  useEffect(() => initTraceBuffer(), [])

  const toggleFileTree = useCallback(
    (open?: boolean) => {
      setFileTreeOpen((prev) => {
        const next = open ?? !prev
        persistLayout({ panels: { fileTreeOpen: next } })
        return next
      })
    },
    [persistLayout]
  )

  const togglePanel = useCallback(
    (key: keyof UiLayoutPanels, current: boolean) => {
      const next = !current
      persistLayout({ panels: { [key]: next } })
      return next
    },
    [persistLayout]
  )

  const openFilePreview = useCallback(
    (relativePath: string) => {
      setPreviewPath(relativePath)
      setPreviewOpen(true)
      persistLayout({ panels: { previewOpen: true } })
    },
    [persistLayout]
  )

  const resizeHistoryWidth = useCallback(
    (deltaX: number) => {
      setSidePanelWidths((prev) => {
        const next = {
          ...prev,
          history: adjustSidePanelWidth(prev.history, deltaX)
        }
        persistLayout({ sidePanelWidths: next })
        return next
      })
    },
    [persistLayout]
  )

  const resizePreviewWidth = useCallback(
    (deltaX: number) => {
      setSidePanelWidths((prev) => {
        const next = {
          ...prev,
          preview: adjustSidePanelWidth(prev.preview, mapOuterPanelResizeDelta(deltaX))
        }
        persistLayout({ sidePanelWidths: next })
        return next
      })
    },
    [persistLayout]
  )

  const resizeMetricsWidth = useCallback(
    (deltaX: number) => {
      setSidePanelWidths((prev) => {
        const next = {
          ...prev,
          metrics: adjustSidePanelWidth(prev.metrics, mapOuterPanelResizeDelta(deltaX))
        }
        persistLayout({ sidePanelWidths: next })
        return next
      })
    },
    [persistLayout]
  )

  const resizeTraceWidth = useCallback(
    (deltaX: number) => {
      setSidePanelWidths((prev) => {
        const next = {
          ...prev,
          trace: adjustSidePanelWidth(prev.trace, mapOuterPanelResizeDelta(deltaX))
        }
        persistLayout({ sidePanelWidths: next })
        return next
      })
    },
    [persistLayout]
  )

  const resizeBetweenMetricsAndTrace = useCallback(
    (deltaX: number) => {
      setSidePanelWidths((prev) => {
        const metrics = adjustSidePanelWidth(prev.metrics, deltaX)
        const trace = adjustSidePanelWidth(prev.trace, -deltaX)
        if (metrics === prev.metrics && trace === prev.trace) return prev
        const next = { ...prev, metrics, trace }
        persistLayout({ sidePanelWidths: next })
        return next
      })
    },
    [persistLayout]
  )
  const [pendingUpdates, setPendingUpdates] = useState<PendingUpdates>({
    release: null,
    runtime: null,
    git: null
  })
  const [installingUpdate, setInstallingUpdate] = useState(false)
  const [settingsReady, setSettingsReady] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [confirmReq, setConfirmReq] = useState<AgentConfirmRequest | null>(null)
  const [clarifyReq, setClarifyReq] = useState<AgentClarifyRequest | null>(null)
  const [dangerApprovalPending, setDangerApprovalPending] = useState(false)
  const { toast } = useToast()

  const hasPendingPreview = useMemo(
    () => messages.some((m) => m.previewStatus === 'pending' && m.previewId),
    [messages]
  )
  const pendingApproval = Boolean(
    confirmReq || clarifyReq || hasPendingPreview || dangerApprovalPending
  )
  const notifyWaitingApproval = useCallback((message: string) => toast(message, 'info'), [toast])
  useAgentWaitingApprovalNotify(pendingApproval, notifyWaitingApproval)

  const [ollamaFallbackUrl, setOllamaFallbackUrl] = useState<string | null>(null)
  const lightMode = settings.uiLightMode === true
  const [incognitoMode, setIncognitoMode] = useState(false)
  const incognitoModeRef = useRef(false)
  incognitoModeRef.current = incognitoMode
  const [incognitoChatIds, setIncognitoChatIds] = useState(new Set<string>())
  const incognitoChatIdsRef = useRef(new Set<string>())
  incognitoChatIdsRef.current = incognitoChatIds
  const [showSecurityNotice, setShowSecurityNotice] = useState(false)
  const [crashRecovery, setCrashRecovery] = useState<AppState | null>(null)
  const [externalLinkConfirmUrl, setExternalLinkConfirmUrl] = useState<string | null>(null)
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
    if (incognitoChatIdsRef.current.has(chatId)) return
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

    if (provider === 'custom') {
      try {
        const list = await window.codeviper.listProviderModels({
          type: 'custom',
          baseUrl: settings.customBaseUrl || CUSTOM_API_BASE_URL,
          apiKey: settings.customApiKey,
          model: settings.model
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
    settings.geminiApiKey,
    settings.customBaseUrl,
    settings.customApiKey,
    settings.model
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
        if (!window.codeviper.isE2e && !tronStorage.getItem('cv-security-notice-seen')) {
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
    if (!settingsReady || window.codeviper.isE2e) return
    if (settings.firstRunCompleted !== true) {
      setOnboardingOpen(true)
    }
  }, [settingsReady, settings.firstRunCompleted])

  const completeFirstRun = useCallback((patch?: Partial<AgentSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch, firstRunCompleted: true }
      void window.codeviper.saveSettings(next)
      return next
    })
  }, [])

  useEffect(() => {
    return window.codeviper.onAgentConfirm((request) => setConfirmReq(request))
  }, [])

  useEffect(() => {
    return window.codeviper.onAgentClarify((request) => setClarifyReq(request))
  }, [])

  useEffect(() => {
    return window.codeviper.onUpdateAvailable((info) =>
      setPendingUpdates((prev) => applyUpdateInfo(prev, info))
    )
  }, [])

  useEffect(() => {
    return window.codeviper.onRuntimeUpdateReady((info) =>
      setPendingUpdates((prev) => applyUpdateInfo(prev, info))
    )
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

  const resolveConfirm = useCallback(
    (approved: boolean) => {
      if (!confirmReq) return
      window.codeviper.respondAgentConfirm(confirmReq.id, approved)
      setConfirmReq(null)
    },
    [confirmReq]
  )

  const resolveClarify = useCallback(
    (answer: string | null) => {
      if (!clarifyReq) return
      window.codeviper.respondAgentClarify(clarifyReq.id, answer)
      setClarifyReq(null)
    },
    [clarifyReq]
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

  const recordRecentProject = useCallback((projectPath: string) => {
    setSettings((prev) => ({
      ...prev,
      recentProjects: touchRecentProject(prev.recentProjects, projectPath)
    }))
  }, [])

  const openProjectForActiveChat = useCallback(
    async (folder: string) => {
      if (!activeChatId || chatBusy) return
      if (messages.length > 0) return
      recordRecentProject(folder)
      await window.codeviper.updateChat(activeChatId, { projectPath: folder })
      await refreshChatStore()
    },
    [activeChatId, chatBusy, messages.length, recordRecentProject, refreshChatStore]
  )

  const pickProjectForActiveChat = useCallback(async () => {
    if (!activeChatId || chatBusy || messages.length > 0) return
    const folder = await window.codeviper.selectProjectFolder()
    if (!folder) return
    await openProjectForActiveChat(folder)
  }, [activeChatId, chatBusy, messages.length, openProjectForActiveChat])

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
      if (incognitoModeRef.current) {
        setIncognitoChatIds((prev) => new Set(prev).add(chat.id))
      }
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

  const pickProjectFromOnboarding = useCallback(async () => {
    let chatId = activeChatId
    if (!chatId) {
      await createChat()
      chatId = activeChatIdRef.current
    }
    if (!chatId) return
    const folder = await window.codeviper.selectProjectFolder()
    if (!folder) return
    recordRecentProject(folder)
    await window.codeviper.updateChat(chatId, { projectPath: folder })
    await refreshChatStore()
  }, [activeChatId, createChat, recordRecentProject, refreshChatStore])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        setQuickOpenOpen(true)
        return
      }
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
        return
      }
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault()
        chatPanelRef.current?.focusInput()
        return
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        void createChat()
        return
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        toggleFileTree()
        return
      }
      if (e.ctrlKey && !e.shiftKey && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault()
        setTerminalOpen((open) => togglePanel('terminalOpen', open))
        return
      }
      if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const tag = (e.target as HTMLElement).tagName
        const editable = (e.target as HTMLElement).isContentEditable
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !editable) {
          e.preventDefault()
          setShortcutsOpen((v) => !v)
        }
        return
      }
      if (e.key === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (quickOpenOpen) {
          e.preventDefault()
          setQuickOpenOpen(false)
          return
        }
        if (shortcutsOpen) {
          e.preventDefault()
          setShortcutsOpen(false)
          return
        }
        if (settingsOpen) {
          e.preventDefault()
          setSettingsOpen(false)
          return
        }
        e.preventDefault()
        void window.codeviper.stopAgent(activeChatIdRef.current ?? '')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    createChat,
    toggleFileTree,
    togglePanel,
    settingsOpen,
    shortcutsOpen,
    quickOpenOpen,
    busyChats
  ])

  const createChatFromTemplate = useCallback(
    async (templateId: string, folderId: string | null = null) => {
      await flushCurrentChat()

      const tpl = CHAT_TEMPLATES.find((t) => t.id === templateId)
      const chat = await window.codeviper.createChat(folderId, agentModeRef.current)
      if (incognitoModeRef.current) {
        setIncognitoChatIds((prev) => new Set(prev).add(chat.id))
      }
      await refreshChatStore()
      lastActiveChatPerMode.current[agentModeRef.current] = chat.id
      setActiveChatId(chat.id)
      setChatMessages((prev) => {
        const next = new Map(prev)
        const systemMsg: ChatMessage = {
          id: `tpl-${chat.id}`,
          role: 'system',
          content: tpl ? tpl.prompt : '',
          timestamp: Date.now()
        }
        next.set(chat.id, tpl ? [systemMsg] : [])
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
      recordRecentProject(folder)
      await window.codeviper.updateChatFolder(id, { projectPath: folder })
      await refreshChatStore()
    },
    [recordRecentProject, refreshChatStore]
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
      <McpHealthToastListener />
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
              onClick={() => setTerminalOpen((open) => togglePanel('terminalOpen', open))}
              disabled={!activeProjectPath}
              title={activeProjectPath ? undefined : 'Сначала выберите проект в чате'}
            >
              Терминал
            </button>
            <button
              className={`btn ${prPanelOpen ? 'active' : ''}`}
              onClick={() => setPrPanelOpen((open) => togglePanel('prPanelOpen', open))}
              title="Статус Pull Requests"
            >
              PR
            </button>
            <button
              className="btn"
              title={lightMode ? 'Тёмная тема' : 'Светлая тема'}
              onClick={() => setSettings((prev) => ({ ...prev, uiLightMode: !prev.uiLightMode }))}
            >
              {lightMode ? '🌙' : '☀️'}
            </button>
            <button
              className={`btn${incognitoMode ? ' active' : ''}`}
              title={
                incognitoMode
                  ? 'Инкогнито включён — чаты не сохраняются'
                  : 'Включить режим инкогнито'
              }
              onClick={() => setIncognitoMode((v) => !v)}
            >
              {incognitoMode ? '🕶️' : '👁️'}
            </button>
            <button
              className={`btn ${previewOpen ? 'active' : ''}`}
              onClick={() => setPreviewOpen((open) => togglePanel('previewOpen', open))}
              title="Превью файла — панель справа от чата"
            >
              Превью
            </button>
            <button
              className={`btn ${tracePanelOpen ? 'active' : ''}`}
              onClick={() => setTracePanelOpen((open) => togglePanel('tracePanelOpen', open))}
              title="Трассировка агента — сырой лог всех запросов к модели"
            >
              Трасса
            </button>
            <button
              className={`btn ${metricsPanelOpen ? 'active' : ''}`}
              onClick={() => setMetricsPanelOpen((open) => togglePanel('metricsPanelOpen', open))}
              title="Метрики агента — токены, стоимость, статистика прогонов"
            >
              Метрики
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

        {(pendingUpdates.release || pendingUpdates.runtime || pendingUpdates.git) && (
          <UpdateBanner
            updates={pendingUpdates}
            installing={installingUpdate}
            onInstall={() => {
              setInstallingUpdate(true)
              window.codeviper.installUpdate()
            }}
            onInstallRuntime={() => {
              setInstallingUpdate(true)
              window.codeviper.installRuntimeUpdate()
            }}
            onDismiss={() => {
              if (pendingUpdates.runtime) {
                window.codeviper.dismissRuntimeUpdate()
              }
              setPendingUpdates((prev) => ({
                ...prev,
                runtime: null,
                release: null,
                git: null
              }))
            }}
          />
        )}

        <div
          className="layout"
          style={{ ['--panel-history-width' as string]: `${sidePanelWidths.history}px` }}
        >
          <section className="panel panel-history">
            <div className="panel-header panel-header-recent">
              <span>Недавние</span>
              <span className="panel-header-recent-icon" aria-hidden="true">
                ⏰
              </span>
            </div>
            <ChatHistoryPanel
              mode={agentMode}
              onModeChange={handleModeChange}
              onSelectChat={selectChat}
              onCreateChat={createChat}
              onCreateChatFromTemplate={createChatFromTemplate}
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

          <PanelResizer onDrag={resizeHistoryWidth} className="panel-resizer-history" />

          {activeProjectPath && !fileTreeOpen && (
            <div className="panel-tree-collapsed">
              <button
                type="button"
                className="btn panel-header-tree-toggle panel-tree-expand-toggle"
                onClick={() => toggleFileTree(true)}
                title="Показать дерево файлов (Ctrl+B)"
                aria-label="Показать дерево файлов"
              >
                ▶
              </button>
            </div>
          )}

          {activeProjectPath && fileTreeOpen && (
            <section className="panel panel-tree">
              <div className="panel-header panel-header-tree">
                <span>Файлы</span>
                <button
                  type="button"
                  className="btn panel-header-tree-toggle"
                  onClick={() => toggleFileTree(false)}
                  title="Скрыть дерево файлов"
                  aria-label="Скрыть дерево файлов"
                >
                  ◀
                </button>
              </div>
              <ProjectTreePanel
                projectPath={activeProjectPath}
                onAskAgent={(path) => chatPanelRef.current?.insertFileMention(path)}
                onFileOpen={openFilePreview}
                ollamaUrl={settings.ollamaUrl}
                qdrantUrl={settings.qdrantUrl}
                qdrantApiKey={settings.qdrantApiKey}
              />
            </section>
          )}

          <section className="panel panel-main">
            <div className="panel-header">Агент</div>
            {mountedChatIds.map((chatId) => (
              <ChatContext.Provider key={chatId} value={mountedChatContexts.get(chatId)!}>
                <div
                  style={chatId === activeChatId ? { display: 'contents' } : { display: 'none' }}
                >
                  <ChatPanel
                    ref={chatId === activeChatId ? chatPanelRef : undefined}
                    isVisible={chatId === activeChatId}
                    settings={{
                      ...settings,
                      // В режиме Chat включаем clarifyMode — агент уточняет прежде чем действовать
                      clarifyMode: agentMode === 'chat' ? true : settings.clarifyMode,
                      chatMode: agentMode === 'chat'
                    }}
                    onPickProject={pickProjectForActiveChat}
                    onOpenRecentProject={(path) => void openProjectForActiveChat(path)}
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
                    onExternalLink={setExternalLinkConfirmUrl}
                    onOllamaFallbackOffer={(url) => setOllamaFallbackUrl(url)}
                    onDangerPendingChange={setDangerApprovalPending}
                    incognito={incognitoChatIds.has(chatId)}
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
                    onClick={() => {
                      setTerminalOpen(false)
                      persistLayout({ panels: { terminalOpen: false } })
                    }}
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
                    onClick={() => {
                      setPrPanelOpen(false)
                      persistLayout({ panels: { prPanelOpen: false } })
                    }}
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

          {previewOpen && (
            <>
              <PanelResizer onDrag={resizePreviewWidth} className="panel-resizer-preview" />
              <section className="panel panel-preview" style={{ width: sidePanelWidths.preview }}>
                {activeProjectPath && previewPath ? (
                  <FilePreviewPanel
                    projectPath={activeProjectPath}
                    filePath={previewPath}
                    onClose={() => setPreviewPath(null)}
                  />
                ) : (
                  <>
                    <div className="panel-header">Превью</div>
                    <div className="panel-preview-placeholder hint">
                      Выберите файл в дереве слева
                    </div>
                  </>
                )}
              </section>
            </>
          )}

          {metricsPanelOpen && (
            <>
              <PanelResizer onDrag={resizeMetricsWidth} />
              <section className="panel panel-trace" style={{ width: sidePanelWidths.metrics }}>
                <Suspense fallback={null}>
                  <MetricsPanel />
                </Suspense>
              </section>
            </>
          )}

          {metricsPanelOpen && tracePanelOpen && (
            <PanelResizer onDrag={resizeBetweenMetricsAndTrace} />
          )}

          {tracePanelOpen && (
            <>
              {!metricsPanelOpen && <PanelResizer onDrag={resizeTraceWidth} />}
              <section className="panel panel-trace" style={{ width: sidePanelWidths.trace }}>
                <Suspense fallback={null}>
                  <TracePanel
                    chatId={activeChatId}
                    projectPath={activeProjectPath}
                    onReplayFromStep={(stepTs, userMessage) => {
                      const msgs = messagesRef.current
                      let userMsgIndex = -1
                      for (let i = msgs.length - 1; i >= 0; i--) {
                        const m = msgs[i]
                        if (
                          m.role === 'user' &&
                          m.content === userMessage &&
                          m.timestamp <= stepTs
                        ) {
                          userMsgIndex = i
                          break
                        }
                      }
                      if (userMsgIndex < 0) return
                      const userMsg = msgs[userMsgIndex]
                      const preRunHistory = msgs.slice(0, userMsgIndex)
                      const intermediateMessages = msgs
                        .slice(userMsgIndex + 1)
                        .filter((m) => m.timestamp < stepTs)
                      chatPanelRef.current?.replayFromStep(
                        [...preRunHistory, ...intermediateMessages],
                        userMsg.content
                      )
                    }}
                  />
                </Suspense>
              </section>
            </>
          )}
        </div>

        <QuickOpenPalette
          open={quickOpenOpen}
          projectPath={activeProjectPath}
          onClose={() => setQuickOpenOpen(false)}
          onFileOpen={openFilePreview}
        />

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

        <OnboardingWizard
          open={onboardingOpen}
          settings={settings}
          models={models}
          ollamaOnline={ollamaOnline}
          onSettingsChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
          onCompleteFirstRun={completeFirstRun}
          onPickProject={pickProjectFromOnboarding}
          onComplete={() => setOnboardingOpen(false)}
        />

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

        <PromptDialog
          open={!!clarifyReq}
          title="Агент уточняет"
          label={clarifyReq?.question}
          confirmLabel="Ответить"
          onConfirm={(answer) => resolveClarify(answer)}
          onCancel={() => resolveClarify(null)}
        />

        <ConfirmDialog
          open={!!ollamaFallbackUrl}
          title="Переключиться на локальную Ollama?"
          message={`Облачный провайдер временно недоступен (слишком много ошибок подряд).\n\nОбнаружена локальная Ollama: ${ollamaFallbackUrl ?? ''}\n\nПереключить модель на Ollama и продолжить?`}
          confirmLabel="Переключить"
          onConfirm={() => {
            if (ollamaFallbackUrl) {
              setSettings((prev) => ({
                ...prev,
                modelProvider: 'ollama',
                ollamaUrl: ollamaFallbackUrl
              }))
            }
            setOllamaFallbackUrl(null)
          }}
          onCancel={() => setOllamaFallbackUrl(null)}
        />

        <ConfirmDialog
          open={!!externalLinkConfirmUrl}
          title="Открыть внешнюю ссылку?"
          message={
            externalLinkConfirmUrl
              ? `CodeViper собирается открыть ссылку во внешнем браузере:\n\n${externalLinkConfirmUrl}`
              : ''
          }
          confirmLabel="Открыть"
          onConfirm={() => {
            if (externalLinkConfirmUrl) {
              void window.codeviper.openExternal(externalLinkConfirmUrl)
            }
            setExternalLinkConfirmUrl(null)
          }}
          onCancel={() => setExternalLinkConfirmUrl(null)}
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
