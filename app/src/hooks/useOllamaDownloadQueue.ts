import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { OllamaPullProgress } from '../types'
import { isRecommendedModelInstalled } from '../types'

export function pullPercent(progress: OllamaPullProgress | null): number | null {
  if (!progress?.total || progress.completed == null) return null
  return Math.min(100, Math.round((progress.completed / progress.total) * 100))
}

interface Options {
  ollamaUrl: string
  ollamaOnline: boolean
  installedModels: Array<{ name: string }>
  onRefresh: () => Promise<void>
  onModelInstalled?: (modelName: string) => void
}

const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000
const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000]

export function useOllamaDownloadQueue({
  ollamaUrl,
  ollamaOnline,
  installedModels,
  onRefresh,
  onModelInstalled
}: Options) {
  const [queued, setQueued] = useState<string[]>([])
  const [pulling, setPulling] = useState<string | null>(null)
  const [progress, setProgress] = useState<OllamaPullProgress | null>(null)
  const [error, setError] = useState('')

  const queueRef = useRef<string[]>([])
  const processingRef = useRef(false)
  const ollamaUrlRef = useRef(ollamaUrl)
  // Task 39: track all enqueued/in-progress models to avoid stale installedModels check
  const enqueuedSetRef = useRef<Set<string>>(new Set())
  ollamaUrlRef.current = ollamaUrl

  useEffect(() => {
    return window.codeviper.onOllamaPullProgress(setProgress)
  }, [])

  const syncQueue = useCallback(() => {
    setQueued([...queueRef.current])
  }, [])

  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true

    try {
      while (queueRef.current.length > 0) {
        const name = queueRef.current[0]
        setPulling(name)
        setProgress(null)
        setError('')

        // Task 38 + 43 + 44: try with timeout and exponential-backoff retries
        let succeeded = false
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          if (attempt > 0) {
            await new Promise<void>((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]))
          }

          let timeoutHandle: ReturnType<typeof setTimeout> | undefined
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error('Загрузка модели превысила время ожидания (10 мин)')),
              DOWNLOAD_TIMEOUT_MS
            )
          })

          try {
            await Promise.race([
              window.codeviper.pullOllamaModel(ollamaUrlRef.current, name),
              timeoutPromise
            ])
            clearTimeout(timeoutHandle)
            succeeded = true
            break
          } catch (err) {
            clearTimeout(timeoutHandle)
            if (attempt === MAX_RETRIES) {
              setError(err instanceof Error ? err.message : String(err))
            }
          }
        }

        if (succeeded) {
          try {
            await onRefresh()
          } catch (refreshErr) {
            console.error('[useOllamaDownloadQueue] onRefresh failed:', refreshErr)
          }
          onModelInstalled?.(name)
        }

        // Task 39: release from the enqueued set regardless of outcome
        enqueuedSetRef.current.delete(name)
        queueRef.current = queueRef.current.slice(1)
        syncQueue()
      }
    } finally {
      setPulling(null)
      setProgress(null)
      processingRef.current = false
    }
  }, [onRefresh, onModelInstalled, syncQueue])

  const enqueue = useCallback(
    (modelName: string) => {
      const trimmed = modelName.trim()
      if (!trimmed || !ollamaOnline) return
      if (isRecommendedModelInstalled(trimmed, installedModels)) return
      // Task 39: check Set instead of stale installedModels / queueRef state
      if (enqueuedSetRef.current.has(trimmed)) return

      enqueuedSetRef.current.add(trimmed)
      queueRef.current.push(trimmed)
      syncQueue()
      void processQueue()
    },
    [ollamaOnline, installedModels, processQueue, syncQueue]
  )

  const removeFromQueue = useCallback(
    (modelName: string) => {
      if (pulling === modelName) return
      enqueuedSetRef.current.delete(modelName)
      queueRef.current = queueRef.current.filter((name) => name !== modelName)
      syncQueue()
    },
    [pulling, syncQueue]
  )

  const clearError = useCallback(() => setError(''), [])

  const active = pulling !== null || queued.length > 0

  return useMemo(
    () => ({
      pulling,
      queued,
      progress,
      error,
      active,
      percent: pullPercent(progress),
      enqueue,
      removeFromQueue,
      clearError
    }),
    [pulling, queued, progress, error, active, enqueue, removeFromQueue, clearError]
  )
}
