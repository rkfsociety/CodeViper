import { useState } from 'react'
import type { CheckForUpdatesResult } from '../../types'
import styles from './SettingsModal.module.css'

export function UpdatesFooter() {
  const [checking, setChecking] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<CheckForUpdatesResult | null>(null)

  const handleCheck = async () => {
    if (checking || !window.codeviper?.checkForUpdates) return
    setChecking(true)
    setResult(null)
    try {
      const checkResult = await window.codeviper.checkForUpdates()
      setResult(checkResult)
    } catch (err) {
      setResult({
        ok: false,
        currentVersion: __APP_VERSION__,
        packaged: true,
        release: { checked: true, status: 'error', error: 'Таймаут или сбой IPC' },
        runtime: { checked: false, status: 'skipped' },
        message: err instanceof Error ? err.message : 'Не удалось проверить обновления'
      })
    } finally {
      setChecking(false)
    }
  }

  const handleRuntimeSync = async () => {
    if (syncing || !window.codeviper?.forceSyncBundledRuntime) return
    setSyncing(true)
    try {
      const syncResult = await window.codeviper.forceSyncBundledRuntime()
      if (!syncResult.ok) {
        setResult({
          ok: false,
          currentVersion: __APP_VERSION__,
          packaged: true,
          release: { checked: false, status: 'skipped' },
          runtime: {
            checked: true,
            status: 'error',
            error: syncResult.error ?? 'Не удалось обновить runtime'
          },
          message: syncResult.error ?? 'Не удалось обновить runtime'
        })
        return
      }
      setResult({
        ok: true,
        currentVersion: __APP_VERSION__,
        packaged: true,
        release: { checked: false, status: 'skipped' },
        runtime: {
          checked: true,
          status: syncResult.updated ? 'available' : 'upToDate',
          localHead: syncResult.localHead
        },
        message:
          syncResult.message ?? (syncResult.updated ? 'Runtime обновлён' : 'Runtime уже актуален')
      })
      if (syncResult.restartNeeded) {
        window.codeviper.installUpdate()
      }
    } catch (err) {
      setResult({
        ok: false,
        currentVersion: __APP_VERSION__,
        packaged: true,
        release: { checked: false, status: 'skipped' },
        runtime: {
          checked: true,
          status: 'error',
          error: err instanceof Error ? err.message : 'Сбой обновления runtime'
        },
        message: err instanceof Error ? err.message : 'Сбой обновления runtime'
      })
    } finally {
      setSyncing(false)
    }
  }

  const showRuntimeSync =
    Boolean(window.codeviper?.forceSyncBundledRuntime) &&
    (result?.runtime.status === 'available' || syncing)

  return (
    <div className={styles.updatesFooter}>
      <div className={styles.about}>
        <span className={styles.aboutVersion}>CodeViper v{__APP_VERSION__}</span>
        <button
          type="button"
          className="btn"
          disabled={checking}
          onClick={() => void handleCheck()}
          title="Проверить установщик и agent runtime на GitHub"
        >
          {checking ? 'Проверяем…' : 'Проверить обновления'}
        </button>
        {showRuntimeSync && (
          <button
            type="button"
            className="btn"
            disabled={syncing}
            onClick={() => void handleRuntimeSync()}
            title="git fetch + build runtime из %APPDATA%/codeviper/source"
          >
            {syncing ? 'Обновляем runtime…' : 'Обновить runtime'}
          </button>
        )}
        <a
          className={styles.aboutLink}
          href="https://github.com/rkfsociety/CodeViper/issues"
          target="_blank"
          rel="noreferrer"
        >
          Сообщить об ошибке
        </a>
        <a
          className={styles.aboutLink}
          href="https://github.com/rkfsociety/CodeViper"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
      {result && (
        <p
          className={`${styles.updatesStatus} ${result.ok ? styles.updatesStatusOk : styles.updatesStatusError}`}
          role="status"
        >
          {result.message}
        </p>
      )}
    </div>
  )
}
