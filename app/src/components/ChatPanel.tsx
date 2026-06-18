import {
  forwardRef,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import { makeId } from '../../shared/makeId'
import { sanitizeAssistantContent } from '../../shared/toolCalls'
import type { AgentSettings, ChatMessage, ProgressInfo, SystemStats } from '../types'
import { AgentStatusBar } from './AgentStatusBar'
import styles from './ChatPanel.module.css'
import { AgentContextBar } from './AgentContextBar'
import { AgentContextModal } from './AgentContextModal'
import { AgentPrerequisitesBanner } from './AgentPrerequisitesBanner'
const MessageBody = lazy(() => import('./MessageBody').then((m) => ({ default: m.MessageBody })))
import { MessageCopyButton } from './MessageCopyButton'
import { MessageRoleBadge } from './MessageRoleBadge'
import { ThinkingBlock } from './ThinkingBlock'
import { QuickPromptBar } from './QuickPromptBar'
import { WelcomePanel } from './WelcomePanel'
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
  return visibleAssistantContent(message.content).length > 0
}

function messageCopyText(message: ChatMessage): string {
  if (message.role === 'assistant') return visibleAssistantContent(message.content)
  if (message.role === 'tool' && message.toolOutput?.trim()) return message.toolOutput
  return message.content
}

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
    onRefreshOllama
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

  const bottomRef = useRef<HTMLDivElement>(null)
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

  // ── Хук: контекст-превью (debounce 350 ms) ──────────────────────────────
  const { contextPreview, contextLoading, contextError, setContextPreview } = useContextPreview(
    chatId,
    projectPath,
    messages,
    input,
    settings.model
  )

  // ── Хук: стрим событий агента ────────────────────────────────────────────
  const {
    draft,
    draftThinking,
    agentPhase,
    activeToolName,
    summarizing,
    generationMetrics,
    runModel,
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
    onDangerWarning: setDangerBlock
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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, draft, queueSize])

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

  const rawDraft = visibleAssistantContent(draft)
  // Task 27: suppress draft if last committed assistant message has identical content (race guard)
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant')
  const visibleDraft =
    rawDraft && lastAssistantMsg && visibleAssistantContent(lastAssistantMsg.content) === rawDraft
      ? ''
      : rawDraft

  const lastVisibleMessage = [...messages].reverse().find(shouldShowAssistantMessage)
  const awaitingClarification =
    settings.clarifyMode &&
    !busy &&
    !!chatId &&
    !!projectPath &&
    lastVisibleMessage?.role === 'assistant'

  return (
    <div className={styles.main}>
      {chatId && (
        <div className={styles.projectBar}>
          <div className={styles.projectInfo} title={projectPath || undefined}>
            <span className={styles.projectLabel}>📁 {formatProjectLabel(projectPath)}</span>
            {projectPath && <span className={styles.projectPath}>{projectPath}</span>}
          </div>
          {!projectLocked && (
            <button type="button" className="btn" onClick={onPickProject} disabled={busy}>
              {projectPath ? 'Сменить проект' : 'Выбрать проект'}
            </button>
          )}
        </div>
      )}

      {chatId && (
        <AgentContextBar
          preview={contextPreview}
          loading={contextLoading}
          error={contextError}
          onOpen={() => setContextModalOpen(true)}
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

      <div className={styles.messages}>
        {!chatId && <div className="empty">Создай чат слева, выбери проект и опиши задачу.</div>}
        {chatId && !projectPath && !messages.length && !draft && (
          <div className="empty">Выбери папку с кодом — кнопка «Выбрать проект» выше.</div>
        )}
        {chatId && projectPath && !messages.length && !draft && (
          <WelcomePanel onSelect={insertPrompt} />
        )}

        {pinnedMessageIds.size > 0 && (
          <div className="pinned-messages-section">
            <div className="pinned-messages-title">📌 Закреплённые</div>
            {messages
              .filter((m) => pinnedMessageIds.has(m.id) && shouldShowAssistantMessage(m))
              .map((message) => (
                <div key={message.id} className={`message ${message.role} pinned`}>
                  <div className="message-header">
                    <MessageRoleBadge role={message.role} toolName={message.toolName} />
                    <button
                      type="button"
                      className="btn message-pin-btn active"
                      title="Открепить"
                      onClick={() => togglePinMessage(message.id)}
                    >
                      📌
                    </button>
                  </div>
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
              ))}
          </div>
        )}

        {messages.filter(shouldShowAssistantMessage).map((message) => (
          <div
            key={message.id}
            className={`message ${message.role}${pinnedMessageIds.has(message.id) ? ' pinned' : ''}`}
          >
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
                  className={`btn message-pin-btn${pinnedMessageIds.has(message.id) ? ' active' : ''}`}
                  title={pinnedMessageIds.has(message.id) ? 'Открепить' : 'Закрепить'}
                  aria-label={
                    pinnedMessageIds.has(message.id) ? 'Открепить сообщение' : 'Закрепить сообщение'
                  }
                  aria-pressed={pinnedMessageIds.has(message.id)}
                  onClick={() => togglePinMessage(message.id)}
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
                    onClick={() => void retryUserMessage(message)}
                  >
                    ↺
                  </button>
                  <button
                    type="button"
                    className="btn message-action-btn"
                    title="Изменить"
                    aria-label="Редактировать запрос"
                    onClick={() => editUserMessage(message)}
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
        ))}

        {(visibleDraft || draftThinking) && (
          <div className="message assistant draft">
            <div className="message-header">
              <MessageRoleBadge role="assistant" />
              {visibleDraft && <MessageCopyButton text={visibleDraft} />}
            </div>
            {draftThinking && <ThinkingBlock content={draftThinking} live />}
            {visibleDraft && (
              <Suspense fallback={null}>
                <MessageBody role="assistant" content={visibleDraft} />
              </Suspense>
            )}
          </div>
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
        {chatId && projectPath && (
          <QuickPromptBar onInsert={insertPrompt} disabled={!chatId || !projectPath} />
        )}
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Например: добавь валидацию email в форму регистрации"
          disabled={!chatId}
        />
        <div className={styles.inputActions}>
          <span className="empty">
            {!chatId
              ? 'Сначала создай чат слева'
              : !projectPath
                ? 'Сначала выбери проект для этого чата'
                : agentRunning
                  ? queueSize > 0
                    ? `Enter — в очередь (${queueSize} ожидают), Shift+Enter — новая строка`
                    : 'Enter — в очередь, Shift+Enter — новая строка'
                  : 'Enter — отправить, Shift+Enter — новая строка'}
          </span>
          <div className={styles.inputButtons}>
            {(agentRunning || queueSize > 0) && (
              <button type="button" className="btn danger" onClick={() => void stopAgent()}>
                Стоп
              </button>
            )}
            <button
              className="btn primary"
              onClick={() => void send()}
              disabled={!settings.model || !chatId || !projectPath || !input.trim()}
            >
              {agentRunning ? 'В очередь' : 'Отправить'}
            </button>
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
