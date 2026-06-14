import { useEffect, useRef, useState } from 'react'
import type { AgentSettings, ChatMessage } from '../types'

interface Props {
  settings: AgentSettings
  projectPath: string
  onMessagesChange: (messages: ChatMessage[]) => void
  onLearningSaved?: () => void
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function ChatPanel({ settings, projectPath, onMessagesChange, onLearningSaved }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onMessagesChange(messages)
  }, [messages, onMessagesChange])

  useEffect(() => {
    const unsubscribe = window.codeviper.onAgentStream((event) => {
      if (event.type === 'token' && event.content) {
        setDraft((prev) => prev + event.content)
      }

      if (event.type === 'tool_start') {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: 'tool',
            content: `▶ ${event.toolName}\n${event.toolInput ?? ''}`,
            toolName: event.toolName,
            timestamp: Date.now()
          }
        ])
      }

      if (event.type === 'tool_end') {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: 'tool',
            content: `✓ ${event.toolName}\n${event.toolOutput ?? ''}`,
            toolName: event.toolName,
            timestamp: Date.now()
          }
        ])
      }

      if (event.type === 'error' && event.content) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: 'system',
            content: event.content,
            timestamp: Date.now()
          }
        ])
      }

      if (event.type === 'learning_saved' && event.content) {
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: 'system',
            content: `🧠 Запомнено: ${event.content}`,
            timestamp: Date.now()
          }
        ])
        onLearningSaved?.()
      }

      if (event.type === 'done') {
        setDraft((current) => {
          if (current.trim()) {
            setMessages((prev) => [
              ...prev,
              {
                id: makeId(),
                role: 'assistant',
                content: current,
                timestamp: Date.now()
              }
            ])
          }
          return ''
        })
        setBusy(false)
      }
    })

    return unsubscribe
  }, [onLearningSaved])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, draft])

  async function send() {
    const text = input.trim()
    if (!text || busy || !projectPath || !settings.model) return

    const userMessage: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setBusy(true)
    setDraft('')

    await window.codeviper.runAgent(settings, messages, text)
  }

  return (
    <div className="chat-main">
      <div className="chat-messages">
        {!messages.length && !draft && (
          <div className="empty">
            🐍 CodeViper готов. Открой проект, выбери модель Ollama и опиши задачу.
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
          disabled={busy}
        />
        <div className="chat-input-actions">
          <span className="empty">{busy ? 'Агент работает...' : 'Enter не отправляет — жми кнопку'}</span>
          <button className="btn primary" onClick={send} disabled={busy || !settings.model}>
            Отправить
          </button>
        </div>
      </div>
    </div>
  )
}
