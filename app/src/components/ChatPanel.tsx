import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { makeId } from '../../shared/makeId'
import { sanitizeAssistantContent } from '../../shared/toolCalls'
import type { AgentSettings, ChatMessage } from '../types'
import { AgentStatusBar } from './AgentStatusBar'
import { AgentContextBar } from './AgentContextBar'
import { AgentContextModal } from './AgentContextModal'
import { AgentPrerequisitesBanner } from './AgentPrerequisitesBanner'
import { MessageBody } from './MessageBody'
import { MessageCopyButton } from './MessageCopyButton'
import { MessageRoleBadge } from './MessageRoleBadge'
import { ThinkingBlock } from './ThinkingBlock'
import { QuickPromptBar } from './QuickPromptBar'
import { WelcomePanel } from './WelcomePanel'
import { useContextPreview } from '../hooks/useContextPreview'
import { useAgentStream } from '../hooks/useAgentStream'
import { useMessageQueue, type PrerequisiteBlock, type DangerBlock } from '../hooks/useMessageQueue'
import { ConfirmDialog } from './ConfirmDialog'

export interface ChatPanelHandle {
  insertPath: (path: string) => void
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
  const { contextPreview, contextLoading, setContextPreview } = useContextPreview(
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
    setContextPreview
  })

  // ── Хук: очередь сообщений и запуск агента ───────────────────────────────
  const {
    submitMessage,
    confirmDangerRun,
    stopAgent,
    executeRun,
    resetQueue,
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

  // ── Prerequisites ────────────────────────────────────────────────────────
  async function retryAfterPrerequisites() {
    if (!prerequisiteBlock) return
    const { pendingRun } = prerequisiteBlock

    const prereq = await window.codeviper.checkAgentPrerequisites(
      settingsRef.current.ollamaUrl,
      projectPathRef.current
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
  function insertPrompt(text: string) {
    setInput((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${text}` : text))
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      const len = inputRef.current?.value.length ?? 0
      inputRef.current?.setSelectionRange(len, len)
    })
  }

  useImperativeHandle(ref, () => ({ insertPath: (path: string) => insertPrompt(path) }))

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
  const visibleDraft = visibleAssistantContent(draft)

  const lastVisibleMessage = [...messages].reverse().find(shouldShowAssistantMessage)
  const awaitingClarification =
    settings.clarifyMode &&
    !busy &&
    !!chatId &&
    !!projectPath &&
    lastVisibleMessage?.role === 'assistant'

  return (
    <div className="chat-main">
      {chatId && (
        <div className="chat-project-bar">
          <div className="chat-project-info" title={projectPath || undefined}>
            <span className="chat-project-label">📁 {formatProjectLabel(projectPath)}</span>
            {projectPath && <span className="chat-project-path">{projectPath}</span>}
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

      <div className="chat-messages">
        {!chatId && (
          <div className="empty">Создай чат слева, выбери проект и опиши задачу.</div>
        )}
        {chatId && !projectPath && !messages.length && !draft && (
          <div className="empty">Выбери папку с кодом — кнопка «Выбрать проект» выше.</div>
        )}
        {chatId && projectPath && !messages.length && !draft && (
          <WelcomePanel onSelect={insertPrompt} />
        )}

        {messages.filter(shouldShowAssistantMessage).map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-header">
              <MessageRoleBadge role={message.role} toolName={message.toolName} />
              <MessageCopyButton text={messageCopyText(message)} />
            </div>
            {message.role === 'assistant' && message.thinking && (
              <ThinkingBlock content={message.thinking} />
            )}
            <MessageBody
              role={message.role}
              content={
                message.role === 'assistant'
                  ? visibleAssistantContent(message.content)
                  : message.content
              }
            />
          </div>
        ))}

        {(visibleDraft || draftThinking) && (
          <div className="message assistant draft">
            <div className="message-header">
              <MessageRoleBadge role="assistant" />
              {visibleDraft && <MessageCopyButton text={visibleDraft} />}
            </div>
            {draftThinking && <ThinkingBlock content={draftThinking} live />}
            {visibleDraft && <MessageBody role="assistant" content={visibleDraft} />}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {awaitingClarification && (
        <div className="clarify-banner" role="status">
          <span className="clarify-banner-icon">💬</span>
          <span>Агент ждёт ответа на уточнение</span>
        </div>
      )}

      <div className="chat-input">
        {busy && (
          <AgentStatusBar
            phase={agentPhase}
            toolName={activeToolName}
            model={runModel || settings.model}
            queueSize={queueSize}
            summarizing={summarizing}
            generationMetrics={generationMetrics}
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
        <div className="chat-input-actions">
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
          <div className="chat-input-buttons">
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
