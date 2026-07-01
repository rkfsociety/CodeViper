import { useState } from 'react'
import styles from './SettingsModal.module.css'
import type { AgentSettings, GitSyncStrategy } from '../../types'
import { GIT_SYNC_STRATEGIES, GIT_SYNC_STRATEGY_LABELS } from '../../types'
import { SettingItem } from './shared'

interface Props {
  isActive: boolean
  isSearching: boolean
  settings: AgentSettings
  onSettingsChange: (patch: Partial<AgentSettings>) => void
}

export function AutomationTab({ isActive, isSearching, settings, onSettingsChange }: Props) {
  if (!isActive && !isSearching) return null

  const collectiveBranch = settings.collectiveMemoryBranch?.trim() || 'agent/self-improve'

  return (
    <SettingItem
      tab="automation"
      label="Автоматизация"
      desc="git синхронизация push pull стратегия startup запуск stash rebase fast-forward runtime github live коллективная память"
    >
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Автоматизация</div>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.debugAgent === true}
            onChange={(e) => onSettingsChange({ debugAgent: e.target.checked || undefined })}
          />
          <span className={styles.track} aria-hidden="true">
            <span className={styles.thumb} />
          </span>
          <span className={styles.toggleContent}>
            <span className={styles.title}>Режим отладки агента</span>
            <span className={styles.desc}>
              Подробный вывод в консоль (main process) и полный ввод/вывод инструментов в{' '}
              <code>logs/agent-*.ndjson</code>
            </span>
          </span>
        </label>

        <div style={{ marginTop: '0.75rem' }}>
          <div className={styles.sectionLabel}>Ветка коллективной памяти</div>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="agent/self-improve"
            value={settings.collectiveMemoryBranch ?? ''}
            onChange={(e) =>
              onSettingsChange({ collectiveMemoryBranch: e.target.value || undefined })
            }
            spellCheck={false}
          />
          <div className={styles.hint}>
            Только <code>agent/*</code> — используется для sync глобальных знаний на GitHub
          </div>
        </div>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.syncCollectiveMemory !== false}
            onChange={(e) => onSettingsChange({ syncCollectiveMemory: e.target.checked })}
          />
          <span className={styles.track} aria-hidden="true">
            <span className={styles.thumb} />
          </span>
          <span className={styles.toggleContent}>
            <span className={styles.title}>Коллективная память на GitHub</span>
            <span className={styles.desc}>
              Глобальные знания (🧠 Запомнено) → <code>docs/collective/ViperMemory.md</code> в ветке{' '}
              <code>{collectiveBranch}</code>
            </span>
          </span>
        </label>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.autoCollectivePr === true}
            onChange={(e) => onSettingsChange({ autoCollectivePr: e.target.checked })}
          />
          <span className={styles.track} aria-hidden="true">
            <span className={styles.thumb} />
          </span>
          <span className={styles.toggleContent}>
            <span className={styles.title}>Авто-PR после sync</span>
            <span className={styles.desc}>
              После успешного push коллективной памяти автоматически создаёт PR. Если PR уже открыт
              — сообщит об этом без ошибки.
            </span>
          </span>
        </label>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.liveRuntimeFromGit !== false}
            onChange={(e) => onSettingsChange({ liveRuntimeFromGit: e.target.checked })}
          />
          <span className={styles.track} aria-hidden="true">
            <span className={styles.thumb} />
          </span>
          <span className={styles.toggleContent}>
            <span className={styles.title}>Обновлять runtime с GitHub</span>
            <span className={styles.desc}>
              Установленный CodeViper подтягивает agent runtime из{' '}
              <code>%APPDATA%/codeviper/source</code> (git pull). Dev-режим из исходников не
              затрагивает
            </span>
          </span>
        </label>

        <RuntimeForceSyncButton />

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.gitSyncOnStartup !== false}
            onChange={(e) => onSettingsChange({ gitSyncOnStartup: e.target.checked })}
          />
          <span className={styles.track} aria-hidden="true">
            <span className={styles.thumb} />
          </span>
          <span className={styles.toggleContent}>
            <span className={styles.title}>Git-синхронизация при запуске</span>
            <span className={styles.desc}>
              При запуске CodeViper автоматически подтягивает обновления с GitHub
            </span>
          </span>
        </label>

        {settings.gitSyncOnStartup !== false && (
          <>
            <label>
              Стратегия синхронизации
              <select
                value={settings.gitSyncStrategy ?? 'stash'}
                onChange={(e) =>
                  onSettingsChange({ gitSyncStrategy: e.target.value as GitSyncStrategy })
                }
              >
                {GIT_SYNC_STRATEGIES.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {GIT_SYNC_STRATEGY_LABELS[strategy]}
                  </option>
                ))}
              </select>
            </label>
            <div className={`${styles.hint} ${styles.hintInline}`}>
              <strong>Stash + reset</strong> — локальные правки прячутся в <code>git stash</code>,
              затем <code>reset --hard</code> на версию GitHub (приоритет у GitHub).{' '}
              <strong>Rebase</strong> — локальные коммиты переносятся поверх версии GitHub.{' '}
              <strong>Fast-forward only</strong> — обновление только если нет расхождений; иначе
              остаётся локальная версия (ничего не теряется).
              <br />
              При незакоммиченных изменениях лаунчер покажет предупреждение и спросит подтверждение
              перед синхронизацией.
            </div>
          </>
        )}
      </div>
    </SettingItem>
  )
}

function RuntimeForceSyncButton() {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{
    kind: 'ok' | 'error'
    text: string
    restartNeeded?: boolean
  } | null>(null)

  const handleForceSync = async () => {
    if (busy || !window.codeviper?.forceSyncBundledRuntime) return
    setBusy(true)
    setStatus(null)
    try {
      const result = await window.codeviper.forceSyncBundledRuntime()
      if (!result.ok) {
        setStatus({ kind: 'error', text: result.error ?? 'Не удалось обновить runtime' })
        return
      }
      setStatus({
        kind: 'ok',
        text: result.message ?? (result.updated ? 'Обновление завершено' : 'Уже актуальная версия'),
        restartNeeded: result.restartNeeded
      })
    } catch (err) {
      setStatus({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Не удалось обновить runtime'
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.runtimeSyncRow}>
      <button
        type="button"
        className="btn"
        disabled={busy || !window.codeviper?.forceSyncBundledRuntime}
        onClick={() => void handleForceSync()}
      >
        {busy ? 'Обновляем runtime…' : 'Обновить runtime сейчас'}
      </button>
      {status && (
        <p
          className={`${styles.hint} ${styles.hintInline} ${status.kind === 'error' ? styles.runtimeSyncError : styles.runtimeSyncOk}`}
          role="status"
        >
          {status.text}
          {status.kind === 'ok' && status.restartNeeded && (
            <>
              {' '}
              <button
                type="button"
                className={styles.runtimeSyncLink}
                onClick={() => window.codeviper.installUpdate()}
              >
                Перезапустить
              </button>
            </>
          )}
        </p>
      )}
      <p className={`${styles.hint} ${styles.hintInline}`}>
        Принудительно: <code>git fetch</code> + <code>master</code> в{' '}
        <code>%APPDATA%/codeviper/source</code>, затем <code>npm run build</code>. Только для
        установленного <code>.exe</code>.
      </p>
    </div>
  )
}
