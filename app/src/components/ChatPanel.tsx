import {
  forwardRef,
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { makeId } from '../../shared/makeId'
import { sanitizeAssistantContent } from '../../shared/toolCalls'
import type {
  AgentSettings,
  ChatMessage,
  OllamaModel,
  ProgressInfo,
  SelfImprovementPlanItem,
  TodoItem
} from '../types'
import { filterToolCallingModels } from '../types'
import { GEMINI_FREE_MODELS } from '../../shared/constants'

// Список моделей для облачных провайдеров
const CLOUD_KNOWN_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
  gemini: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite-preview-06-17',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
  ],
  openrouter: []
}
import { AgentStatusBar } from './AgentStatusBar'
import { TodoPanel } from './TodoPanel'
import { SelfImprovePlanPanel } from './SelfImprovePlanPanel'
import { AgentLearningPanel } from './AgentLearningPanel'
import { ProjectRulesPanel } from './ProjectRulesPanel'
import { SlashCommandMenu } from './SlashCommandMenu'
import { RoadmapPickerPanel } from './RoadmapPickerPanel'
import { matchSlashCommands, expandSlashCommand } from '../../shared/slashCommands'
import type { SlashCommand } from '../../shared/slashCommands'
import styles from './ChatPanel.module.css'
import { AgentContextModal } from './AgentContextModal'
import { AgentPrerequisitesBanner } from './AgentPrerequisitesBanner'
const MessageBody = lazy(() => import('./MessageBody').then((m) => ({ default: m.MessageBody })))
const FileTimelinePanel = lazy(() =>
  import('./FileTimelinePanel').then((m) => ({ default: m.FileTimelinePanel }))
)
import { MessageCopyButton } from './MessageCopyButton'
import { MessageRoleBadge } from './MessageRoleBadge'
import { ThinkingBlock } from './ThinkingBlock'
import { InterruptedDraftBanner } from './InterruptedDraftBanner'
import { QuickPromptBar } from './QuickPromptBar'
import { WelcomePanel } from './WelcomePanel'
import { AllToolsGroup } from './AllToolsGroup'
import { RunRollbackButton } from './RunRollbackButton'
import { ChatInput, type ChatInputHandle } from './ChatInput'

import { useContextPreview } from '../hooks/useContextPreview'
import { useAgentStream } from '../hooks/useAgentStream'
import { useMessageQueue, type PrerequisiteBlock, type DangerBlock } from '../hooks/useMessageQueue'
import { useAgentDispatch, useAgentState } from '../contexts/AgentContext'
import { useChatContext } from '../contexts/ChatContext'
import { useChatBusy } from '../contexts/QueueContext'
import { useAppStateSync } from '../hooks/useAppStateSync'
import { ConfirmDialog } from './ConfirmDialog'
import { EditPreviewBlock } from './EditPreviewBlock'
import { formatElapsed, formatTokenCount } from '../../shared/generationMetrics'

export interface ChatPanelHandle {
  insertPath: (path: string) => void
  focusInput: () => void
}

interface Props {
  settings: AgentSettings
  onLearningSaved?: () => void
  onPickProject: () => void
  models?: OllamaModel[]
  onModelChange?: (model: string, auto: boolean) => void
  onActiveModelChange?: (model: string) => void
  onSettingsChange?: (partial: Partial<AgentSettings>) => void
  onOpenSettings?: () => void
  onEnqueueModel?: (modelName: string) => void
  onRefreshOllama?: () => Promise<void>
  incognito?: boolean
}

const FILE_LIMIT = 10

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

function formatProjectLabel(path: string): string {
  if (!path.trim()) return 'Проект не выбран'
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function visibleAssistantContent(content: string): string {
  return sanitizeAssistantContent(content)
}

function shouldShowAssistantMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return true

  const hasContent = visibleAssistantContent(message.content).length > 0
  const hasThinking = typeof message.thinking === 'string' && message.thinking.trim().length > 0

  // Показываем сообщение, если есть текст ответа ИЛИ текст размышлений
  return hasContent || hasThinking
}

// Все подряд идущие tool-вызовы + thinking сворачиваются в один блок.
type DisplayItem =
  | { kind: 'message'; message: ChatMessage }
  | {
      kind: 'all-tools'
      items: ChatMessage[]
      key: string
      reasoning?: { thinking: string; assistant: ChatMessage }
    }

function groupToolMessages(messages: ChatMessage[]): DisplayItem[] {
  const result: DisplayItem[] = []
  let pendingTools: ChatMessage[] = []
  let pendingReasoning: { thinking: string; assistant: ChatMessage } | null = null

  function flushTools() {
    if (pendingTools.length > 0 || pendingReasoning) {
      const key = `tools-${pendingTools[0]?.id || 'reasoning'}`
      result.push({
        kind: 'all-tools',
        items: pendingTools,
        key,
        reasoning: pendingReasoning || undefined
      })
      pendingTools = []
      pendingReasoning = null
    }
  }

  for (const msg of messages) {
    if (msg.role === 'tool') {
      pendingTools.push(msg)
    } else if (msg.role === 'assistant') {
      // Если у assistant есть thinking, копим его вместе с tools
      if (msg.thinking && msg.thinking.trim()) {
        if (pendingReasoning === null) {
          pendingReasoning = { thinking: msg.thinking, assistant: msg }
        } else {
          pendingReasoning.thinking += '\n' + msg.thinking
        }
        // Не добавляем сообщение в result пока не увидим non-tool/non-assistant
        continue
      }
      // Иначе сбрасываем и добавляем обычное сообщение
      flushTools()
      result.push({ kind: 'message', message: msg })
    } else {
      // system/user — сбрасываем и добавляем
      flushTools()
      result.push({ kind: 'message', message: msg })
    }
  }

  // Оставшиеся tool-сообщения и reasoning в конце
  flushTools()

  return result
}

function messageCopyText(message: ChatMessage): string {
  if (message.role === 'assistant') return visibleAssistantContent(message.content)
  if (message.role === 'tool' && message.toolOutput?.trim()) return message.toolOutput
  return message.content
}

// Мемоизированная строка сообщения — перерисовывается только при изменении самого сообщения.
const MessageRow = memo(function MessageRow({
  message,
  pinned,
  busy,
  isStreaming,
  onPin,
  onRetry,
  onEdit,
  onFileTimeline
}: {
  message: ChatMessage
  pinned: boolean
  busy: boolean
  isStreaming?: boolean
  onPin: (id: string) => void
  onRetry: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
  onFileTimeline?: (path: string) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [menuOpen])

  return (
    <div className={`message ${message.role}${pinned ? ' pinned' : ''}`}>
      <div className="message-menu" ref={menuRef}>
        <button
          type="button"
          className="btn message-menu-trigger"
          title="Действия"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ···
        </button>
        {menuOpen && (
          <div className="message-menu-dropdown" onClick={() => setMenuOpen(false)}>
            <MessageCopyButton text={messageCopyText(message)} asMenuItem />
            {!busy && (
              <button type="button" className="message-menu-item" onClick={() => onPin(message.id)}>
                {pinned ? '📌 Открепить' : '📌 Закрепить'}
              </button>
            )}
            {!busy && message.role === 'user' && (
              <>
                <button
                  type="button"
                  className="message-menu-item"
                  onClick={() => onRetry(message)}
                >
                  ↺ Повторить
                </button>
                <button type="button" className="message-menu-item" onClick={() => onEdit(message)}>
                  ✎ Изменить
                </button>
              </>
            )}
            {message.role === 'assistant' && message.durationMs != null && (
              <span className="message-menu-meta">⏱ {(message.durationMs / 1000).toFixed(1)}s</span>
            )}
          </div>
        )}
      </div>
      {message.role === 'assistant' && message.thinking && (
        <ThinkingBlock content={message.thinking} live={isStreaming} />
      )}
      {message.images && message.images.length > 0 && (
        <div className="message-images">
          {message.images.map((img) => (
            <img
              key={img.name}
              src={img.dataUrl}
              alt={img.name}
              className="message-image-thumb"
              title={img.name}
            />
          ))}
        </div>
      )}
      <Suspense fallback={null}>
        <MessageBody
          role={message.role}
          content={
            message.role === 'assistant'
              ? visibleAssistantContent(message.content)
              : message.content
          }
          onFileTimeline={onFileTimeline}
        />
      </Suspense>
    </div>
  )
})

export const ChatPanel = forwardRef<ChatPanelHandle, Props>(function ChatPanel(
  {
    settings,
    onLearningSaved,
    onPickProject,
    models = [],
    onModelChange,
    onActiveModelChange,
    onSettingsChange,
    onOpenSettings,
    onEnqueueModel,
    onRefreshOllama,
    incognito = false
  },
  ref
) {
  const {
    messages,
    setMessages,
    activeChatId: chatId,
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
    import('../types').AgentContextPreview | null
  >(null)
  const [contextLoading, setContextLoading] = useState(false)
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

  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const chatInputRef = useRef<ChatInputHandle>(null)
  const messagesRef = useRef(messages)
  const chatIdRef = useRef(chatId)
  const projectPathRef = useRef(projectPath)
  const settingsRef = useRef(settings)
  const setMessagesRef = useRef(setMessages)
  const onLearningSavedRef = useRef(onLearningSaved)
  const onActiveModelChangeRef = useRef(onActiveModelChange)
  const incognitoRef = useRef(incognito)
  incognitoRef.current = incognito

  // Координационные рефы между хуками — созданы здесь, переданы в оба.
  const dispatch = useAgentDispatch()
  const { runModel, runStats } = useAgentState()

  const processNextQueuedRunRef = useRef<() => Promise<void>>(async () => {})
  const runIdRef = useRef(0)
  const doneRunIdRef = useRef(-1)
  const onAgentDoneRef = useRef<(() => void) | undefined>(undefined)

  onAgentDoneRef.current = settings.soundNotifications
    ? () => {
        try {
          const ctx = new AudioContext()
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.frequency.value = 880
          gain.gain.setValueAtTime(0.25, ctx.currentTime)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
          osc.start(ctx.currentTime)
          osc.stop(ctx.currentTime + 0.4)
        } catch {
          // AudioContext может быть недоступен
        }
      }
    : undefined

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

    if (isCloud && provider in CLOUD_KNOWN_MODELS) {
      // Преобразуем строки в OllamaModel для совместимости с рендером
      return CLOUD_KNOWN_MODELS[provider as keyof typeof CLOUD_KNOWN_MODELS].map(
        (name: string) => ({
          name,
          size: 0,
          modifiedAt: ''
        })
      )
    }
    return models
  }, [settings.modelProvider, settings.geminiTier, models])

  // Не фильтровать облачные модели (они всегда поддерживают tool calling)
  const displayModels = useMemo(() => {
    const isCloud = settings.modelProvider !== 'ollama'
    return isCloud ? pickerModels : filterToolCallingModels(pickerModels)
  }, [pickerModels, settings.modelProvider])

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

  function respondPreview(messageId: string, previewId: string, apply: boolean) {
    const msg = messagesRef.current.find((m) => m.id === messageId)
    if (!msg) return
    upsertMessage({ ...msg, previewStatus: apply ? 'applied' : 'cancelled' })
    window.codeviper.respondAgentPreview(previewId, apply)
  }

  // ── Хук: стрим событий агента ────────────────────────────────────────────
  const { draftRef, draftMessageIdRef, resetStreamState } = useAgentStream({
    chatIdRef,
    runIdRef,
    doneRunIdRef,
    onLearningSavedRef,
    onActiveModelChangeRef,
    processNextQueuedRunRef,
    appendMessage,
    upsertMessage,
    setContextPreview,
    onAgentDoneRef,
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
    onRunStart: resetStreamState,
    onReset: resetStreamState,
    onBusyChange: (busy: boolean) => chatId && markChatBusy(chatId, busy),
    onPrerequisiteIssue: setPrerequisiteBlock,
    onDangerWarning: setDangerBlock,
    draftRef,
    onInterruptedDraft: handleInterruptedDraft,
    incognitoRef
  })

  // ── Хук: контекст-превью (debounce 600 ms, не работает пока агент занят) ─
  useContextPreview(chatId, projectPath, messages, input, settings.model, busy, {
    onPreview: setContextPreview,
    onLoading: setContextLoading
  })

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

  // Следим за тем, находится ли пользователь внизу чата
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToBottomRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    scrollToBottomRef.current?.()
  }, [messages.length, queueSize])

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
  async function retryUserMessage(message: ChatMessage) {
    if (busy || !chatId || !projectPath) return
    const msg: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: message.content,
      timestamp: Date.now()
    }
    appendMessage(msg)
    await submitMessage(msg.id, message.content)
  }

  function editUserMessage(message: ChatMessage) {
    const idx = messagesRef.current.findIndex((m) => m.id === message.id)
    if (idx >= 0) commitMessages(messagesRef.current.slice(0, idx))
    setInput(message.content)
    requestAnimationFrame(() => {
      chatInputRef.current?.focus()
      const ta = chatInputRef.current?.getTextarea()
      const len = ta?.value.length ?? 0
      ta?.setSelectionRange(len, len)
    })
  }

  const togglePinMessage = useCallback((id: string) => {
    setPinnedMessageIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  function insertPrompt(text: string) {
    setInput((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${text}` : text))
    requestAnimationFrame(() => {
      chatInputRef.current?.focus()
      const ta = chatInputRef.current?.getTextarea()
      const len = ta?.value.length ?? 0
      ta?.setSelectionRange(len, len)
    })
  }

  useImperativeHandle(ref, () => ({
    insertPath: (path: string) => insertPrompt(path),
    focusInput: () => chatInputRef.current?.focus()
  }))

  async function send() {
    const raw = input.trim()
    const text = expandSlashCommand(raw)
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
        textParts.push(`[изображение: ${f.name}]\n![${f.name}](${result.dataUrl})`)
      } else if (result.content != null) {
        const ext = f.name.split('.').pop() ?? ''
        textParts.push(`[${f.name}]\n\`\`\`${ext}\n${result.content}\n\`\`\``)
      }
    }

    // Изображения из буфера обмена (Ctrl+V)
    for (const img of clipboardImages) {
      images.push(img)
      textParts.push(`[изображение: ${img.name}]\n![${img.name}](${img.dataUrl})`)
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
    atBottomRef.current = true
    scrollToBottomRef.current?.()
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

  const slashMatches = useMemo(() => matchSlashCommands(input), [input])

  // Сбрасывать выделение при изменении списка команд
  useEffect(() => {
    setSlashMenuIndex(0)
  }, [slashMatches.length])

  // Мемоизируем тяжёлые вычисления — не пересчитываются на каждый ре-рендер
  const displayItems = useMemo(
    () => groupToolMessages(messages.filter(shouldShowAssistantMessage)),
    [messages]
  )

  const pinnedDisplayItems = useMemo(
    () =>
      pinnedMessageIds.size > 0
        ? groupToolMessages(
            messages.filter((m) => pinnedMessageIds.has(m.id) && shouldShowAssistantMessage(m))
          )
        : [],
    [messages, pinnedMessageIds]
  )

  const virtualizer = useVirtualizer({
    count: displayItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 80,
    overscan: 5,
    measureElement:
      typeof window !== 'undefined' && navigator.userAgent.includes('Firefox')
        ? undefined
        : (el) => el.getBoundingClientRect().height
  })

  // Обновляем колбэк скролла при каждом рендере — чтобы эффекты выше видели актуальные значения
  scrollToBottomRef.current = () => {
    if (atBottomRef.current && displayItems.length > 0) {
      virtualizer.scrollToIndex(displayItems.length - 1, { align: 'end', behavior: 'smooth' })
    }
  }

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

  function formatModelShort(model: string): string {
    const name = (model || '').trim()
    if (!name) return '—'
    const base = name.includes(':') ? name.split(':')[0]! : name
    return base.length > 16 ? base.slice(0, 15) + '…' : base
  }

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

      <div className={styles.messages} ref={scrollRef}>
        {!chatId && <div className="empty">Создай чат слева, выбери проект и опиши задачу.</div>}
        {chatId && !projectPath && !messages.length && (
          <div className="empty">Выбери папку с кодом — кнопка «Выбрать проект» выше.</div>
        )}
        {chatId && projectPath && !messages.length && <WelcomePanel onSelect={insertPrompt} />}

        {pinnedDisplayItems.length > 0 && (
          <div className="pinned-messages-section">
            <div className="pinned-messages-title">📌 Закреплённые</div>
            {pinnedDisplayItems.map((item) =>
              item.kind === 'all-tools' ? (
                <div key={item.key}>
                  {item.reasoning && <ThinkingBlock content={item.reasoning.thinking} />}
                  {item.items.length > 0 && <AllToolsGroup items={item.items} />}
                </div>
              ) : (
                <div key={item.message.id} className={`message ${item.message.role} pinned`}>
                  <div className="message-header">
                    <MessageRoleBadge role={item.message.role} toolName={item.message.toolName} />
                    <button
                      type="button"
                      className="btn message-pin-btn active"
                      title="Открепить"
                      onClick={() => togglePinMessage(item.message.id)}
                    >
                      📌
                    </button>
                  </div>
                  <Suspense fallback={null}>
                    <MessageBody
                      role={item.message.role}
                      content={
                        item.message.role === 'assistant'
                          ? visibleAssistantContent(item.message.content)
                          : item.message.content
                      }
                      onFileTimeline={setFileTimelinePath}
                    />
                  </Suspense>
                </div>
              )
            )}
          </div>
        )}

        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vItem) => {
            const item = displayItems[vItem.index]!
            let content: React.ReactNode

            if (item.kind === 'all-tools') {
              content = (
                <div>
                  {item.reasoning && <ThinkingBlock content={item.reasoning.thinking} />}
                  {item.items.length > 0 && <AllToolsGroup items={item.items} />}
                </div>
              )
            } else {
              const msg = item.message
              if (msg.previewId && msg.previewDiff !== undefined) {
                content = (
                  <EditPreviewBlock
                    messageId={msg.id}
                    previewId={msg.previewId}
                    path={msg.previewPath ?? ''}
                    diff={msg.previewDiff}
                    status={msg.previewStatus ?? 'cancelled'}
                    onRespond={respondPreview}
                  />
                )
              } else {
                content = (
                  <MessageRow
                    message={msg}
                    pinned={pinnedMessageIds.has(msg.id)}
                    busy={busy}
                    isStreaming={msg.id === draftMessageIdRef.current}
                    onPin={togglePinMessage}
                    onRetry={retryUserMessage}
                    onEdit={editUserMessage}
                    onFileTimeline={setFileTimelinePath}
                  />
                )
              }
            }

            return (
              <div
                key={vItem.key}
                data-index={vItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${vItem.start}px)`
                }}
              >
                {content}
              </div>
            )
          })}
        </div>

        {!busy && runStats && runStats.tokens > 0 && (
          <div className={styles.runMeta}>
            {formatElapsed(runStats.elapsedSec)} · {formatTokenCount(runStats.tokens)} токенов
          </div>
        )}
      </div>

      {awaitingClarification && (
        <div className={styles.clarifyBanner} role="status">
          <span className={styles.clarifyIcon}>💬</span>
          <span>Агент ждёт ответа на уточнение</span>
        </div>
      )}

      <div className={styles.input}>
        {(busy || indexingProgress) && (
          <AgentStatusBar
            model={settings.model}
            queueSize={queueSize}
            progress={busy ? progress : indexingProgress}
            p2pCredits={p2pCredits}
          />
        )}

        {planItems && planItems.length > 0 && (
          <SelfImprovePlanPanel items={planItems} onClose={() => setPlanItems(null)} />
        )}

        {todoItems && todoItems.length > 0 && (
          <TodoPanel items={todoItems} title={todoTitle} onClose={() => setTodoItems(null)} />
        )}

        {showLearningPanel && <AgentLearningPanel onClose={() => setShowLearningPanel(false)} />}

        {showRulesPanel && projectPath && (
          <ProjectRulesPanel projectPath={projectPath} onClose={() => setShowRulesPanel(false)} />
        )}

        {showRoadmapPanel && chatId && projectPath && (
          <RoadmapPickerPanel
            onSelect={(prompt) => {
              insertPrompt(prompt)
              setShowRoadmapPanel(false)
            }}
            onClose={() => setShowRoadmapPanel(false)}
          />
        )}

        {showQuickBar && chatId && projectPath && (
          <QuickPromptBar
            onInsert={(text) => {
              insertPrompt(text)
              setShowQuickBar(false)
            }}
            disabled={!chatId || !projectPath}
          />
        )}

        {(droppedFiles.length > 0 || clipboardImages.length > 0) && (
          <div className={styles.fileChips}>
            {droppedFiles.map((f) => (
              <span key={f.path} className={styles.fileChip} title={f.path}>
                <span className={styles.fileChipName}>{f.name}</span>
                {f.size != null && (
                  <span className={styles.fileChipSize}>{formatSize(f.size)}</span>
                )}
                <button
                  type="button"
                  className={styles.fileChipRemove}
                  aria-label={`Убрать ${f.name}`}
                  onClick={() => removeDroppedFile(f.path)}
                >
                  ✕
                </button>
              </span>
            ))}
            {clipboardImages.map((img) => (
              <span
                key={img.name}
                className={`${styles.fileChip} ${styles.fileChipImage}`}
                title={img.name}
              >
                <img src={img.dataUrl} alt={img.name} className={styles.fileChipThumb} />
                <span className={styles.fileChipName}>{img.name}</span>
                <button
                  type="button"
                  className={styles.fileChipRemove}
                  aria-label={`Убрать ${img.name}`}
                  onClick={() => removeClipboardImage(img.name)}
                >
                  ✕
                </button>
              </span>
            ))}
            <span className={styles.fileChipsSummary}>
              {droppedFiles.length + clipboardImages.length}/{FILE_LIMIT}
              {droppedFiles.reduce((s, f) => s + (f.size ?? 0), 0) > 0 &&
                ` · ${formatSize(droppedFiles.reduce((s, f) => s + (f.size ?? 0), 0))}`}
            </span>
          </div>
        )}

        <div style={{ position: 'relative' }}>
          {slashMatches.length > 0 && inputFocused && (
            <SlashCommandMenu
              commands={slashMatches}
              selectedIndex={slashMenuIndex}
              onSelect={handleSlashSelect}
            />
          )}
          <div
            className={`${styles.inputBox}${inputFocused ? ' ' + styles.inputBoxFocused : ''}${isDragOver ? ' ' + styles.inputBoxDragOver : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {isDragOver && (
              <div className={styles.dragOverlay} aria-hidden="true">
                Отпустите файл(ы)
              </div>
            )}
            <ChatInput
              ref={chatInputRef}
              value={input}
              onChange={setInput}
              projectPath={projectPath}
              focused={inputFocused}
              onKeyDown={handleInputKeyDown}
              onPaste={handlePaste}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Напиши задачу… (/ — промпты, @ — файлы)"
              disabled={!chatId}
              rows={3}
            />

            {/* Кнопки внутри поля — прикрепить/стоп/отправить */}
            <div className={styles.inputActions}>
              <button
                type="button"
                className={styles.attachBtn}
                onClick={() => {
                  void window.codeviper.selectFiles().then((entries) => {
                    if (!entries.length) return
                    setDroppedFiles((prev) => {
                      const existingPaths = new Set(prev.map((x) => x.path))
                      const fresh = entries
                        .filter((e) => !existingPaths.has(e.path))
                        .map((e) => ({
                          name: e.path.split(/[\\/]/).pop() ?? e.path,
                          path: e.path,
                          size: e.size
                        }))
                      const slots = FILE_LIMIT - prev.length - clipboardImages.length
                      return [...prev, ...fresh.slice(0, Math.max(0, slots))]
                    })
                    chatInputRef.current?.focus()
                  })
                }}
                disabled={!chatId}
                title="Прикрепить файл(ы)"
                aria-label="Прикрепить файл"
              >
                +
              </button>
              {(agentRunning || queueSize > 0) && (
                <button
                  type="button"
                  className={`${styles.stopBtn}`}
                  onClick={() => void stopAgent()}
                  title="Остановить агента"
                >
                  ■ Стоп{queueSize > 0 ? ` (${queueSize})` : ''}
                </button>
              )}
              <button
                type="button"
                className={styles.sendBtn}
                onClick={() => void send()}
                disabled={!settings.model || !chatId || !projectPath || !input.trim()}
                title={agentRunning ? 'В очередь' : 'Отправить (Enter)'}
              >
                ↑
              </button>
            </div>
          </div>
        </div>

        {/* Режимы работы агента */}
        {chatId && (
          <div className={styles.permissionModeBar}>
            <div className={styles.permissionModes}>
              <button
                type="button"
                className={`${styles.permModeBtn}${settings.permissionMode === 'ask' ? ' ' + styles.permModeBtnActive : ''}`}
                title="Спрашивать перед каждым действием"
                onClick={() => onSettingsChange?.({ permissionMode: 'ask' })}
              >
                Ask
              </button>
              <button
                type="button"
                className={`${styles.permModeBtn}${settings.permissionMode === 'acceptEdits' ? ' ' + styles.permModeBtnActive : ''}`}
                title="Автоматически применять правки"
                onClick={() => onSettingsChange?.({ permissionMode: 'acceptEdits' })}
              >
                Accept
              </button>
              <button
                type="button"
                className={`${styles.permModeBtn}${settings.permissionMode === 'bypass' ? ' ' + styles.permModeBtnActive : ''}`}
                title="Полная автономия"
                onClick={() => onSettingsChange?.({ permissionMode: 'bypass' })}
              >
                Bypass
              </button>
            </div>
            <RunRollbackButton
              chatId={chatId}
              projectPath={projectPath}
              disabled={busy}
              onRollback={(message) =>
                appendMessage({
                  id: makeId(),
                  role: 'assistant',
                  content: `↩ ${message}`,
                  timestamp: Date.now()
                })
              }
            />
          </div>
        )}

        {/* Нижняя строка: контекст + модель + проект */}
        {chatId && (
          <div className={styles.inputMeta}>
            <div className={styles.metaLeft}>
              {/* Проект */}
              <button
                type="button"
                className={styles.metaBtn}
                title={
                  projectLocked
                    ? `Проект зафиксирован — чат уже содержит сообщения (${projectPath})`
                    : projectPath || 'Выбрать проект'
                }
                onClick={!projectLocked ? onPickProject : undefined}
                style={projectLocked ? { cursor: 'default' } : undefined}
                disabled={busy && !projectLocked}
              >
                📁 {projectPath ? formatProjectLabel(projectPath) : 'Выбрать проект'}
                {projectLocked && (
                  <span style={{ opacity: 0.45, fontSize: 9, marginLeft: 2 }}>🔒</span>
                )}
              </button>
            </div>

            <div className={styles.metaRight}>
              {/* Правила проекта */}
              <button
                type="button"
                className={`${styles.metaBtn}${showRulesPanel ? ' ' + styles.metaBtnActive : ''}`}
                title="Правила проекта (.codeviper/rules.md)"
                onClick={() => setShowRulesPanel((v) => !v)}
                disabled={!projectPath}
              >
                📋
              </button>

              {/* Коллективное обучение */}
              <button
                type="button"
                className={`${styles.metaBtn}${showLearningPanel ? ' ' + styles.metaBtnActive : ''}`}
                title="Коллективное обучение"
                onClick={() => setShowLearningPanel((v) => !v)}
              >
                ☁️
              </button>

              {/* Панель ROADMAP */}
              <button
                type="button"
                className={`${styles.metaBtn}${showRoadmapPanel ? ' ' + styles.metaBtnActive : ''}`}
                title="ROADMAP — выбрать задачу самоулучшения"
                onClick={() => setShowRoadmapPanel((v) => !v)}
                disabled={!projectPath}
              >
                🗺
              </button>

              {/* Быстрые промпты */}
              <button
                type="button"
                className={`${styles.metaBtn}${showQuickBar ? ' ' + styles.metaBtnActive : ''}`}
                title="Быстрые промпты"
                onClick={() => setShowQuickBar((v) => !v)}
                disabled={!projectPath}
              >
                /
              </button>

              {/* Выбор модели */}
              <div className={styles.modelPicker} ref={modelPickerRef}>
                <button
                  type="button"
                  className={`${styles.metaBtn} ${styles.metaModelBtn}`}
                  title={settings.model}
                  data-testid="model-picker-btn"
                  onClick={() => setModelPickerOpen((v) => !v)}
                >
                  {settings.autoModel !== false && (
                    <span className={styles.modelAuto}>Авто · </span>
                  )}
                  {formatModelShort(runModel || settings.model)}
                  <span className={styles.modelChevron}>{modelPickerOpen ? '▴' : '▾'}</span>
                </button>
                {modelPickerOpen && (
                  <div className={styles.modelPickerDropdown} role="listbox">
                    <button
                      type="button"
                      className={`${styles.modelPickerItem}${settings.autoModel !== false ? ' ' + styles.modelPickerActive : ''}`}
                      role="option"
                      aria-selected={settings.autoModel !== false}
                      onClick={() => {
                        onModelChange?.(settings.model, true)
                        setModelPickerOpen(false)
                      }}
                    >
                      <span className={styles.modelPickerName}>Авто</span>
                      <span className={styles.modelPickerDesc}>Лучшая доступная модель</span>
                      {settings.autoModel !== false && (
                        <span className={styles.modelPickerCheck}>✓</span>
                      )}
                    </button>
                    {displayModels.length > 0 && <div className={styles.modelPickerSep} />}
                    {displayModels.map((m: OllamaModel) => {
                      const isActive = settings.autoModel === false && settings.model === m.name
                      const freeModel =
                        settings.modelProvider === 'gemini' &&
                        (settings.geminiTier ?? 'free') === 'free'
                          ? GEMINI_FREE_MODELS.find((f) => f.id === m.name)
                          : undefined
                      const displayName = freeModel ? freeModel.label : m.name.split(':')[0]
                      const tag = freeModel
                        ? `${freeModel.rpm} RPM · ${freeModel.tpm != null ? `${freeModel.tpm / 1000}K` : '∞'} TPM`
                        : (m.parameterSize ??
                          (m.name.includes(':') ? m.name.split(':')[1] : undefined))
                      return (
                        <button
                          key={m.name}
                          type="button"
                          className={`${styles.modelPickerItem}${isActive ? ' ' + styles.modelPickerActive : ''}`}
                          role="option"
                          aria-selected={isActive}
                          onClick={() => {
                            onModelChange?.(m.name, false)
                            setModelPickerOpen(false)
                          }}
                        >
                          <span className={styles.modelPickerName}>{displayName}</span>
                          {tag && <span className={styles.modelPickerTag}>{tag}</span>}
                          {isActive && <span className={styles.modelPickerCheck}>✓</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Кружок контекста с визуальным прогрессом */}
              <div className={styles.contextPopoverWrap} ref={contextPopoverRef}>
                <button
                  type="button"
                  className={`${styles.contextCircleBtn}${contextPopoverOpen ? ' ' + styles.contextCircleActive : ''}`}
                  onClick={() => setContextPopoverOpen((v) => !v)}
                  title="Использование контекста"
                  aria-label="Использование контекста"
                  style={{
                    padding: 0,
                    border: 'none',
                    background: 'transparent',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {contextLoading && !contextPreview ? (
                    <span style={{ fontSize: '14px' }}>…</span>
                  ) : contextPreview ? (
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: `conic-gradient(var(--blue, #0969da) 0deg ${contextPreview.contextUsagePercent * 3.6}deg, var(--border, #30363d) ${contextPreview.contextUsagePercent * 3.6}deg 360deg)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative'
                      }}
                    >
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: 'var(--bg-secondary, #161b22)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '9px',
                          fontWeight: '600',
                          color: 'var(--text-secondary, #c9d1d9)'
                        }}
                      >
                        {contextPreview.contextUsagePercent}%
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: '14px' }}>◎</span>
                  )}
                </button>

                {contextPopoverOpen && contextPreview && (
                  <div className={styles.contextPopover} role="tooltip">
                    <div className={styles.ctxTitle}>Контекст модели</div>
                    <div className={styles.ctxRows}>
                      {contextPreview.sections.map((s) => (
                        <div key={s.id} className={styles.ctxRow}>
                          <span className={styles.ctxRowName}>{s.title}</span>
                          <span className={styles.ctxRowVal}>
                            ~{(s.charCount / 4000).toFixed(1)}k tok
                            <span className={styles.ctxRowKb}>
                              {' '}
                              ({(s.charCount / 1024).toFixed(1)} KB)
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className={styles.ctxBar}>
                      <div
                        className={styles.ctxBarFill}
                        style={{
                          width: `${Math.min(100, contextPreview.contextUsagePercent)}%`,
                          background:
                            contextPreview.contextUsagePercent >= 90
                              ? 'var(--red, #f85149)'
                              : contextPreview.contextUsagePercent >= 70
                                ? 'var(--yellow, #d29922)'
                                : 'var(--blue, #1f6feb)'
                        }}
                      />
                    </div>
                    <div className={styles.ctxTotal}>
                      ~{contextPreview.estimatedTokens.toLocaleString('ru-RU')} /{' '}
                      {contextPreview.contextLimitTokens.toLocaleString('ru-RU')} tok
                    </div>
                    <button
                      type="button"
                      className={styles.ctxDetails}
                      onClick={() => {
                        setContextPopoverOpen(false)
                        setContextModalOpen(true)
                      }}
                    >
                      Детали →
                    </button>
                    {contextPreview.contextUsagePercent > 60 && (
                      <button
                        type="button"
                        className={styles.ctxDetails}
                        style={{ marginTop: 4, opacity: summarizing ? 0.6 : 1 }}
                        disabled={summarizing}
                        onClick={() => void handleSummarizeContext()}
                        title="Суммаризировать старые сообщения, чтобы освободить контекст"
                      >
                        {summarizing ? 'Сжимаю…' : 'Сжать историю'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

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
    </div>
  )
})
