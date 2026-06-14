import { useEffect, useRef, useState } from 'react'
import type { AgentSettings, ChatMessage } from '../types'

interface Props {
  settings: AgentSettings
  projectPath: string
  chatId: string | null
  messages: ChatMessage[]
  onMessagesChange: (messages: ChatMessage[]) => void
  onBusyChange?: (busy: boolean) => void
  onLearningSaved?: () => void
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function ChatPanel({
  settings,
  projectPath,
  chatId,
  messages,
  onMessagesChange,
  onBusyChange,
  onLearningSaved
}: Props) {
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef(messages)
  const chatIdRef = useRef(chatId)
  const onMessagesChangeRef = useRef(onMessagesChange)
  const onLearningSavedRef = useRef(onLearningSaved)

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
  }, [chatId])

  useEffect(() => {
    const unsubscribe = window.codeviper.onAgentStream((event) => {
      if (event.chatId !== chatIdRef.current) return
      if (event.type === 'token') {
        setDraft((prev) => prev + (event.content ?? ''))
      }

      if (event.type === 'tool_start') {
        appendMessage({
          id: makeId(),
          role: 'tool',
          content: `▶ ${event.toolName}\n${event.toolInput ?? ''}`,
          toolName: event.toolName,
          timestamp: Date.now()
        })
      }

      if (event.type === 'tool_end') {
        appendMessage({
          id: makeId(),
          role: 'tool',
          content: `✓ ${event.toolName}\n${event.toolOutput ?? ''}`,
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

      if (event.type === 'done') {
        setDraft((current) => {
          if (current.trim()) {
            appendMessage({
              id: makeId(),
              role: 'assistant',
              content: current,
              timestamp: Date.now()
            })
          }
          return ''
        })
        setBusy(false)
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

    const userMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    }

    appendMessage(userMessage)
    setInput('')
    setBusy(true)
    setDraft('')

    try {
      await window.codeviper.runAgent(
        settings,
        chatId,
        messagesRef.current.slice(0, -1),
        text
      )
    } catch (error) {
      setBusy(false)
      appendMessage({
        id: makeId(),
        role: 'system',
        content: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      })
    }
  }

  return (
    <div className="chat-main">
      <div className="chat-messages">
        {!chatId && (
          <div className="empty">Выбери или создай чат слева, затем опиши задачу.</div>
        )}

        {chatId && !messages.length && !draft && (
          <div className="empty">
            🐍 CodeViper готов. Опиши задачу — агент прочитает файлы, внесёт правки и запустит команды.
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="message-role">{message.role}</div>
            <pre>{message.content}</pre>
          </div>
        ))}

        {draft && (
          <div className="message assistant">
            <div className="message-role">assistant</div>
            <pre>{draft}</pre>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Например: добавь валидацию email в форму регистрации"
          disabled={busy || !chatId}
        />
        <div className="chat-input-actions">
          <span className="empty">
            {!chatId
              ? 'Сначала выбери чат слева'
              : busy
                ? 'Агент работает...'
                : 'Enter не отправляет — жми кнопку'}
          </span>
          <button
            className="btn primary"
            onClick={send}
            disabled={busy || !settings.model || !chatId}
          >
            Отправить
          </button>
        </div>
      </div>
    </div>
  )
}
