import { useState } from 'react'

interface Props {
  text: string
  asMenuItem?: boolean
}

export function MessageCopyButton({ text, asMenuItem }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const value = text.trim()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  if (asMenuItem) {
    return (
      <button
        type="button"
        className="message-menu-item"
        onClick={() => void copy()}
        disabled={!text.trim()}
      >
        {copied ? '✓ Скопировано' : '⎘ Копировать'}
      </button>
    )
  }

  return (
    <button
      type="button"
      className="message-copy-btn"
      onClick={() => void copy()}
      title="Копировать сообщение"
      aria-label="Копировать сообщение"
      disabled={!text.trim()}
    >
      {copied ? 'Скопировано' : 'Копировать'}
    </button>
  )
}
