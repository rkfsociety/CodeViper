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
import { makeId } from '../../shared/makeId'
import { sanitizeAssistantContent } from '../../shared/toolCalls'
import type {
  AgentSettings,
  ChatMessage,
  InterruptedDraft,
  OllamaModel,
  ProgressInfo,
  SystemStats
} from '../types'
import { filterToolCallingModels } from '../types'
import { AgentStatusBar } from './AgentStatusBar'
import styles from './ChatPanel.module.css'
import { AgentContextModal } from './AgentContextModal'
import { AgentPrerequisitesBanner } from './AgentPrerequisitesBanner'
const MessageBody = lazy(() => import('./MessageBody').then((m) => ({ default: m.MessageBody })))
import { MessageCopyButton } from './MessageCopyButton'
import { MessageRoleBadge } from './MessageRoleBadge'
import { ThinkingBlock } from './ThinkingBlock'
import { InterruptedDraftBanner } from './InterruptedDraftBanner'
import { QuickPromptBar } from './QuickPromptBar'
import { WelcomePanel } from './WelcomePanel'

import { useContextPreview } from '../hooks/useContextPreview'
import { useAgentStream } from '../hooks/useAgentStream'
import { useMessageQueue, type PrerequisiteBlock, type DangerBlock } from '../hooks/useMessageQueue'
import { useAgentDispatch, useAgentState } from '../contexts/AgentContext'
import { useAppStateSync } from '../hooks/useAppStateSync'
import { ConfirmDialog } from './ConfirmDialog'
import { EditPreviewBlock } from './EditPreviewBlock'

export interface ChatPanelHandle {
  insertPath: (path: string) => void
  focusInput: () => void
}

interface Props {
  settings: AgentSettings
  projectPath: string
  chatId: string | null
  messages: ChatMessage[]
  onMessagesChange: (messages: ChatMessage[]) => void
  onBusyChange?: (busy: boolean) => void
  onLearningSaved?: () => void
  onPickProject: () => void
  models?: OllamaModel[]
  onModelChange?: (model: string, auto: boolean) => void
  onActiveModelChange?: (model: string) => void
  onOpenSettings?: () => void
  onEnqueueModel?: (modelName: string) => void
  onRefreshOllama?: () => Promise<void>
  /** Черновик при обрыве стрима (из activeChat) */
  interruptedDraft?: InterruptedDraft | null
  /** Вызывается после сохранения/очистки черновика для обновления chatStore */
  onInterruptedDraftChange?: () => void
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

// Все подряд идущие tool-вызовы сворачиваются в один блок.
type DisplayItem =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'all-tools'; items: ChatMessage[]; key: string }

function groupToolMessages(messages: ChatMessage[]): DisplayItem[] {
  const result: DisplayItem[] = []
  let pendingTools: ChatMessage[] = []

  function flushTools() {
    if (pendingTools.length > 0) {
      const key = `tools-${pendingTools[0].id}`
      result.push({ kind: 'all-tools', items: pendingTools, key })
      pendingTools = []
    }
  }

  for (const msg of messages) {
    if (msg.role === 'tool') {
      pendingTools.push(msg)
    } else {
      // Сбрасываем накопленные tool-сообщения перед любым не-tool сообщением
      // (assistant, user, system), чтобы они не «прилипали» к следующей группе
      if (pendingTools.length > 0) {
        flushTools()
      }
      result.push({ kind: 'message', message: msg })
    }
  }

  // Оставшиеся tool-сообщения в конце
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
  onPin,
  onRetry,
  onEdit
}: {
  message: ChatMessage
  pinned: boolean
  busy: boolean
  onPin: (id: string) => void
  onRetry: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
}) {
  return (
    <div className={`message ${message.role}${pinned ? ' pinned' : ''}`}>
      <div className="message-header">
        <MessageRoleBadge role={message.role} toolName={message.toolName} />
        {message.role === 'assistant' && message.durationMs != null && (
          <span className="message-duration" title="Время генерации">
            ⏱ {(message.durationMs / 1000).toFixed(1)}s
          </span>
        )}
        <MessageCopyButton text={messageCopyText(message)} />
        {!busy && (
          <button
            type="button"
            className={`btn message-pin-btn${pinned ? ' active' : ''}`}
            title={pinned ? 'Открепить' : 'Закрепить'}
            aria-label={pinned ? 'Открепить сообщение' : 'Закрепить сообщение'}
            aria-pressed={pinned}
            onClick={() => onPin(message.id)}
          >
            📌
          </button>
        )}
        {!busy && message.role === 'user' && (
          <>
            <button
              type="button"
              className="btn message-action-btn"
              title="Повторить"
              aria-label="Повторить запрос"
              onClick={() => onRetry(message)}
            >
              ↺
            </button>
            <button
              type="button"
              className="btn message-action-btn"
              title="Изменить"
              aria-label="Редактировать запрос"
              onClick={() => onEdit(message)}
            >
              ✎
            </button>
          </>
        )}
      </div>
      {message.role === 'assistant' && message.thinking && (
        <ThinkingBlock content={message.thinking} />
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
        />
      </Suspense>
    </div>
  )
})

export const ChatPanel = forwardRef<ChatPanelHandle, Props>(function ChatPanel(
  {
    settings,
    projectPath,
    chatId,
    messages,
    onMessagesChange,
    onBusyChange,
    onLearningSaved,
    onPickProject,
    models = [],
    onModelChange,
    onActiveModelChange,
    onOpenSettings,
    onEnqueueModel,
    onRefreshOllama,
    interruptedDraft,
    onInterruptedDraftChange
  },
  ref
) {
  const [input, setInput] = useState('')
  const [droppedFiles, setDroppedFiles] = useState<{ name: string; path: string; size?: number }[]>(
    []
  )
  const [clipboardImages, setClipboardImages] = useState<{ name: string; dataUrl: string }[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [prerequisiteBlock, setPrerequisiteBlock] = useState<PrerequisiteBlock | null>(null)
  const [dangerBlock, setDangerBlock] = useState<DangerBlock | null>(null)
  const [contextModalOpen, setContextModalOpen] = useState(false)
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Set<string>>(new Set())
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null)
  const [progress, setProgress] = useState<ProgressInfo | null>(null)
  const [showQuickBar, setShowQuickBar] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const [contextPopoverOpen, setContextPopoverOpen] = useState(false)
  const contextPopoverRef = useRef<HTMLDivElement>(null)
  // contextPreview вынесен сюда чтобы и useAgentStream, и useContextPreview могли обновлять его
  const [contextPreview, setContextPreview] = useState<
    import('../types').AgentContextPreview | null
  >(null)
  const [contextLoading, setContextLoading] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef(messages)
  const chatIdRef = useRef(chatId)
  const projectPathRef = useRef(projectPath)
  const settingsRef = useRef(settings)
  const onMessagesChangeRef = useRef(onMessagesChange)
  const onLearningSavedRef = useRef(onLearningSaved)
  const onActiveModelChangeRef = useRef(onActiveModelChange)

  // Координационные рефы между хуками — созданы здесь, переданы в оба.
  const dispatch = useAgentDispatch()
  const { runModel } = useAgentState()

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
  onMessagesChangeRef.current = onMessagesChange
  onLearningSavedRef.current = onLearningSaved
  onActiveModelChangeRef.current = onActiveModelChange

  function commitMessages(next: ChatMessage[]) {
    messagesRef.current = next
    onMessagesChangeRef.current(next)
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
  const { draftRef, resetStreamState } = useAgentStream({
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
    dispatch
  })

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
    onBusyChange,
    onPrerequisiteIssue: setPrerequisiteBlock,
    onDangerWarning: setDangerBlock,
    draftRef,
    onInterruptedDraft: handleInterruptedDraft
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
    inputRef.current?.focus()
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
    resetStreamState()
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

  // draft убран из deps: он встроен в messages через upsertMessage,
  // поэтому messages.length уже меняется при новых сообщениях.
  // Скролл при токенах стриминга (обновление последнего сообщения)
  // обрабатывается отдельным эффектом ниже через messages.
  useEffect(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, queueSize])

  useEffect(() => {
    if (!busy) {
      setSystemStats(null)
      return
    }
    return window.codeviper.onSystemStats(setSystemStats)
  }, [busy])

  useEffect(() => {
    if (!busy) {
      setProgress(null)
      return
    }
    return window.codeviper.onProgressEvent(setProgress)
  }, [busy])

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
      inputRef.current?.focus()
      const len = inputRef.current?.value.length ?? 0
      inputRef.current?.setSelectionRange(len, len)
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
      inputRef.current?.focus()
      const len = inputRef.current?.value.length ?? 0
      inputRef.current?.setSelectionRange(len, len)
    })
  }

  useImperativeHandle(ref, () => ({
    insertPath: (path: string) => insertPrompt(path),
    focusInput: () => inputRef.current?.focus()
  }))

  async function send() {
    const text = input.trim()
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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    await submitMessage(userMessage.id, fullText)
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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

  function contextChipClass(): string {
    if (!contextPreview) return styles.metaBtn
    const pct = contextPreview.contextUsagePercent
    if (pct >= 90) return `${styles.metaBtn} ${styles.footerChipDanger}`
    if (pct >= 70) return `${styles.metaBtn} ${styles.footerChipWarn}`
    return styles.metaBtn
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
              item.kind === 'all-tools' ? null : (
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
                    />
                  </Suspense>
                </div>
              )
            )}
          </div>
        )}

        {displayItems.map((item) => {
          if (item.kind === 'all-tools') return null
          const msg = item.message
          if (msg.previewId && msg.previewDiff !== undefined) {
            return (
              <EditPreviewBlock
                key={msg.id}
                messageId={msg.id}
                previewId={msg.previewId}
                path={msg.previewPath ?? ''}
                diff={msg.previewDiff}
                status={msg.previewStatus ?? 'cancelled'}
                onRespond={respondPreview}
              />
            )
          }
          return (
            <MessageRow
              key={msg.id}
              message={msg}
              pinned={pinnedMessageIds.has(msg.id)}
              busy={busy}
              onPin={togglePinMessage}
              onRetry={retryUserMessage}
              onEdit={editUserMessage}
            />
          )
        })}

        <div ref={bottomRef} />
      </div>

      {awaitingClarification && (
        <div className={styles.clarifyBanner} role="status">
          <span className={styles.clarifyIcon}>💬</span>
          <span>Агент ждёт ответа на уточнение</span>
        </div>
      )}

      <div className={styles.input}>
        {busy && (
          <AgentStatusBar
            model={settings.model}
            queueSize={queueSize}
            systemStats={systemStats}
            progress={progress}
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
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onPaste={handlePaste}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Напиши задачу… (/ — быстрые промпты)"
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
                  inputRef.current?.focus()
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

        {/* Нижняя строка: контекст + модель + проект */}
        {chatId && (
          <div className={styles.inputMeta}>
            <div className={styles.metaLeft}>
              {/* Выбор модели */}
              <div className={styles.modelPicker} ref={modelPickerRef}>
                <button
                  type="button"
                  className={`${styles.metaBtn} ${styles.metaModelBtn}`}
                  title={settings.model}
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
                    {filterToolCallingModels(models).length > 0 && (
                      <div className={styles.modelPickerSep} />
                    )}
                    {filterToolCallingModels(models).map((m) => {
                      const isActive = settings.autoModel === false && settings.model === m.name
                      const shortName = m.name.split(':')[0]
                      const tag = m.name.includes(':') ? m.name.split(':')[1] : undefined
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
                          <span className={styles.modelPickerName}>{shortName}</span>
                          {tag && <span className={styles.modelPickerTag}>{tag}</span>}
                          {isActive && <span className={styles.modelPickerCheck}>✓</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

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

              {/* Кружок контекста */}
              <div className={styles.contextPopoverWrap} ref={contextPopoverRef}>
                <button
                  type="button"
                  className={`${styles.contextCircleBtn} ${contextChipClass()}${contextPopoverOpen ? ' ' + styles.contextCircleActive : ''}`}
                  onClick={() => setContextPopoverOpen((v) => !v)}
                  title="Использование контекста"
                  aria-label="Использование контекста"
                >
                  <span className={styles.contextDot} aria-hidden="true" />
                  {contextLoading && !contextPreview
                    ? '…'
                    : contextPreview
                      ? `${contextPreview.contextUsagePercent}%`
                      : '◎'}
                  {contextPreview?.historySummarized && <span className={styles.metaBadge}>Σ</span>}
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
    </div>
  )
})
