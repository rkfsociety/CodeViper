import type { OllamaPullProgress } from '../types'
import { pullPercent } from '../hooks/useOllamaDownloadQueue'

interface Props {
  pulling: string | null
  queued: string[]
  progress: OllamaPullProgress | null
  error?: string
  onOpenSettings: () => void
}

export function OllamaDownloadStatus({ pulling, queued, progress, error, onOpenSettings }: Props) {
  if (!pulling && queued.length === 0 && !error) return null

  const percent = pullPercent(progress ?? null)
  const pending = queued.filter((name) => name !== pulling)

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
        </>
      ) : (
        <>↓ Очередь моделей</>
      )}
      {pending.length > 0 && <span className="topbar-download-queue">+{pending.length}</span>}
      {error && !pulling && <span className="topbar-download-error-text">ошибка</span>}
    </button>
  )
}
