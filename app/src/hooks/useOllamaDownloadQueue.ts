import { useCallback, useEffect, useRef, useState } from 'react'
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

        try {
          await window.codeviper.pullOllamaModel(ollamaUrlRef.current, name)
          try {
            await onRefresh()
          } catch (refreshErr) {
            console.error('[useOllamaDownloadQueue] onRefresh failed:', refreshErr)
          }
          onModelInstalled?.(name)
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        }

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
      if (queueRef.current.includes(trimmed) || pulling === trimmed) return

      queueRef.current.push(trimmed)
      syncQueue()
      void processQueue()
    },
    [ollamaOnline, installedModels, pulling, processQueue, syncQueue]
  )

  const removeFromQueue = useCallback(
    (modelName: string) => {
      if (pulling === modelName) return
      queueRef.current = queueRef.current.filter((name) => name !== modelName)
      syncQueue()
    },
    [pulling, syncQueue]
  )

  const active = pulling !== null || queued.length > 0

  return {
    pulling,
    queued,
    progress,
    error,
    active,
    percent: pullPercent(progress),
    enqueue,
    removeFromQueue,
    clearError: () => setError('')
  }
}
