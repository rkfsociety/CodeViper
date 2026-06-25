import styles from './SettingsModal.module.css'
import { SettingItem } from './shared'

export function PluginsTab() {
  return (
    <SettingItem tab="plugins" label="Плагины" desc="Подключить дополнительные инструменты">
      <div className={styles.settingSection}>
        <p>
          Плагины хранятся в <code>~/.codeviper/plugins</code>. Откройте папку и добавьте файлы{' '}
          <code>.js</code> с инструментами агента.
        </p>
        <button
          className={styles.button}
          onClick={() => (window as any).electron?.ipcRenderer.invoke('open-plugins-folder')}
        >
          📂 Открыть папку
        </button>
      </div>
    </SettingItem>
  )
}
