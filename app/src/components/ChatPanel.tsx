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
  ProgressInfo,
  SystemStats
} from '../types'
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
import { AllToolsGroup } from './AllToolsGroup'
import { useContextPreview } from '../hooks/useContextPreview'
import { useAgentStream } from '../hooks/useAgentStream'
import { useMessageQueue, type PrerequisiteBlock, type DangerBlock } from '../hooks/useMessageQueue'
import { useAppStateSync } from '../hooks/useAppStateSync'
import { ConfirmDialog } from './ConfirmDialog'

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
  onActiveModelChange?: (model: string) => void
  onOpenSettings?: () => void
  onEnqueueModel?: (modelName: string) => void
  onRefreshOllama?: () => Promise<void>
  /** Черновик при обрыве стрима (из activeChat) */
  interruptedDraft?: InterruptedDraft | null
  /** Вызывается после сохранения/очистки черновика для обновления chatStore */
  onInterruptedDraftChange?: () => void
  /** Вызывается при изменении статистики текущего прогона (время + токены) */
  onRunStatsChange?: (stats: import('../../shared/generationMetrics').RunStats | null) => void
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

// AllToolsBlock заменён на AllToolsGroup (см. ./AllToolsGroup.tsx)

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
    onActiveModelChange,
    onOpenSettings,
    onEnqueueModel,
    onRefreshOllama,
    interruptedDraft,
    onInterruptedDraftChange,
    onRunStatsChange
  },
  ref
) {
  const [input, setInput] = useState('')
  const [prerequisiteBlock, setPrerequisiteBlock] = useState<PrerequisiteBlock | null>(null)
  const [dangerBlock, setDangerBlock] = useState<DangerBlock | null>(null)
  const [contextModalOpen, setContextModalOpen] = useState(false)
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Set<string>>(new Set())
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null)
  const [progress, setProgress] = useState<ProgressInfo | null>(null)
  const [showQuickBar, setShowQuickBar] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
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

  // ── Хук: стрим событий агента ────────────────────────────────────────────
  const {
    draftRef,
    agentPhase,
    activeToolName,
    summarizing,
    generationMetrics,
    runModel,
    runStats,
    resetStreamState
  } = useAgentStream({
    chatIdRef,
    runIdRef,
    doneRunIdRef,
    onLearningSavedRef,
    onActiveModelChangeRef,
    processNextQueuedRunRef,
    appendMessage,
    upsertMessage,
    setContextPreview,
    onAgentDoneRef
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

  // ── Сброс при смене чата ─────────────────────────────────────────────────
  useEffect(() => {
    setInput('')
    setPrerequisiteBlock(null)
    setContextPreview(null)
    resetStreamState()
    resetQueue()
  }, [chatId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onRunStatsChange?.(runStats)
  }, [runStats, onRunStatsChange])

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

    const userMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    }
    appendMessage(userMessage)
    setInput('')
    atBottomRef.current = true
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    await submitMessage(userMessage.id, text)
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
    if (!contextPreview) return styles.footerChip
    const pct = contextPreview.contextUsagePercent
    if (pct >= 90) return `${styles.footerChip} ${styles.footerChipDanger}`
    if (pct >= 70) return `${styles.footerChip} ${styles.footerChipWarn}`
    return styles.footerChip
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
                <AllToolsGroup key={item.key} items={item.items} />
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
                    />
                  </Suspense>
                </div>
              )
            )}
          </div>
        )}

        {displayItems.map((item) =>
          item.kind === 'all-tools' ? (
            <AllToolsGroup key={item.key} items={item.items} />
          ) : (
            <MessageRow
              key={item.message.id}
              message={item.message}
              pinned={pinnedMessageIds.has(item.message.id)}
              busy={busy}
              onPin={togglePinMessage}
              onRetry={retryUserMessage}
              onEdit={editUserMessage}
            />
          )
        )}

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
            phase={agentPhase}
            toolName={activeToolName}
            model={runModel || settings.model}
            queueSize={queueSize}
            summarizing={summarizing}
            generationMetrics={generationMetrics}
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

        <div className={`${styles.inputBox}${inputFocused ? ' ' + styles.inputBoxFocused : ''}`}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder="Напиши задачу… (/ — быстрые промпты)"
            disabled={!chatId}
            rows={3}
          />

          <div className={styles.inputFooter}>
            <div className={styles.footerLeft}>
              {/* Проект */}
              {chatId && (
                <button
                  type="button"
                  className={styles.footerChip}
                  title={projectPath || 'Выбрать проект'}
                  onClick={!projectLocked ? onPickProject : undefined}
                  disabled={busy && !projectLocked}
                  style={!projectLocked ? undefined : { cursor: 'default' }}
                >
                  📁 {projectPath ? formatProjectLabel(projectPath) : 'Проект'}
                </button>
              )}

              {/* Контекст */}
              {chatId && (contextPreview || contextLoading) && (
                <button
                  type="button"
                  className={contextChipClass()}
                  title={
                    contextPreview
                      ? `Контекст: ${contextPreview.contextUsagePercent}% · ~${contextPreview.estimatedTokens.toLocaleString('ru-RU')} tok`
                      : 'Загрузка контекста…'
                  }
                  onClick={() => setContextModalOpen(true)}
                >
                  ◎{' '}
                  {contextLoading && !contextPreview
                    ? '…'
                    : contextPreview
                      ? `${contextPreview.contextUsagePercent}%`
                      : ''}
                  {contextPreview?.historySummarized && ' Σ'}
                  {contextPreview?.historyTruncated && !contextPreview.historySummarized && (
                    <> −{contextPreview.droppedMessageCount}</>
                  )}
                </button>
              )}

              {/* Быстрые промпты */}
              {chatId && projectPath && (
                <button
                  type="button"
                  className={`${styles.footerChip}${showQuickBar ? ' ' + styles.footerChipActive : ''}`}
                  title="Быстрые промпты"
                  onClick={() => setShowQuickBar((v) => !v)}
                >
                  /
                </button>
              )}
            </div>

            <div className={styles.footerRight}>
              {/* Модель */}
              {chatId && (
                <span
                  className={styles.footerChip}
                  style={{ cursor: 'default', pointerEvents: 'none' }}
                  title={settings.model}
                >
                  {formatModelShort(runModel || settings.model)}
                </span>
              )}

              {/* Стоп */}
              {(agentRunning || queueSize > 0) && (
                <button
                  type="button"
                  className={`${styles.footerChip} ${styles.footerChipStop}`}
                  onClick={() => void stopAgent()}
                >
                  ■ Стоп{queueSize > 0 ? ` (${queueSize})` : ''}
                </button>
              )}

              {/* Отправить */}
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
