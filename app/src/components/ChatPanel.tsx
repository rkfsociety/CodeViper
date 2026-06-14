import { useEffect, useRef, useState } from 'react'
import { makeId } from '../../shared/makeId'
import { compactToolChatLine } from '../../shared/toolDisplay'
import { sanitizeAssistantContent } from '../../shared/toolCalls'
import type { AgentContextPreview, AgentSettings, ChatMessage } from '../types'
import { AgentStatusBar, type AgentPhase } from './AgentStatusBar'
import { AgentContextBar } from './AgentContextBar'
import { AgentContextModal } from './AgentContextModal'
import { MessageBody } from './MessageBody'
import { MessageCopyButton } from './MessageCopyButton'

interface Props {
  settings: AgentSettings
  projectPath: string
  chatId: string | null
  messages: ChatMessage[]
  onMessagesChange: (messages: ChatMessage[]) => void
  onBusyChange?: (busy: boolean) => void
  onLearningSaved?: () => void
  onPickProject: () => void
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

export function ChatPanel({
  settings,
  projectPath,
  chatId,
  messages,
  onMessagesChange,
  onBusyChange,
  onLearningSaved,
  onPickProject
}: Props) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [agentPhase, setAgentPhase] = useState<AgentPhase>('thinking')
  const [activeToolName, setActiveToolName] = useState<string | undefined>()
  const [contextPreview, setContextPreview] = useState<AgentContextPreview | null>(null)
  const [contextLoading, setContextLoading] = useState(false)
  const [contextModalOpen, setContextModalOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef(messages)
  const chatIdRef = useRef(chatId)
  const onMessagesChangeRef = useRef(onMessagesChange)
  const onLearningSavedRef = useRef(onLearningSaved)
  const runIdRef = useRef(0)
  const doneRunIdRef = useRef(-1)
  const lastAssistantContentRef = useRef('')
  const activeToolMessageIdRef = useRef<string | null>(null)

  messagesRef.current = messages
  chatIdRef.current = chatId
  onMessagesChangeRef.current = onMessagesChange
  onLearningSavedRef.current = onLearningSaved

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
    setInput('')
    setBusy(false)
    setAgentPhase('thinking')
    setActiveToolName(undefined)
    activeToolMessageIdRef.current = null
    lastAssistantContentRef.current = ''
    setContextPreview(null)
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

      if (event.type === 'token') {
        setAgentPhase('writing')
        setDraft((prev) => prev + (event.content ?? ''))
      }

      if (event.type === 'clear_draft') {
        setDraft('')
      }

      if (event.type === 'assistant') {
        setDraft('')
        const cleaned = visibleAssistantContent(event.content ?? '')
        if (!cleaned || lastAssistantContentRef.current === cleaned) return
        lastAssistantContentRef.current = cleaned
        appendMessage({
          id: makeId(),
          role: 'assistant',
          content: cleaned,
          timestamp: Date.now()
        })
      }

      if (event.type === 'tool_start') {
        setDraft('')
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

      if (event.type === 'context' && event.contextPreview) {
        setContextPreview(event.contextPreview)
      }

      if (event.type === 'done') {
        const runId = runIdRef.current
        if (doneRunIdRef.current === runId) return
        doneRunIdRef.current = runId
        setDraft('')
        setBusy(false)
        setAgentPhase('thinking')
        setActiveToolName(undefined)
        activeToolMessageIdRef.current = null
      }
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, draft])

  async function send() {
    const text = input.trim()
    if (!text || busy || !projectPath || !settings.model || !chatId) return

    runIdRef.current += 1
    doneRunIdRef.current = -1
    lastAssistantContentRef.current = ''
    activeToolMessageIdRef.current = null

    const userMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    }

    appendMessage(userMessage)
    setInput('')
    setBusy(true)
    setAgentPhase('thinking')
    setActiveToolName(undefined)
    setDraft('')

    try {
      await window.codeviper.runAgent(
        settings,
        projectPath,
        chatId,
        messagesRef.current.slice(0, -1),
        text
      )
    } catch (error) {
      setBusy(false)
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

  async function stopAgent() {
    if (!busy) return
    await window.codeviper.stopAgent()
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter') return

    if (e.ctrlKey) {
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
          <div className="empty">
            🐍 CodeViper готов. Опиши задачу — агент прочитает файлы, внесёт правки и запустит команды.
          </div>
        )}

        {messages.filter(shouldShowAssistantMessage).map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-header">
              <div className="message-role">{message.role}</div>
              <MessageCopyButton text={messageCopyText(message)} />
            </div>
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

        {visibleDraft && (
          <div className="message assistant">
            <div className="message-header">
              <div className="message-role">assistant</div>
              <MessageCopyButton text={visibleDraft} />
            </div>
            <MessageBody role="assistant" content={visibleDraft} />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input">
        {busy && (
          <AgentStatusBar phase={agentPhase} toolName={activeToolName} model={settings.model} />
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Например: добавь валидацию email в форму регистрации"
          disabled={busy || !chatId}
        />
        <div className="chat-input-actions">
          <span className="empty">
            {!chatId
              ? 'Сначала создай чат слева'
              : !projectPath
                ? 'Сначала выбери проект для этого чата'
              : busy
                ? null
                : 'Enter — отправить, Ctrl+Enter — новая строка'}
          </span>
          <div className="chat-input-buttons">
            {busy && (
              <button type="button" className="btn danger" onClick={() => void stopAgent()}>
                Стоп
              </button>
            )}
            <button
              className="btn primary"
              onClick={send}
              disabled={busy || !settings.model || !chatId || !projectPath}
            >
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
