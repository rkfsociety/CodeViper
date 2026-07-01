import styles from './SettingsModal.module.css'
import type { AgentSettings } from '../../types'
import { SettingItem, TOOL_GROUPS } from './shared'

interface Props {
  isActive: boolean
  isSearching: boolean
  settings: AgentSettings
  onSettingsChange: (patch: Partial<AgentSettings>) => void
}

export function ToolsTab({ isActive, isSearching, settings, onSettingsChange }: Props) {
  if (!isActive && !isSearching) return null

  return (
    <SettingItem
      tab="tools"
      label="Инструменты агента"
      desc="отключить инструменты файлы git github gitlab память команды веб навыки todo индексация зависимости disabled tools"
    >
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Инструменты агента</div>
        <p className={styles.desc}>
          Снимите галочку с группы, чтобы скрыть её инструменты от агента. Изменения вступят в силу
          при следующем сообщении.
        </p>
        <div className={styles.toolsGrid}>
          {TOOL_GROUPS.map((group) => {
            const disabled = settings.disabledTools ?? []
            const allDisabled = group.tools.every((t) => disabled.includes(t))
            return (
              <label key={group.id} className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={!allDisabled}
                  onChange={(e) => {
                    const current = new Set(settings.disabledTools ?? [])
                    if (e.target.checked) {
                      group.tools.forEach((t) => current.delete(t))
                    } else {
                      group.tools.forEach((t) => current.add(t))
                    }
                    onSettingsChange({ disabledTools: [...current] })
                  }}
                />
                <span className={styles.track} aria-hidden="true">
                  <span className={styles.thumb} />
                </span>
                <span className={styles.toggleContent}>
                  <span className={styles.title}>{group.label}</span>
                  <span className={styles.desc}>{group.desc}</span>
                </span>
              </label>
            )
          })}
        </div>
      </div>
    </SettingItem>
  )
}
