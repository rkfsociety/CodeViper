import { useEffect, useRef, useState } from 'react'
import { makeId } from '../../shared/makeId'
import { sanitizeAssistantContent } from '../../shared/toolCalls'
import type { AgentSettings, ChatMessage } from '../types'
import { AgentStatusBar, type AgentPhase } from './AgentStatusBar'
import { MessageBody } from './MessageBody'

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

const MAX_TOOL_OUTPUT_LINES = 50

function formatProjectLabel(path: string): string {
  if (!path.trim()) return 'Проект не выбран'
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function formatToolInput(input: string | undefined): string {
  if (!input || input.trim() === '{}') return ''
  return input
}

function formatToolOutput(output: string): string {
  const lines = output.split('\n')
  if (lines.length <= MAX_TOOL_OUTPUT_LINES) return output
  return `${lines.slice(0, MAX_TOOL_OUTPUT_LINES).join('\n')}\n… ещё ${lines.length - MAX_TOOL_OUTPUT_LINES} строк`
}

function formatToolMessage(prefix: string, name: string | undefined, body: string): string {
  const line = `${prefix} ${name ?? 'tool'}`
  return body ? `${line}\n${body}` : line
}

function visibleAssistantContent(content: string): string {
  return sanitizeAssistantContent(content)
}

function shouldShowAssistantMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return true
  return visibleAssistantContent(message.content).length > 0
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
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef(messages)
  const chatIdRef = useRef(chatId)
  const onMessagesChangeRef = useRef(onMessagesChange)
  const onLearningSavedRef = useRef(onLearningSaved)
  const runIdRef = useRef(0)
  const doneRunIdRef = useRef(-1)

  messagesRef.current = messages
  chatIdRef.current = chatId
  onMessagesChangeRef.current = onMessagesChange
  onLearningSavedRef.current = onLearningSaved

  function appendMessage(message: ChatMessage) {
    const next = [...messagesRef.current, message]
    messagesRef.current = next
    onMessagesChangeRef.current(next)
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
  }, [chatId])

  useEffect(() => {
    const unsubscribe = window.codeviper.onAgentStream((event) => {
      if (event.chatId !== chatIdRef.current) return
      if (event.type === 'token') {
        setAgentPhase('writing')
        setDraft((prev) => prev + (event.content ?? ''))
      }

      if (event.type === 'tool_start') {
        setDraft('')
        setAgentPhase('tool')
        setActiveToolName(event.toolName)
        appendMessage({
          id: makeId(),
          role: 'tool',
          content: formatToolMessage('▶', event.toolName, formatToolInput(event.toolInput)),
          toolName: event.toolName,
          timestamp: Date.now()
        })
      }

      if (event.type === 'tool_end') {
        setAgentPhase('thinking')
        setActiveToolName(undefined)
        appendMessage({
          id: makeId(),
          role: 'tool',
          content: formatToolMessage(
            '✓',
            event.toolName,
            formatToolOutput(event.toolOutput ?? '')
          ),
          toolName: event.toolName,
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

      if (event.type === 'done') {
        const runId = runIdRef.current
        if (doneRunIdRef.current === runId) return
        doneRunIdRef.current = runId

        setDraft((current) => {
          const cleaned = visibleAssistantContent(current)
          if (cleaned) {
            appendMessage({
              id: makeId(),
              role: 'assistant',
              content: cleaned,
              timestamp: Date.now()
            })
          }
          return ''
        })
        setBusy(false)
        setAgentPhase('thinking')
        setActiveToolName(undefined)
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
            <div className="message-role">{message.role}</div>
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
            <div className="message-role">assistant</div>
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
