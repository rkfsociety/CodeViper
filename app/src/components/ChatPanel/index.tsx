import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { makeId } from '../../../shared/makeId'
import type {
  AgentSettings,
  ChatMessage,
  OllamaModel,
  ProgressInfo,
  SelfImprovementPlanItem,
  TodoItem
} from '../../types'
import { filterToolCallingModels } from '../../types'
import { filterAgentCapableModels } from '../../../shared/recommendedModels'
import { GEMINI_FREE_MODELS, filterOpenRouterModelsByTier } from '../../../shared/constants'
import { expandSlashCommand, matchSlashCommands } from '../../../shared/slashCommands'
import type { SlashCommand } from '../../../shared/slashCommands'
import styles from '../ChatPanel.module.css'
import { AgentContextModal } from '../AgentContextModal'
import { AgentPrerequisitesBanner } from '../AgentPrerequisitesBanner'
import { InterruptedDraftBanner } from '../InterruptedDraftBanner'
import type { ChatInputHandle } from '../ChatInput'
import { ConfirmDialog } from '../ConfirmDialog'
import { useContextPreview } from '../../hooks/useContextPreview'
import { useAgentStream } from '../../hooks/useAgentStream'
import { useToast } from '../Toast'
import {
  useMessageQueue,
  type PrerequisiteBlock,
  type DangerBlock
} from '../../hooks/useMessageQueue'
import { useAgentDispatch, useAgentState } from '../../contexts/AgentContext'
import { useChatContext } from '../../contexts/ChatContext'
import { useChatBusy } from '../../contexts/QueueContext'
import { useAppStateSync } from '../../hooks/useAppStateSync'
import { CLOUD_KNOWN_MODELS, FILE_LIMIT, shouldShowAssistantMessage } from './helpers'
import type { DroppedFile } from './ChatInput'
import { ChatPanelMessagesPane } from './ChatPanelMessagesPane'
import { ChatStatusBar } from './ChatStatusBar'

const FileTimelinePanel = lazy(() =>
  import('../FileTimelinePanel').then((m) => ({ default: m.FileTimelinePanel }))
)

export interface ChatPanelHandle {
  insertPath: (path: string) => void
  insertFileMention: (relativePath: string) => void
  focusInput: () => void
  replayFromStep: (history: ChatMessage[], userMessage: string) => void
}

interface Props {
  settings: AgentSettings
  onLearningSaved?: () => void
  onOllamaFallbackOffer?: (ollamaUrl: string) => void
  onPickProject: () => void
  models?: OllamaModel[]
  onModelChange?: (model: string, auto: boolean) => void
  onActiveModelChange?: (model: string) => void
  onSettingsChange?: (partial: Partial<AgentSettings>) => void
  onOpenSettings?: () => void
  onEnqueueModel?: (modelName: string) => void
  onRefreshOllama?: () => Promise<void>
  incognito?: boolean
  isVisible?: boolean
  onDangerPendingChange?: (pending: boolean) => void
}

export const ChatPanel = forwardRef<ChatPanelHandle, Props>(function ChatPanel(
  {
    settings,
    onLearningSaved,
    onOllamaFallbackOffer,
    onPickProject,
    models = [],
    onModelChange,
    onActiveModelChange,
    onSettingsChange,
    onOpenSettings,
    onEnqueueModel,
    onRefreshOllama,
    incognito = false,
    isVisible = true,
    onDangerPendingChange
  },
  ref
) {
  const {
    messages,
    setMessages,
    activeChatId: chatId,
    activeChat,
    activeProjectPath: projectPath,
    interruptedDraft,
    refreshChatStore: onInterruptedDraftChange
  } = useChatContext()
  const { markChatBusy } = useChatBusy()
  const [input, setInput] = useState('')
  const [droppedFiles, setDroppedFiles] = useState<{ name: string; path: string; size?: number }[]>(
    []
  )
  const [clipboardImages, setClipboardImages] = useState<{ name: string; dataUrl: string }[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [prerequisiteBlock, setPrerequisiteBlock] = useState<PrerequisiteBlock | null>(null)
  const [dangerBlock, setDangerBlock] = useState<DangerBlock | null>(null)

  useEffect(() => {
    onDangerPendingChange?.(Boolean(dangerBlock))
  }, [dangerBlock, onDangerPendingChange])
  const [contextModalOpen, setContextModalOpen] = useState(false)
  const [fileTimelinePath, setFileTimelinePath] = useState<string | null>(null)
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<ProgressInfo | null>(null)
  const [showQuickBar, setShowQuickBar] = useState(false)
  const [showLearningPanel, setShowLearningPanel] = useState(false)
  const [showRulesPanel, setShowRulesPanel] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const [contextPopoverOpen, setContextPopoverOpen] = useState(false)
  const contextPopoverRef = useRef<HTMLDivElement>(null)
  const [summarizing, setSummarizing] = useState(false)
  // contextPreview вынесен сюда чтобы и useAgentStream, и useContextPreview могли обновлять его
  const [contextPreview, setContextPreview] = useState<
    import('../../types').AgentContextPreview | null
  >(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [saveSkillDialog, setSaveSkillDialog] = useState<{
    content: string
    name: string
    saving: boolean
    result: string | null
  } | null>(null)
  const [todoItems, setTodoItems] = useState<TodoItem[] | null>(null)
  const [todoTitle, setTodoTitle] = useState<string | undefined>(undefined)
  const [indexingProgress, setIndexingProgress] = useState<ProgressInfo | null>(null)
  const [p2pCredits, setP2pCredits] = useState<number | null>(null)
  const [slashMenuIndex, setSlashMenuIndex] = useState(0)
  const [showRoadmapPanel, setShowRoadmapPanel] = useState(false)
  const setTodoItemsRef = useRef<((items: TodoItem[] | null, title?: string) => void) | undefined>(
    undefined
  )
  setTodoItemsRef.current = (items, title) => {
    setTodoItems(items)
    if (title !== undefined) setTodoTitle(title)
  }
  const [planItems, setPlanItems] = useState<SelfImprovementPlanItem[] | null>(null)
  const setPlanItemsRef = useRef<((items: SelfImprovementPlanItem[] | null) => void) | undefined>(
    undefined
  )
  setPlanItemsRef.current = (items) => setPlanItems(items)

  const chatInputRef = useRef<ChatInputHandle>(null)
  const messagesRef = useRef(messages)
  const chatIdRef = useRef(chatId)
  const projectPathRef = useRef(projectPath)
  const settingsRef = useRef(settings)
  const setMessagesRef = useRef(setMessages)
  const onLearningSavedRef = useRef(onLearningSaved)
  const onActiveModelChangeRef = useRef(onActiveModelChange)
  const onOllamaFallbackOfferRef = useRef(onOllamaFallbackOffer)
  onOllamaFallbackOfferRef.current = onOllamaFallbackOffer
  const { toast } = useToast()
  const onTraceReportRef = useRef<
    ((issueUrl: string, auto: boolean, title?: string) => void) | undefined
  >(undefined)
  onTraceReportRef.current = (issueUrl, auto, title) => {
    toast(
      auto
        ? `Агент отправил отчёт на GitHub${title ? `: ${title}` : ''}`
        : `Отчёт на GitHub${title ? `: ${title}` : ''}`,
      'info'
    )
    void window.codeviper.openExternal(issueUrl)
  }
  const incognitoRef = useRef(incognito)
  incognitoRef.current = incognito

  // Координационные рефы между хуками — созданы здесь, переданы в оба.
  const dispatch = useAgentDispatch()
  const { runModel, runStats, agentPhase } = useAgentState()

  const processNextQueuedRunRef = useRef<() => Promise<void>>(async () => {})
  const runIdRef = useRef(0)
  const doneRunIdRef = useRef(-1)
  const notificationsEnabledRef = useRef(false)
  const isVisibleChatRef = useRef(isVisible)
  const chatTitleRef = useRef('')

  isVisibleChatRef.current = isVisible
  notificationsEnabledRef.current = settings.soundNotifications === true
  chatTitleRef.current = activeChat?.title?.trim() || 'Чат'

  messagesRef.current = messages
  chatIdRef.current = chatId
  projectPathRef.current = projectPath
  settingsRef.current = settings
  setMessagesRef.current = setMessages
  onLearningSavedRef.current = onLearningSaved
  onActiveModelChangeRef.current = onActiveModelChange

  // Выбрать модели для селектора: локальные (Ollama) или облачные (Gemini, DeepSeek и т.д.)
  const pickerModels = useMemo(() => {
    const provider = settings.modelProvider ?? 'ollama'
    const isCloud = provider !== 'ollama'

    // Gemini free tier — только фиксированные бесплатные модели
    if (provider === 'gemini' && (settings.geminiTier ?? 'free') === 'free') {
      return GEMINI_FREE_MODELS.map((m) => ({ name: m.id, size: 0, modifiedAt: '' }))
    }

    if (provider === 'openrouter') {
      const tier = settings.openrouterTier ?? 'free'
      let filtered = filterOpenRouterModelsByTier(models, tier)
      if (filtered.length === 0 && models.length > 0) {
        filtered = models
      }
      const current = settings.model?.trim()
      if (current && !filtered.some((m) => m.name === current)) {
        const active = models.find((m) => m.name === current)
        if (active) filtered = [active, ...filtered]
      }
      return filtered
    }

    if (isCloud && provider in CLOUD_KNOWN_MODELS) {
      const known = CLOUD_KNOWN_MODELS[provider as keyof typeof CLOUD_KNOWN_MODELS]
      if (known.length > 0) {
        // Статический список для провайдеров без API каталога
        return known.map((name: string) => ({
          name,
          size: 0,
          modifiedAt: ''
        }))
      }
    }
    return models
  }, [settings.modelProvider, settings.geminiTier, settings.openrouterTier, settings.model, models])

  // Облако: список как есть. Ollama: все установленные модели (рекомендуемые — выше).
  const displayModels = useMemo(() => {
    const isCloud = (settings.modelProvider ?? 'ollama') !== 'ollama'
    if (isCloud) return pickerModels

    if (pickerModels.length === 0) {
      const current = settings.model?.trim()
      return current ? [{ name: current, size: 0, modifiedAt: '' }] : []
    }

    const toolModels = filterToolCallingModels(pickerModels)
    const codeMode = !settings.chatMode
    const preferred = codeMode ? filterAgentCapableModels(toolModels) : toolModels
    const preferredNames = new Set(preferred.map((m) => m.name))
    const toolNames = new Set(toolModels.map((m) => m.name))

    const sorted = [...pickerModels].sort((a, b) => {
      const rank = (name: string) => {
        if (preferredNames.has(name)) return 0
        if (toolNames.has(name)) return 1
        return 2
      }
      return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)
    })

    const current = settings.model?.trim()
    if (current && !sorted.some((m) => m.name === current)) {
      sorted.unshift({ name: current, size: 0, modifiedAt: '' })
    }

    return sorted
  }, [pickerModels, settings.modelProvider, settings.chatMode, settings.model])

  function commitMessages(next: ChatMessage[]) {
    messagesRef.current = next
    setMessagesRef.current(next)
  }

  function appendMessage(message: ChatMessage) {
    commitMessages([...messagesRef.current, message])
  }

  function upsertMessage(message: ChatMessage) {
    const index = messagesRef.current.findIndex((item) => item.id === message.id)
    if (index < 0) {
      appendMessage(message)
      return
    }
    const next = [...messagesRef.current]
    next[index] = message
    commitMessages(next)
  }

  const respondPreview = useCallback((messageId: string, previewId: string, apply: boolean) => {
    const msg = messagesRef.current.find((m) => m.id === messageId)
    if (!msg) return
    const index = messagesRef.current.findIndex((item) => item.id === messageId)
    if (index < 0) return
    const next = [...messagesRef.current]
    next[index] = { ...msg, previewStatus: apply ? 'applied' : 'cancelled' }
    messagesRef.current = next
    setMessagesRef.current(next)
    window.codeviper.respondAgentPreview(previewId, apply)
  }, [])

  // ── Хук: стрим событий агента ────────────────────────────────────────────
  const { draftRef, draftMessageIdRef, resetStreamState } = useAgentStream({
    chatIdRef,
    runIdRef,
    doneRunIdRef,
    onLearningSavedRef,
    onActiveModelChangeRef,
    onOllamaFallbackOfferRef,
    onTraceReportRef,
    processNextQueuedRunRef,
    appendMessage,
    upsertMessage,
    setContextPreview,
    notificationsEnabledRef,
    isVisibleChatRef,
    chatTitleRef,
    setTodoItemsRef,
    setPlanItemsRef,
    dispatch
  })

  async function handleSummarizeContext() {
    if (!chatId || summarizing || messages.length === 0) return
    setSummarizing(true)
    try {
      const result = await window.codeviper.summarizeContext(messages, settings)
      if (!result.droppedChatIds.length && !result.summary) return
      const kept = messages.filter((m) => !result.droppedChatIds.includes(m.id))
      const next: ChatMessage[] = result.summary
        ? [
            {
              id: `summary-${Date.now()}`,
              role: 'assistant',
              content: result.summary,
              timestamp: Date.now()
            },
            ...kept
          ]
        : kept
      commitMessages(next)
      await window.codeviper.updateChat(chatId, { messages: next })
    } catch {
      // игнорируем — пользователь увидит что ничего не изменилось
    } finally {
      setSummarizing(false)
      setContextPopoverOpen(false)
    }
  }

  // ── Хук: очередь сообщений и запуск агента ───────────────────────────────
  const handleInterruptedDraft = useCallback(
    async (partial: string, userMessage: string) => {
      if (!chatId) return
      try {
        await window.codeviper.updateChat(chatId, {
          interruptedDraft: { partial, userMessage, reason: 'timeout', timestamp: Date.now() }
        })
        onInterruptedDraftChange?.()
      } catch {
        // не прерываем основной поток ошибкой сохранения черновика
      }
    },
    [chatId, onInterruptedDraftChange]
  )

  const {
    submitMessage,
    confirmDangerRun,
    stopAgent,
    executeRun,
    replayRun,
    regenerateAssistantReply,
    resetQueue,
    getQueueSnapshot,
    queueSize,
    agentRunning,
    busy
  } = useMessageQueue({
    chatIdRef,
    projectPathRef,
    settingsRef,
    messagesRef,
    runIdRef,
    doneRunIdRef,
    processNextQueuedRunRef,
    appendMessage,
    replaceMessages: commitMessages,
    onRunStart: resetStreamState,
    onReset: resetStreamState,
    onBusyChange: (busy: boolean) => chatId && markChatBusy(chatId, busy),
    onPrerequisiteIssue: setPrerequisiteBlock,
    onDangerWarning: setDangerBlock,
    draftRef,
    onInterruptedDraft: handleInterruptedDraft,
    incognitoRef
  })

  // ── Превью контекста — только по открытию попапа/модалки (не при старте) ─
  const contextPreviewOpen = contextPopoverOpen || contextModalOpen
  useContextPreview(
    chatId,
    projectPath,
    messages,
    input,
    settings.model,
    busy,
    contextPreviewOpen,
    {
      onPreview: setContextPreview,
      onLoading: setContextLoading
    }
  )

  // ── Автосохранение состояния для восстановления после краша ─────────────
  useAppStateSync({ chatIdRef, projectPathRef, getQueueSnapshot })

  // ── Drag-and-drop файлов ─────────────────────────────────────────────────
  function handleDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    // Игнорируем уход на дочерние элементы
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    const entries = files.map((f) => ({
      name: f.name,
      path: (f as File & { path?: string }).path ?? f.name,
      size: f.size
    }))
    setDroppedFiles((prev) => {
      const existingPaths = new Set(prev.map((x) => x.path))
      const fresh = entries.filter((x) => !existingPaths.has(x.path))
      const slots = FILE_LIMIT - prev.length - clipboardImages.length
      return [...prev, ...fresh.slice(0, Math.max(0, slots))]
    })
    chatInputRef.current?.focus()
  }

  function removeDroppedFile(path: string) {
    setDroppedFiles((prev) => prev.filter((f) => f.path !== path))
  }

  function removeClipboardImage(name: string) {
    setClipboardImages((prev) => prev.filter((img) => img.name !== name))
  }

  // ── Вставка изображений из буфера обмена (Ctrl+V) ────────────────────────
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items)
    const imageItems = items.filter((item) => item.type.startsWith('image/'))
    if (!imageItems.length) return

    e.preventDefault()
    imageItems.forEach((item) => {
      const blob = item.getAsFile()
      if (!blob) return
      const img = new window.Image()
      const objectUrl = URL.createObjectURL(blob)
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(objectUrl)
        const dataUrl = canvas.toDataURL('image/png')
        const name = `screenshot-${Date.now()}.png`
        setClipboardImages((prev) => {
          const slots = FILE_LIMIT - droppedFiles.length - prev.length
          if (slots <= 0) return prev
          return [...prev, { name, dataUrl }]
        })
      }
      img.src = objectUrl
    })
  }

  // ── Сброс при смене чата ─────────────────────────────────────────────────
  useEffect(() => {
    setInput('')
    setDroppedFiles([])
    setClipboardImages([])
    setPrerequisiteBlock(null)
    setContextPreview(null)
    setTodoItems(null)
    setTodoTitle(undefined)
    setPlanItems(null)
    resetQueue()
  }, [chatId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Следим за тем, находится ли пользователь внизу чата — логика в ChatPanelMessagesPane
  const scrollToBottomRef = useRef<((force?: boolean) => void) | null>(null)

  useEffect(() => {
    if (!busy) {
      setProgress(null)
      return
    }
    return window.codeviper.onProgressEvent(setProgress)
  }, [busy])

  // Фоновая подписка на progress-события для автоиндексации (не зависит от busy)
  useEffect(() => {
    if (busy) return
    return window.codeviper.onProgressEvent((p) => {
      setIndexingProgress(p)
    })
  }, [busy])

  useEffect(() => {
    const url = settings.p2pServerUrl?.trim()
    const token = settings.p2pAuthToken?.trim()
    if (!url || !token) {
      setP2pCredits(null)
      return
    }
    let cancelled = false
    void window.codeviper.getP2pCredits(settings).then((result) => {
      if (!cancelled && result.ok) setP2pCredits(result.balance)
    })
    return () => {
      cancelled = true
    }
  }, [settings.p2pServerUrl, settings.p2pAuthToken, settings, busy])

  // Автоиндексация при смене проекта
  useEffect(() => {
    if (!projectPath || !settings.autoIndexOnOpen || !settings.qdrantUrl || !settings.ollamaUrl)
      return
    setIndexingProgress({ label: 'Индексация…', percent: 0 })
    void window.codeviper
      .autoIndexProject(projectPath, settings.ollamaUrl, settings.qdrantUrl, settings.qdrantApiKey)
      .catch(() => {})
      .finally(() => setIndexingProgress(null))
  }, [projectPath]) // eslint-disable-line react-hooks/exhaustive-deps -- намеренно только projectPath

  useEffect(() => {
    if (!modelPickerOpen) return
    function handleOutside(e: MouseEvent) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [modelPickerOpen])

  useEffect(() => {
    if (!contextPopoverOpen) return
    function handleOutside(e: MouseEvent) {
      if (contextPopoverRef.current && !contextPopoverRef.current.contains(e.target as Node)) {
        setContextPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [contextPopoverOpen])

  // ── Prerequisites ────────────────────────────────────────────────────────
  async function retryAfterPrerequisites() {
    if (!prerequisiteBlock) return
    const { pendingRun } = prerequisiteBlock

    const prereq = await window.codeviper.checkAgentPrerequisites(
      settingsRef.current.ollamaUrl,
      projectPathRef.current,
      (settingsRef.current.modelProvider ?? 'ollama') !== 'ollama'
    )
    if (!prereq.ok) {
      setPrerequisiteBlock({ issues: prereq.issues, pendingRun, installing: false })
      return
    }

    setPrerequisiteBlock(null)
    await onRefreshOllama?.()
    await executeRun(pendingRun.userMessageId, pendingRun.text)
  }

  async function installNodeDependencies() {
    if (!prerequisiteBlock) return
    const nodeIssue = prerequisiteBlock.issues.find((issue) => issue.type === 'node_install')
    if (!nodeIssue || !projectPathRef.current) return

    setPrerequisiteBlock({ ...prerequisiteBlock, installing: true })
    try {
      const result = await window.codeviper.runTerminalCommand(
        projectPathRef.current,
        nodeIssue.installCommand
      )
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
      appendMessage({
        id: makeId(),
        role: 'system',
        content:
          result.exitCode === 0
            ? `✓ ${nodeIssue.installCommand} выполнен успешно`
            : `✗ ${nodeIssue.installCommand} завершился с кодом ${result.exitCode}${output ? `\n${output.slice(0, 500)}` : ''}`,
        timestamp: Date.now()
      })
      if (result.exitCode === 0) {
        await retryAfterPrerequisites()
      } else {
        setPrerequisiteBlock({ ...prerequisiteBlock, installing: false })
      }
    } catch (error) {
      appendMessage({
        id: makeId(),
        role: 'system',
        content: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      })
      setPrerequisiteBlock({ ...prerequisiteBlock, installing: false })
    }
  }

  function queueModelDownload(modelName: string) {
    onEnqueueModel?.(modelName)
    onOpenSettings?.()
    appendMessage({
      id: makeId(),
      role: 'system',
      content: `Модель ${modelName} добавлена в очередь скачивания. После завершения нажмите «Проверить снова».`,
      timestamp: Date.now()
    })
  }

  // ── Ввод ─────────────────────────────────────────────────────────────────
  const retryUserMessage = useCallback(
    async (message: ChatMessage) => {
      if (busy || !chatId || !projectPath) return
      const msg: ChatMessage = {
        id: makeId(),
        role: 'user',
        content: message.content,
        timestamp: Date.now()
      }
      appendMessage(msg)
      await submitMessage(msg.id, message.content)
    },
    [busy, chatId, projectPath, submitMessage]
  )

  const regenerateAssistantMessage = useCallback(
    (message: ChatMessage) => {
      if (busy || !chatId || !projectPath) return
      void regenerateAssistantReply(message.id)
    },
    [busy, chatId, projectPath, regenerateAssistantReply]
  )

  const editUserMessage = useCallback((message: ChatMessage) => {
    const idx = messagesRef.current.findIndex((m) => m.id === message.id)
    if (idx >= 0) commitMessages(messagesRef.current.slice(0, idx))
    setInput(message.content)
    requestAnimationFrame(() => {
      chatInputRef.current?.focus()
      const ta = chatInputRef.current?.getTextarea()
      const len = ta?.value.length ?? 0
      ta?.setSelectionRange(len, len)
    })
  }, [])

  const handleSaveAsSkill = useCallback((content: string) => {
    setSaveSkillDialog({ content, name: '', saving: false, result: null })
  }, [])

  async function doSaveSkill() {
    if (!saveSkillDialog) return
    const name = saveSkillDialog.name.trim()
    if (!name) return
    setSaveSkillDialog((d) => d && { ...d, saving: true, result: null })
    try {
      await window.codeviper.createSkill(projectPath ?? '', {
        name,
        description: name,
        instructions: saveSkillDialog.content
      })
      setSaveSkillDialog((d) => d && { ...d, saving: false, result: `✓ Навык «${name}» сохранён` })
      setTimeout(() => setSaveSkillDialog(null), 1500)
    } catch (e) {
      setSaveSkillDialog(
        (d) =>
          d && {
            ...d,
            saving: false,
            result: `✕ ${e instanceof Error ? e.message : String(e)}`
          }
      )
    }
  }

  const togglePinMessage = useCallback((id: string) => {
    setPinnedMessageIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const insertPrompt = useCallback((text: string) => {
    setInput((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${text}` : text))
    requestAnimationFrame(() => {
      chatInputRef.current?.focus()
      const ta = chatInputRef.current?.getTextarea()
      const len = ta?.value.length ?? 0
      ta?.setSelectionRange(len, len)
    })
  }, [])

  function insertFileMentionPath(relativePath: string) {
    const mention = `@${relativePath.replace(/\\/g, '/')}`
    setInput((prev) => {
      if (!prev.trim()) return mention
      const needsSpace = !prev.endsWith(' ') && !prev.endsWith('\n')
      return `${prev}${needsSpace ? ' ' : ''}${mention}`
    })
    requestAnimationFrame(() => {
      chatInputRef.current?.focus()
      const ta = chatInputRef.current?.getTextarea()
      const len = ta?.value.length ?? 0
      ta?.setSelectionRange(len, len)
    })
  }

  useImperativeHandle(ref, () => ({
    insertPath: (path: string) => insertPrompt(path),
    insertFileMention: insertFileMentionPath,
    focusInput: () => chatInputRef.current?.focus(),
    replayFromStep: (history: ChatMessage[], userMessage: string) => {
      void replayRun(history, userMessage)
    }
  }))

  async function send() {
    const raw = input.trim()
    const text = expandSlashCommand(raw, settings.promptTemplates)
    if (!text || !projectPath || !chatId) return

    // Читаем содержимое вложенных файлов
    const textParts: string[] = []
    const images: { name: string; dataUrl: string }[] = []

    for (const f of droppedFiles) {
      const result = await window.codeviper.readAttachment(f.path)
      if (!result.ok) {
        textParts.push(`[${f.name}] ⚠️ ${result.error ?? 'Не удалось прочитать файл'}`)
      } else if (result.isImage && result.dataUrl) {
        images.push({ name: f.name, dataUrl: result.dataUrl })
        textParts.push(`[изображение: ${f.name}]`)
      } else if (result.content != null) {
        const ext = f.name.split('.').pop() ?? ''
        textParts.push(`[${f.name}]\n\`\`\`${ext}\n${result.content}\n\`\`\``)
      }
    }

    // Изображения из буфера обмена (Ctrl+V)
    for (const img of clipboardImages) {
      images.push(img)
      textParts.push(`[изображение: ${img.name}]`)
    }

    const fileSection = textParts.length > 0 ? textParts.join('\n\n') + '\n\n' : ''
    const fullText = fileSection + text

    const userMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: fullText,
      timestamp: Date.now(),
      ...(images.length > 0 && { images })
    }
    appendMessage(userMessage)
    setInput('')
    setDroppedFiles([])
    setClipboardImages([])
    scrollToBottomRef.current?.(true)
    await submitMessage(userMessage.id, fullText)
  }

  function handleSlashSelect(cmd: SlashCommand) {
    if (cmd.hasArg) {
      const prefix = `/${cmd.trigger} `
      setInput(prefix)
      requestAnimationFrame(() => {
        const ta = chatInputRef.current?.getTextarea()
        ta?.setSelectionRange(prefix.length, prefix.length)
        chatInputRef.current?.focus()
      })
    } else {
      setInput(cmd.expand())
      chatInputRef.current?.focus()
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Навигация по slash-меню
    const menuOpen = slashMatches.length > 0 && inputFocused
    if (menuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashMenuIndex((i) => Math.min(i + 1, slashMatches.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashMenuIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const cmd = slashMatches[slashMenuIndex]
        if (cmd) handleSlashSelect(cmd)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setInput(input.replace(/^\/\S*/, ''))
        return
      }
    }

    if (e.key !== 'Enter') return

    if (e.shiftKey || e.ctrlKey) {
      e.preventDefault()
      const ta = e.currentTarget
      const start = ta.selectionStart ?? input.length
      const end = ta.selectionEnd ?? input.length
      const next = `${input.slice(0, start)}\n${input.slice(end)}`
      setInput(next)
      requestAnimationFrame(() => ta.setSelectionRange(start + 1, start + 1))
      return
    }

    e.preventDefault()
    void send()
  }

  const projectLocked = messages.length > 0

  const slashMatches = useMemo(
    () => matchSlashCommands(input, settings.promptTemplates),
    [input, settings.promptTemplates]
  )

  // Сбрасывать выделение при изменении списка команд
  useEffect(() => {
    setSlashMenuIndex(0)
  }, [slashMatches.length])

  const lastVisibleMessage = useMemo(
    () => [...messages].reverse().find(shouldShowAssistantMessage),
    [messages]
  )

  const awaitingClarification =
    settings.clarifyMode &&
    !busy &&
    !!chatId &&
    !!projectPath &&
    lastVisibleMessage?.role === 'assistant' &&
    /\?\s*$/.test(lastVisibleMessage.content.trimEnd())

  const addDroppedFiles = useCallback(
    (entries: DroppedFile[]) => {
      setDroppedFiles((prev) => {
        const existingPaths = new Set(prev.map((x) => x.path))
        const fresh = entries.filter((x) => !existingPaths.has(x.path))
        const slots = FILE_LIMIT - prev.length - clipboardImages.length
        return [...prev, ...fresh.slice(0, Math.max(0, slots))]
      })
      chatInputRef.current?.focus()
    },
    [clipboardImages.length]
  )

  return (
    <div className={styles.main}>
      {/* projectBar и AgentContextBar убраны — перенесены в inputFooter */}

      {chatId && interruptedDraft && (
        <InterruptedDraftBanner
          draft={interruptedDraft}
          onRetry={() => {
            const msgId = makeId()
            appendMessage({
              id: msgId,
              role: 'user',
              content: interruptedDraft.userMessage,
              timestamp: Date.now()
            })
            void executeRun(msgId, interruptedDraft.userMessage)
            void window.codeviper
              .updateChat(chatId, { interruptedDraft: null })
              .then(() => onInterruptedDraftChange?.())
              .catch(() => {})
          }}
          onDismiss={() => {
            void window.codeviper
              .updateChat(chatId, { interruptedDraft: null })
              .then(() => onInterruptedDraftChange?.())
              .catch(() => {})
          }}
        />
      )}

      {chatId && prerequisiteBlock && (
        <AgentPrerequisitesBanner
          issues={prerequisiteBlock.issues}
          pendingRun={prerequisiteBlock.pendingRun}
          installing={prerequisiteBlock.installing}
          onInstallNodeDeps={() => void installNodeDependencies()}
          onDownloadModel={queueModelDownload}
          onOpenSettings={() => onOpenSettings?.()}
          onRetry={() => void retryAfterPrerequisites()}
          onDismiss={() => setPrerequisiteBlock(null)}
        />
      )}

      <AgentContextModal
        open={contextModalOpen}
        preview={contextPreview}
        onClose={() => setContextModalOpen(false)}
      />

      <ChatPanelMessagesPane
        chatId={chatId}
        projectPath={projectPath}
        messages={messages}
        pinnedMessageIds={pinnedMessageIds}
        busy={busy}
        agentPhase={agentPhase}
        queueSize={queueSize}
        draftMessageIdRef={draftMessageIdRef}
        runStats={runStats}
        scrollToBottomRef={scrollToBottomRef}
        togglePinMessage={togglePinMessage}
        retryUserMessage={retryUserMessage}
        editUserMessage={editUserMessage}
        regenerateAssistantMessage={regenerateAssistantMessage}
        onFileTimeline={setFileTimelinePath}
        onSaveAsSkill={handleSaveAsSkill}
        respondPreview={respondPreview}
        onInsertPrompt={insertPrompt}
      />

      {awaitingClarification && (
        <div className={styles.clarifyBanner} role="status">
          <span className={styles.clarifyIcon}>💬</span>
          <span>Агент ждёт ответа на уточнение</span>
        </div>
      )}

      <ChatStatusBar
        chatId={chatId}
        projectPath={projectPath}
        settings={settings}
        busy={busy}
        agentRunning={agentRunning}
        queueSize={queueSize}
        progress={progress}
        indexingProgress={indexingProgress}
        p2pCredits={p2pCredits}
        runModel={runModel}
        displayModels={displayModels}
        planItems={planItems}
        todoItems={todoItems}
        todoTitle={todoTitle}
        showLearningPanel={showLearningPanel}
        showRulesPanel={showRulesPanel}
        showRoadmapPanel={showRoadmapPanel}
        showQuickBar={showQuickBar}
        modelPickerOpen={modelPickerOpen}
        modelPickerRef={modelPickerRef}
        contextPopoverOpen={contextPopoverOpen}
        contextPopoverRef={contextPopoverRef}
        contextPreview={contextPreview}
        contextLoading={contextLoading}
        summarizing={summarizing}
        projectLocked={projectLocked}
        input={input}
        onInputChange={setInput}
        droppedFiles={droppedFiles}
        clipboardImages={clipboardImages}
        isDragOver={isDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        onRemoveFile={removeDroppedFile}
        onRemoveImage={removeClipboardImage}
        onAddFiles={addDroppedFiles}
        slashMatches={slashMatches}
        slashMenuIndex={slashMenuIndex}
        onSlashSelect={handleSlashSelect}
        inputFocused={inputFocused}
        onInputFocus={() => setInputFocused(true)}
        onInputBlur={() => setInputFocused(false)}
        onKeyDown={handleInputKeyDown}
        chatInputRef={chatInputRef}
        onStop={() => void stopAgent()}
        onSend={() => void send()}
        onSetPlanItems={setPlanItems}
        onSetTodoItems={setTodoItems}
        onSetShowLearning={setShowLearningPanel}
        onSetShowRules={setShowRulesPanel}
        onSetShowRoadmap={setShowRoadmapPanel}
        onSetShowQuickBar={setShowQuickBar}
        onSetModelPickerOpen={setModelPickerOpen}
        onSetContextPopoverOpen={setContextPopoverOpen}
        onSetContextModalOpen={setContextModalOpen}
        onInsertPrompt={insertPrompt}
        onModelChange={onModelChange}
        onSettingsChange={onSettingsChange}
        onPickProject={onPickProject}
        onSummarizeContext={handleSummarizeContext}
        onRollback={(message) =>
          appendMessage({
            id: makeId(),
            role: 'assistant',
            content: `↩ ${message}`,
            timestamp: Date.now()
          })
        }
      />

      <ConfirmDialog
        open={!!dangerBlock}
        title={`⚠️ ${dangerBlock?.warning.title ?? 'Опасная операция'}`}
        message={`${dangerBlock?.warning.description ?? ''}\n\nПродолжить выполнение задачи?`}
        confirmLabel="Продолжить"
        danger={dangerBlock?.warning.level === 'danger'}
        onConfirm={() => {
          if (!dangerBlock) return
          const { userMessageId, text } = dangerBlock.pendingRun
          setDangerBlock(null)
          void confirmDangerRun(userMessageId, text)
        }}
        onCancel={() => {
          if (dangerBlock) {
            // убрать сообщение пользователя из чата
            const { userMessageId } = dangerBlock.pendingRun
            commitMessages(messagesRef.current.filter((m) => m.id !== userMessageId))
          }
          setDangerBlock(null)
        }}
      />

      {fileTimelinePath && projectPath && (
        <Suspense fallback={null}>
          <FileTimelinePanel
            open={!!fileTimelinePath}
            filePath={fileTimelinePath}
            projectPath={projectPath}
            onClose={() => setFileTimelinePath(null)}
          />
        </Suspense>
      )}

      {saveSkillDialog && (
        <div className="modal-overlay" onClick={() => setSaveSkillDialog(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">🎓 Сохранить как навык</div>
            <label className="modal-label">
              Название навыка
              <input
                className="modal-input"
                autoFocus
                value={saveSkillDialog.name}
                onChange={(e) =>
                  setSaveSkillDialog((d) => d && { ...d, name: e.target.value, result: null })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && saveSkillDialog.name.trim()) void doSaveSkill()
                  if (e.key === 'Escape') setSaveSkillDialog(null)
                }}
                placeholder="например: форматирование TypeScript"
              />
            </label>
            {saveSkillDialog.result && (
              <div
                className={saveSkillDialog.result.startsWith('✓') ? 'modal-success' : 'modal-error'}
              >
                {saveSkillDialog.result}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!saveSkillDialog.name.trim() || saveSkillDialog.saving}
                onClick={() => void doSaveSkill()}
              >
                {saveSkillDialog.saving ? 'Сохраняю…' : 'Сохранить'}
              </button>
              <button type="button" className="btn" onClick={() => setSaveSkillDialog(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
