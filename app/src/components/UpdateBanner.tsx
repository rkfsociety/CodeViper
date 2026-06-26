import type { UpdateInfo } from '../types'
import {
  estimateRemainingSeconds,
  formatBytes,
  formatRemaining,
  formatSpeed
} from '../../shared/formatDownload'
import styles from './UpdateBanner.module.css'

interface Props {
  info: UpdateInfo
  installing?: boolean
  onInstall: () => void
  onDismiss: () => void
}

function releaseProgressLine(info: Extract<UpdateInfo, { source: 'release' }>): string | null {
  if (info.ready) return null

  const parts: string[] = []
  const transferred = formatBytes(info.transferred)
  const total = formatBytes(info.total)
  if (transferred && total) {
    parts.push(`${transferred} / ${total}`)
  } else if (info.percent != null) {
    parts.push(`${Math.round(info.percent)}%`)
  }

  const speed = formatSpeed(info.bytesPerSecond)
  if (speed) parts.push(speed)

  const remainingSecs = estimateRemainingSeconds(info.transferred, info.total, info.bytesPerSecond)
  if (remainingSecs != null) {
    parts.push(formatRemaining(remainingSecs))
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

export function UpdateBanner({ info, installing = false, onInstall, onDismiss }: Props) {
  const releaseProgress = info.source === 'release' ? releaseProgressLine(info) : null
  const releasePercent =
    info.source === 'release' && !info.ready && info.percent != null
      ? Math.min(100, Math.max(0, info.percent))
      : null

  return (
    <div className={styles.banner} role="status">
      <div className={styles.body}>
        <span className={styles.title}>
          {info.source === 'release' ? (
            info.ready ? (
              <>
                🔄 Доступна новая версия <strong>{info.version}</strong>. Скачано — перезапустите
                для установки.
              </>
            ) : (
              <>
                🔄 Загружается версия <strong>{info.version}</strong> с GitHub Releases…
              </>
            )
          ) : info.source === 'runtime' ? (
            <>
              🔄 Обновление agent runtime готово
              {info.localHead ? (
                <>
                  {' '}
                  (<code>{info.localHead.slice(0, 7)}</code>)
                </>
              ) : null}
              . Перезапустите для применения.
            </>
          ) : (
            <>
              🔄 Доступно обновление исходников:{' '}
              {info.commits === 1 ? '1 коммит' : `${info.commits} коммит(ов)`} на GitHub.
              Перезапустите для пересборки.
            </>
          )}
        </span>

        {releasePercent != null && (
          <div className={styles.progressWrap}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${releasePercent}%` }} />
            </div>
            <span className={styles.progressPct}>{Math.round(releasePercent)}%</span>
          </div>
        )}

        {releaseProgress && <span className={styles.progressMeta}>{releaseProgress}</span>}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className="btn primary"
          disabled={installing || (info.source === 'release' && !info.ready)}
          onClick={onInstall}
        >
          {installing
            ? 'Перезапускаем…'
            : info.source === 'release' && info.ready
              ? 'Перезапустить и обновить'
              : info.source === 'runtime'
                ? 'Перезапустить для применения'
                : 'Перезапустить'}
        </button>
        <button type="button" className="btn" onClick={onDismiss}>
          Позже
        </button>
      </div>
    </div>
  )
}
