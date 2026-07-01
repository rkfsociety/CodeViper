import styles from './SettingsModal.module.css'
import type { AgentSettings } from '../../types'
import { UI_FONT_SCALES, type UiFontScale } from '../../types'
import { SettingItem } from './shared'

interface Props {
  isActive: boolean
  isSearching: boolean
  settings: AgentSettings
  onSettingsChange: (patch: Partial<AgentSettings>) => void
}

export function AppearanceTab({ isActive, isSearching, settings, onSettingsChange }: Props) {
  if (!isActive && !isSearching) return null

  return (
    <>
      <SettingItem
        tab="appearance"
        label="Масштаб шрифта"
        desc="font size scale текст интерфейс крупный мелкий ui"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Интерфейс</div>

          <div className={styles.row}>
            <div className={styles.rowContent}>
              <span className={styles.title}>Масштаб шрифта</span>
              <span className={styles.desc}>
                Размер текста во всём интерфейсе, включая чат (база 16 px)
              </span>
            </div>
            <div className={styles.rowRight}>
              <select
                value={String(settings.uiFontScale ?? 1)}
                onChange={(e) =>
                  onSettingsChange({ uiFontScale: Number(e.target.value) as UiFontScale })
                }
              >
                {UI_FONT_SCALES.map((scale) => (
                  <option key={scale} value={scale}>
                    {scale === 1 ? '100%' : `${Math.round(scale * 100)}%`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </SettingItem>

      <SettingItem
        tab="appearance"
        label="Режим энергосбережения"
        desc="энергосбережение power save анимации ui батчинг"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Анимации и отрисовка</div>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.powerSaveMode === true}
              onChange={(e) => onSettingsChange({ powerSaveMode: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Режим энергосбережения</span>
              <span className={styles.desc}>
                Батчинг обновлений UI (300 мс), все анимации и переходы отключены
              </span>
            </span>
          </label>
        </div>
      </SettingItem>
    </>
  )
}
