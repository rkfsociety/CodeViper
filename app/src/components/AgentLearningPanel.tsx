import { memo, useCallback, useEffect, useRef, useState } from 'react'
import styles from './AgentLearningPanel.module.css'

interface SyncStatus {
  branch: string
  pendingCount: number
}

interface AgentLearningPanelProps {
  onClose?: () => void
}

export const AgentLearningPanel = memo(function AgentLearningPanel({
  onClose
}: AgentLearningPanelProps) {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadStatus = useCallback(async () => {
    try {
      const result = await window.codeviper.getCollectiveSyncStatus()
      setStatus(result)
    } catch {
      // игнорируем ошибки фонового опроса
    }
  }, [])

  useEffect(() => {
    void loadStatus()
    pollRef.current = setInterval(() => void loadStatus(), 10_000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [loadStatus])

  const handleSync = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const result = await window.codeviper.flushCollectiveMemory(
        'Синхронизация коллективной памяти'
      )
      setMessage(result.ok ? `✓ ${result.message}` : `✗ ${result.message}`)
      void loadStatus()
    } catch (e) {
      setMessage(`✗ Ошибка: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [loadStatus])

  const handleCreatePr = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      // Используем существующий инструмент создания PR через IPC агента
      // Формируем промпт, который агент выполнит через create_codeviper_pr
      setMessage('Для создания PR используйте команду агенту: «Создай PR с коллективными знаниями»')
    } finally {
      setLoading(false)
    }
  }, [])

  if (!status) return null

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.icon}>☁️</span>
        <span className={styles.title}>Коллективное обучение</span>
        <span className={styles.branch} title="Ветка синхронизации">
          {status.branch}
        </span>
        {onClose && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="Скрыть">
            ✕
          </button>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Ожидают отправки</span>
          <span className={styles.statValue}>{status.pendingCount}</span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btn}
            onClick={handleSync}
            disabled={loading || status.pendingCount === 0}
            title={
              status.pendingCount === 0
                ? 'Нет новых знаний для синхронизации'
                : 'Отправить накопленные знания в общую ветку'
            }
          >
            {loading ? '…' : 'Синхронизировать'}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={handleCreatePr}
            disabled={loading}
            title="Создать Pull Request с коллективными знаниями"
          >
            Создать PR
          </button>
        </div>

        {message && <div className={styles.message}>{message}</div>}
      </div>
    </div>
  )
})
