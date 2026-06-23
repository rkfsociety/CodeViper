/** Человекочитаемый размер файла (B / KB / MB / GB). */
export function formatBytes(bytes: number | undefined | null): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

/** Скорость загрузки в B/s, KB/s, MB/s. */
export function formatSpeed(bytesPerSecond: number | undefined | null): string | null {
  const size = formatBytes(bytesPerSecond)
  return size ? `${size}/s` : null
}

/** Оставшееся время: секунды → «~N мин». */
export function formatRemaining(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return '< 1 мин'
  if (secs < 60) return '< 1 мин'
  if (secs < 3600) return `~${Math.ceil(secs / 60)} мин`
  return `~${Math.ceil(secs / 3600)} ч`
}

/** ETA по transferred/total и bytesPerSecond. */
export function estimateRemainingSeconds(
  transferred: number | undefined,
  total: number | undefined,
  bytesPerSecond: number | undefined
): number | null {
  if (
    transferred == null ||
    total == null ||
    bytesPerSecond == null ||
    bytesPerSecond <= 0 ||
    total <= transferred
  ) {
    return null
  }
  return (total - transferred) / bytesPerSecond
}
