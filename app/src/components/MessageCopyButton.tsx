import { useState } from 'react'

interface Props {
  text: string
}

export function MessageCopyButton({ text }: Props) {
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
