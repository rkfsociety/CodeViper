import { useCallback, useEffect, useState } from 'react'
import type { PluginCatalogActionResult, PluginCatalogItemView } from '../../types'
import styles from './SettingsModal.module.css'
import { SettingItem } from './shared'

interface Props {
  isActive: boolean
  isSearching: boolean
}

export function PluginsTab({ isActive, isSearching }: Props) {
  const [catalog, setCatalog] = useState<PluginCatalogItemView[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<PluginCatalogActionResult | null>(null)

  const refreshCatalog = useCallback(async () => {
    setLoading(true)
    try {
      setCatalog(await window.codeviper.listPluginCatalog())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isActive || isSearching) void refreshCatalog()
  }, [isActive, isSearching, refreshCatalog])

  const importFromFolder = async () => {
    const pluginRoot = await window.codeviper.selectFolder()
    if (!pluginRoot) return
    const result = await window.codeviper.importSkillsFromDirectory('', pluginRoot)
    setLastResult({
      ok: result.imported > 0,
      message:
        `Импорт завершён: ${result.imported} skills` +
        (result.skipped ? `, пропущено ${result.skipped}` : '') +
        (result.warnings.length ? `. ${result.warnings[0]}` : '')
    })
    await refreshCatalog()
  }

  const runCatalogAction = async (
    catalogId: string,
    action: 'install' | 'update' | 'uninstall'
  ) => {
    setBusyId(catalogId)
    setLastResult(null)
    try {
      const result =
        action === 'install'
          ? await window.codeviper.installPluginCatalog(catalogId)
          : action === 'update'
            ? await window.codeviper.updatePluginCatalog(catalogId)
            : await window.codeviper.uninstallPluginCatalog(catalogId)
      setLastResult(result)
      if (result.ok) await refreshCatalog()
    } finally {
      setBusyId(null)
    }
  }

  if (!isActive && !isSearching) return null

  return (
    <>
      <SettingItem
        tab="plugins"
        label="Каталог плагинов"
        desc="Установка skill-репозиториев одним кликом"
      >
        <div className={styles.settingSection}>
          <p>
            Плагины из каталога клонируются в <code>%APPDATA%/CodeViper/plugin-catalog/</code> и
            импортируют skills в <code>ViperSkills.md</code>. Новые записи добавляются в{' '}
            <code>app/shared/pluginCatalog.ts</code>.
          </p>
          {lastResult ? (
            <p className={lastResult.ok ? styles.pluginCatalogOk : styles.pluginCatalogError}>
              {lastResult.message}
            </p>
          ) : null}
          <div className={styles.pluginCatalogGrid}>
            {loading && !catalog.length ? <p>Загрузка каталога…</p> : null}
            {catalog.map((item) => (
              <article key={item.entry.id} className={styles.pluginCatalogCard}>
                <div className={styles.pluginCatalogCardHead}>
                  <h4>{item.entry.name}</h4>
                  {item.entry.author ? (
                    <span className={styles.pluginCatalogAuthor}>{item.entry.author}</span>
                  ) : null}
                </div>
                <p className={styles.pluginCatalogDesc}>{item.entry.description}</p>
                {item.installed ? (
                  <p className={styles.pluginCatalogMeta}>
                    Установлено: {item.skillCount ?? item.skillsImported ?? 0} skills
                    {item.updatedAt
                      ? ` · обновлено ${new Date(item.updatedAt).toLocaleDateString('ru-RU')}`
                      : ''}
                  </p>
                ) : null}
                <div className={styles.pluginCatalogActions}>
                  {item.installed ? (
                    <>
                      <button
                        className={styles.button}
                        disabled={busyId === item.entry.id}
                        onClick={() => runCatalogAction(item.entry.id, 'update')}
                      >
                        {busyId === item.entry.id ? '…' : 'Обновить'}
                      </button>
                      <button
                        className={`${styles.button} ${styles.pluginCatalogDanger}`}
                        disabled={busyId === item.entry.id}
                        onClick={() => runCatalogAction(item.entry.id, 'uninstall')}
                      >
                        Удалить
                      </button>
                    </>
                  ) : (
                    <button
                      className={`${styles.button} ${styles.pluginCatalogPrimary}`}
                      disabled={busyId === item.entry.id}
                      onClick={() => runCatalogAction(item.entry.id, 'install')}
                    >
                      {busyId === item.entry.id ? 'Установка…' : 'Установить'}
                    </button>
                  )}
                  {item.entry.homepage ? (
                    <button
                      className={styles.button}
                      onClick={() => window.codeviper.openExternal(item.entry.homepage!)}
                    >
                      GitHub
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </SettingItem>

      <SettingItem
        tab="plugins"
        label="Локальные плагины"
        desc="JS-инструменты и ручной импорт skills"
      >
        <div className={styles.settingSection}>
          <p>
            Плагины-<code>.js</code> хранятся в <code>~/.codeviper/plugins</code>. Для сторонних
            репозиториев без каталога — ручной импорт папки <code>skills/</code>.
          </p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className={styles.button} onClick={() => window.codeviper.openPluginsFolder()}>
              📂 Открыть папку
            </button>
            <button className={styles.button} onClick={importFromFolder}>
              Импортировать skills из папки
            </button>
          </div>
        </div>
      </SettingItem>
    </>
  )
}
