/** Общие типы sync/build runtime-клона — без зависимостей от bootstrap/handlers. */

export interface BundledSourceSyncResult {
  updated: boolean
  localHead?: string
  error?: string
  /** В pull изменились файлы под app/ */
  appDirChanged?: boolean
  /** Только что создан git clone (нужна сборка runtime) */
  cloneCreated?: boolean
}

export interface BundledSourceBuildResult {
  built: boolean
  skipped?: boolean
  reason?: string
  error?: string
}
