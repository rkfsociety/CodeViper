import { useCallback, useEffect, useState } from 'react'
import styles from './RunRollbackButton.module.css'

interface Props {
  chatId: string | null
  projectPath: string
  disabled?: boolean
  onRollback?: (message: string) => void
}

export function RunRollbackButton({ chatId, projectPath, disabled, onRollback }: Props) {
  const [active, setActive] = useState(false)
  const [rolling, setRolling] = useState(false)

  useEffect(() => {
    if (!chatId || !projectPath) {
      setActive(false)
      return
    }
    let cancelled = false
    void window.codeviper.getRunCheckpoint(chatId).then((has) => {
      if (!cancelled) setActive(has)
    })
    return () => {
      cancelled = true
    }
  }, [chatId, projectPath])

  useEffect(() => {
    if (!chatId) return
    const unsubscribe = window.codeviper.onAgentStream((event) => {
      if (event.chatId !== chatId || event.type !== 'run_checkpoint') return
      if (event.runCheckpointActive != null) setActive(event.runCheckpointActive)
    })
    return unsubscribe
  }, [chatId])

  const handleRollback = useCallback(async () => {
    if (!chatId || rolling) return
    setRolling(true)
    try {
      const result = await window.codeviper.rollbackRun(chatId)
      if (result.ok) setActive(false)
      onRollback?.(result.message)
    } finally {
      setRolling(false)
    }
  }, [chatId, onRollback, rolling])

  if (!active || !chatId || !projectPath) return null

  return (
    <button
      type="button"
      className={styles.rollbackBtn}
      onClick={() => void handleRollback()}
      disabled={disabled || rolling}
      title="Откатить все правки текущего прогона агента"
      aria-label="Откатить всё"
    >
      ↩ {rolling ? 'Откат…' : 'Откатить всё'}
    </button>
  )
}
