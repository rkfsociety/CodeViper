import styles from './SettingsModal.module.css'
import { SettingItem } from './shared'

interface Props {
  isActive: boolean
  isSearching: boolean
}

export function PluginsTab({ isActive, isSearching }: Props) {
  const importSuperpowers = async () => {
    const pluginRoot = await window.codeviper.selectFolder()
    if (!pluginRoot) return
    const result = await window.codeviper.importSkillsFromDirectory('', pluginRoot)
    const message =
      `Импорт завершен: ${result.imported} skills` +
      (result.skipped ? `, пропущено ${result.skipped}` : '') +
      (result.warnings.length ? `. ${result.warnings[0]}` : '')
    window.alert(message)
  }

  if (!isActive && !isSearching) return null

  return (
    <SettingItem tab="plugins" label="Плагины" desc="Подключить дополнительные инструменты">
      <div className={styles.settingSection}>
        <p>
          Плагины-<code>.js</code> хранятся в <code>~/.codeviper/plugins</code>. Для skill-based
          репозиториев, таких как <code>obra/superpowers</code>, выберите корень клона и
          импортируйте папку <code>skills/</code> в ViperSkills.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={styles.button}
            onClick={() => (window as any).electron?.ipcRenderer.invoke('open-plugins-folder')}
          >
            📂 Открыть папку
          </button>
          <button className={styles.button} onClick={importSuperpowers}>
            Импортировать skills из репозитория
          </button>
        </div>
      </div>
    </SettingItem>
  )
}
