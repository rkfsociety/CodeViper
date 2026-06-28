import type { UpdateInfo } from '../types'
import {
  buildUpdateBannerView,
  mergePendingUpdate,
  type PendingUpdates,
  type ReleaseUpdateInfo,
  type UpdateBannerView
} from '../../shared/updateBannerView'
import {
  estimateRemainingSeconds,
  formatBytes,
  formatRemaining,
  formatSpeed
} from '../../shared/formatDownload'
import styles from './UpdateBanner.module.css'

interface Props {
  updates: PendingUpdates
  installing?: boolean
  onInstall: () => void
  onInstallRuntime?: () => void
  onDismiss: () => void
}

function releaseProgressLine(release: ReleaseUpdateInfo | null): string | null {
  if (!release || release.ready) return null

  const parts: string[] = []
  const transferred = formatBytes(release.transferred)
  const total = formatBytes(release.total)
  if (transferred && total) {
    parts.push(`${transferred} / ${total}`)
  } else if (release.percent != null) {
    parts.push(`${Math.round(release.percent)}%`)
  }

  const speed = formatSpeed(release.bytesPerSecond)
  if (speed) parts.push(speed)

  const remainingSecs = estimateRemainingSeconds(
    release.transferred,
    release.total,
    release.bytesPerSecond
  )
  if (remainingSecs != null) {
    parts.push(formatRemaining(remainingSecs))
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

function withReleaseProgress(
  view: UpdateBannerView,
  release: ReleaseUpdateInfo | null
): UpdateBannerView {
  const progress = releaseProgressLine(release)
  if (!progress) return view
  return { ...view, releaseProgress: progress }
}

export function applyUpdateInfo(current: PendingUpdates, incoming: UpdateInfo): PendingUpdates {
  return mergePendingUpdate(current, incoming)
}

export function getUpdateBannerView(updates: PendingUpdates): UpdateBannerView {
  return withReleaseProgress(buildUpdateBannerView(updates), updates.release)
}

export function UpdateBanner({
  updates,
  installing = false,
  onInstall,
  onInstallRuntime,
  onDismiss
}: Props) {
  const view = getUpdateBannerView(updates)
  if (!view.visible) return null

  const showRuntimeOnly =
    view.hasRuntime &&
    view.hasRelease &&
    updates.release != null &&
    !updates.release.ready &&
    onInstallRuntime != null

  return (
    <div className={styles.banner} role="status">
      <div className={styles.body}>
        <span className={styles.title}>🔄 {view.title}</span>

        {view.releasePercent != null && (
          <div className={styles.progressWrap}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${view.releasePercent}%` }} />
            </div>
            <span className={styles.progressPct}>{Math.round(view.releasePercent)}%</span>
          </div>
        )}

        {view.releaseProgress && (
          <span className={styles.progressMeta}>{view.releaseProgress}</span>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className="btn primary"
          disabled={installing || !view.canInstall}
          onClick={onInstall}
        >
          {installing ? 'Перезапускаем…' : view.installLabel}
        </button>
        {showRuntimeOnly && (
          <button
            type="button"
            className="btn"
            disabled={installing}
            onClick={onInstallRuntime}
            title="Перезапустить без ожидания загрузки установщика"
          >
            Только runtime
          </button>
        )}
        <button type="button" className="btn" onClick={onDismiss}>
          Позже
        </button>
      </div>
    </div>
  )
}
