import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { makeId } from '../../shared/makeId'
import { compactToolChatLine } from '../../shared/toolDisplay'
import { sanitizeAssistantContent } from '../../shared/toolCalls'
import type { AgentContextPreview, AgentPrerequisiteIssue, AgentSettings, ChatMessage } from '../types'
import { formatPrerequisitesMessage } from '../../shared/agentPrerequisites'
import { AgentStatusBar, type AgentPhase } from './AgentStatusBar'
import { AgentContextBar } from './AgentContextBar'
import { AgentContextModal } from './AgentContextModal'
import { AgentPrerequisitesBanner } from './AgentPrerequisitesBanner'
import { MessageBody } from './MessageBody'
import { MessageCopyButton } from './MessageCopyButton'
import { MessageRoleBadge } from './MessageRoleBadge'
import { ThinkingBlock } from './ThinkingBlock'
import { QuickPromptBar } from './QuickPromptBar'
import { WelcomePanel } from './WelcomePanel'

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
  if (message.role === 'assistant') {
    return visibleAssistantContent(message.content)
  }
  if (message.role === 'tool' && message.toolOutput?.trim()) {
    return message.toolOutput
  }
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
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftThinking, setDraftThinking] = useState('')
  const [agentPhase, setAgentPhase] = useState<AgentPhase>('thinking')
  const [activeToolName, setActiveToolName] = useState<string | undefined>()
  const [contextPreview, setContextPreview] = useState<AgentContextPreview | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [contextModalOpen, setContextModalOpen] = useState(false)
  const [prerequisiteBlock, setPrerequisiteBlock] = useState<{
    issues: AgentPrerequisiteIssue[]
    pendingRun: { userMessageId: string; text: string }
    installing: boolean
  } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesRef = useRef(messages)
  const chatIdRef = useRef(chatId)
  const projectPathRef = useRef(projectPath)
  const settingsRef = useRef(settings)
  const onMessagesChangeRef = useRef(onMessagesChange)
  const onLearningSavedRef = useRef(onLearningSaved)
  const onActiveModelChangeRef = useRef(onActiveModelChange)
  const runIdRef = useRef(0)
  const doneRunIdRef = useRef(-1)
  const lastAssistantContentRef = useRef('')
  const activeToolMessageIdRef = useRef<string | null>(null)
  const agentRunningRef = useRef(false)
  const queueRef = useRef<Array<{ id: string; text: string }>>([])
  const processNextQueuedRunRef = useRef<() => Promise<void>>(async () => {})
  const [queueSize, setQueueSize] = useState(0)
  const [agentRunning, setAgentRunning] = useState(false)
  const [runModel, setRunModel] = useState('')

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

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    setDraft('')
    setDraftThinking('')
    setInput('')
    setBusy(false)
    setAgentPhase('thinking')
    setActiveToolName(undefined)
    activeToolMessageIdRef.current = null
    lastAssistantContentRef.current = ''
    setContextPreview(null)
    setSummarizing(false)
    queueRef.current = []
    setQueueSize(0)
    agentRunningRef.current = false
    setAgentRunning(false)
  }, [chatId])

  useEffect(() => {
    if (!chatId || !settings.model) {
      setContextPreview(null)
      return
    }

    const timer = window.setTimeout(async () => {
      setContextLoading(true)
      try {
        const preview = await window.codeviper.previewAgentContext(
          projectPath,
          messages,
          input.trim(),
          settings.model
        )
        setContextPreview(preview)
      } catch {
        setContextPreview(null)
      } finally {
        setContextLoading(false)
      }
    }, 350)

    return () => window.clearTimeout(timer)
  }, [chatId, projectPath, messages, input, settings.model])

  useEffect(() => {
    const unsubscribe = window.codeviper.onAgentStream((event) => {
      if (event.chatId !== chatIdRef.current) return

      if (event.type === 'thinking') {
        setAgentPhase('thinking')
        setDraftThinking((prev) => prev + (event.content ?? ''))
      }

      if (event.type === 'token') {
        setAgentPhase('writing')
        setDraft((prev) => prev + (event.content ?? ''))
      }

      if (event.type === 'clear_draft') {
        setDraft('')
        setDraftThinking('')
      }

      if (event.type === 'assistant') {
        setDraft('')
        const thinking = event.thinking?.trim() || undefined
        setDraftThinking('')
        const cleaned = visibleAssistantContent(event.content ?? '')
        if (!cleaned || lastAssistantContentRef.current === cleaned) return
        lastAssistantContentRef.current = cleaned
        appendMessage({
          id: makeId(),
          role: 'assistant',
          content: cleaned,
          thinking,
          timestamp: Date.now()
        })
      }

      if (event.type === 'tool_start') {
        setDraft('')
        setDraftThinking('')
        setAgentPhase('tool')
        setActiveToolName(event.toolName)
        const id = makeId()
        activeToolMessageIdRef.current = id
        upsertMessage({
          id,
          role: 'tool',
          content: compactToolChatLine(event.toolName, undefined, 'start'),
          toolName: event.toolName,
          timestamp: Date.now()
        })
      }

      if (event.type === 'tool_end') {
        setAgentPhase('thinking')
        setActiveToolName(undefined)
        const id = activeToolMessageIdRef.current ?? makeId()
        activeToolMessageIdRef.current = null
        upsertMessage({
          id,
          role: 'tool',
          content: compactToolChatLine(event.toolName, event.toolOutput, 'end'),
          toolName: event.toolName,
          toolOutput: event.toolOutput,
          timestamp: Date.now()
        })
      }

      if (event.type === 'error') {
        appendMessage({
          id: makeId(),
          role: 'system',
          content: event.content ?? '',
          timestamp: Date.now()
        })
      }

      if (event.type === 'learning_saved') {
        appendMessage({
          id: makeId(),
          role: 'system',
          content: `🧠 Запомнено: ${event.content ?? ''}`,
          timestamp: Date.now()
        })
        onLearningSavedRef.current?.()
      }

      if (event.type === 'skill_saved') {
        appendMessage({
          id: makeId(),
          role: 'system',
          content: `🛠️ Навык сохранён: ${event.content ?? ''}${event.skillId ? ` (${event.skillId})` : ''}`,
          timestamp: Date.now()
        })
        onLearningSavedRef.current?.()
      }

      if (event.type === 'self_improve_plan') {
        appendMessage({
          id: makeId(),
          role: 'system',
          content: event.content ?? '',
          timestamp: Date.now()
        })
      }

      if (event.type === 'model_selected') {
        const model = event.selectedModel ?? ''
        if (model) {
          setRunModel(model)
          onActiveModelChangeRef.current?.(model)
        }
        appendMessage({
          id: makeId(),
          role: 'system',
          content: event.content ?? `🤖 Модель: ${model}`,
          timestamp: Date.now()
        })
      }

      if (event.type === 'context') {
        if (typeof event.summarizing === 'boolean') {
          setSummarizing(event.summarizing)
        }
        if (event.contextPreview) {
          setContextPreview(event.contextPreview)
        } else if (event.content) {
          // Уведомления о контексте (суммаризация, CPU, автокоммит) — раньше терялись.
          appendMessage({
            id: makeId(),
            role: 'system',
            content: event.content,
            timestamp: Date.now()
          })
        }
      }

      if (event.type === 'done') {
        const runId = runIdRef.current
        if (doneRunIdRef.current === runId) return
        doneRunIdRef.current = runId
        setDraft('')
        setDraftThinking('')
        setAgentPhase('thinking')
        setActiveToolName(undefined)
        setSummarizing(false)
        activeToolMessageIdRef.current = null
        void processNextQueuedRunRef.current()
      }
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, draft, queueSize])

  function syncBusyState(running: boolean, queued: number) {
    setBusy(running || queued > 0)
  }

  async function executeRun(userMessageId: string, text: string) {
    const project = projectPathRef.current
    const chat = chatIdRef.current
    const currentSettings = settingsRef.current
    if (!project || !chat) return

    agentRunningRef.current = true
    setAgentRunning(true)
    syncBusyState(true, queueRef.current.length)

    runIdRef.current += 1
    doneRunIdRef.current = -1
    lastAssistantContentRef.current = ''
    activeToolMessageIdRef.current = null
    setAgentPhase('thinking')
    setActiveToolName(undefined)
    setDraft('')

    const prereq = await window.codeviper.checkAgentPrerequisites(
      currentSettings.ollamaUrl,
      project
    )
    if (!prereq.ok) {
      agentRunningRef.current = false
      setAgentRunning(false)
      syncBusyState(false, queueRef.current.length)
      setAgentPhase('thinking')
      setPrerequisiteBlock({
        issues: prereq.issues,
        pendingRun: { userMessageId, text },
        installing: false
      })
      appendMessage({
        id: makeId(),
        role: 'system',
        content: formatPrerequisitesMessage(prereq.issues),
        timestamp: Date.now()
      })
      return
    }

    if (!currentSettings.model.trim()) {
      agentRunningRef.current = false
      setAgentRunning(false)
      syncBusyState(false, queueRef.current.length)
      appendMessage({
        id: makeId(),
        role: 'system',
        content: 'Модель не выбрана. Скачайте модель в настройках.',
        timestamp: Date.now()
      })
      return
    }

    const idx = messagesRef.current.findIndex((item) => item.id === userMessageId)
    const history = idx >= 0 ? messagesRef.current.slice(0, idx) : messagesRef.current

    try {
      await window.codeviper.runAgent(
        currentSettings,
        project,
        chat,
        history,
        text
      )
    } catch (error) {
      agentRunningRef.current = false
      setAgentRunning(false)
      syncBusyState(false, queueRef.current.length)
      setAgentPhase('thinking')
      setActiveToolName(undefined)
      appendMessage({
        id: makeId(),
        role: 'system',
        content: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      })
    }
  }

  async function processNextQueuedRun() {
    agentRunningRef.current = false
    setAgentRunning(false)

    const next = queueRef.current.shift()
    setQueueSize(queueRef.current.length)

    if (!next) {
      syncBusyState(false, 0)
      return
    }

    await executeRun(next.id, next.text)
  }

  processNextQueuedRunRef.current = processNextQueuedRun

  function insertPrompt(text: string) {
    setInput((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${text}` : text))
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      const len = inputRef.current?.value.length ?? 0
      inputRef.current?.setSelectionRange(len, len)
    })
  }

  useImperativeHandle(ref, () => ({
    insertPath: (path: string) => insertPrompt(path)
  }))

  async function retryAfterPrerequisites() {
    if (!prerequisiteBlock) return
    const { pendingRun } = prerequisiteBlock

    const prereq = await window.codeviper.checkAgentPrerequisites(
      settingsRef.current.ollamaUrl,
      projectPathRef.current
    )
    if (!prereq.ok) {
      setPrerequisiteBlock({
        issues: prereq.issues,
        pendingRun,
        installing: false
      })
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

  function dismissPrerequisites() {
    setPrerequisiteBlock(null)
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

    if (agentRunningRef.current) {
      queueRef.current.push({ id: userMessage.id, text })
      setQueueSize(queueRef.current.length)
      syncBusyState(true, queueRef.current.length)
      return
    }

    await executeRun(userMessage.id, text)
  }

  async function stopAgent() {
    if (!agentRunningRef.current && queueRef.current.length === 0) return
    queueRef.current = []
    setQueueSize(0)
    syncBusyState(agentRunningRef.current, 0)
    if (agentRunningRef.current) {
      await window.codeviper.stopAgent()
    } else {
      agentRunningRef.current = false
      setAgentRunning(false)
      syncBusyState(false, 0)
    }
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
      const cursor = start + 1
      requestAnimationFrame(() => ta.setSelectionRange(cursor, cursor))
      return
    }

    e.preventDefault()
    void send()
  }

  const projectLocked = messages.length > 0
  const visibleDraft = visibleAssistantContent(draft)

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
          onDismiss={dismissPrerequisites}
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

      <div className="chat-input">
        {busy && (
          <AgentStatusBar
            phase={agentPhase}
            toolName={activeToolName}
            model={runModel || settings.model}
            queueSize={queueSize}
            summarizing={summarizing}
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
    </div>
  )
})
