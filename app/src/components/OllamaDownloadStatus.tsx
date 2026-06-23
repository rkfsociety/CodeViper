import { useEffect, useRef } from 'react'
import type { OllamaPullProgress } from '../types'
import { formatRemaining } from '../../shared/formatDownload'
import { pullPercent } from '../hooks/useOllamaDownloadQueue'

interface Props {
  pulling: string | null
  queued: string[]
  progress: OllamaPullProgress | null
  error?: string
  onOpenSettings: () => void
}

interface SpeedSample {
  ts: number
  completed: number
}

const WINDOW_MS = 10_000

export function OllamaDownloadStatus({ pulling, queued, progress, error, onOpenSettings }: Props) {
  const samplesRef = useRef<SpeedSample[]>([])
  const prevPullingRef = useRef<string | null>(null)

  useEffect(() => {
    if (pulling !== prevPullingRef.current) {
      prevPullingRef.current = pulling
      samplesRef.current = []
    }
    if (progress?.completed == null) return
    const now = Date.now()
    const pruned = samplesRef.current.filter((s) => now - s.ts < WINDOW_MS)
    pruned.push({ ts: now, completed: progress.completed })
    samplesRef.current = pruned
  }, [progress, pulling])

  if (!pulling && queued.length === 0 && !error) return null

  const percent = pullPercent(progress ?? null)
  const pending = queued.filter((name) => name !== pulling)

  let remainingText: string | null = null
  if (progress?.total && progress.completed != null) {
    const samples = samplesRef.current
    if (samples.length >= 2) {
      const oldest = samples[0]
      const newest = samples[samples.length - 1]
      const dtMs = newest.ts - oldest.ts
      if (dtMs > 0) {
        const bytesPerSec = ((newest.completed - oldest.completed) / dtMs) * 1000
        if (bytesPerSec > 0) {
          const remainingSecs = (progress.total - progress.completed) / bytesPerSec
          remainingText = formatRemaining(remainingSecs)
        }
      }
    }
  }

  return (
    <button
      type="button"
      className={`topbar-pill topbar-download${error ? ' topbar-download-error' : ''}`}
      onClick={onOpenSettings}
      title={error ? error : 'Открыть настройки — очередь скачивания моделей'}
    >
      {pulling ? (
        <>
          ↓ {pulling}
          {percent != null ? ` ${percent}%` : '…'}
          {remainingText && <span className="topbar-download-eta">{remainingText}</span>}
        </>
      ) : (
        <>↓ Очередь моделей</>
      )}
      {pending.length > 0 && <span className="topbar-download-queue">+{pending.length}</span>}
      {error && !pulling && <span className="topbar-download-error-text">ошибка</span>}
    </button>
  )
}
