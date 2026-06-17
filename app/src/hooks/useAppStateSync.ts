import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'

const SAVE_INTERVAL_MS = 30_000

export interface AppStateSyncOptions {
  chatIdRef: MutableRefObject<string | null>
  projectPathRef: MutableRefObject<string>
  getQueueSnapshot: () => Array<{ id: string; text: string }>
}

/**
 * Каждые 30 с сохраняет активный чат, проект и очередь сообщений
 * в appState.json через IPC. При нормальном выходе main-процесс
 * удаляет файл (before-quit). Если файл остался — значит был краш.
 */
export function useAppStateSync({
  chatIdRef,
  projectPathRef,
  getQueueSnapshot
}: AppStateSyncOptions): void {
  const getQueueSnapshotRef = useRef(getQueueSnapshot)
  getQueueSnapshotRef.current = getQueueSnapshot

  useEffect(() => {
    const save = () => {
      const chatId = chatIdRef.current
      if (!chatId) return
      window.codeviper.saveAppState({
        activeChatId: chatId,
        projectPath: projectPathRef.current,
        pendingMessages: getQueueSnapshotRef.current(),
        crashedAt: new Date().toISOString()
      })
    }

    const timer = window.setInterval(save, SAVE_INTERVAL_MS)
    // Сохраняем сразу при монтировании, чтобы не ждать первых 30 с
    save()
    return () => window.clearInterval(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
