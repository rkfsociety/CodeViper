import styles from './SettingsModal.module.css'
import type { AgentSettings } from '../../types'
import { UI_FONT_SCALES, type UiFontScale } from '../../types'
import {
  DEFAULT_COMMAND_TIMEOUT_SEC,
  COMMAND_TIMEOUT_SEC_MIN,
  COMMAND_TIMEOUT_SEC_MAX
} from '../../../shared/constants'
import { SettingItem } from './shared'

interface Props {
  isActive: boolean
  isSearching: boolean
  settings: AgentSettings
  onSettingsChange: (patch: Partial<AgentSettings>) => void
}

export function PerformanceTab({ isActive, isSearching, settings, onSettingsChange }: Props) {
  if (!isActive && !isSearching) return null

  return (
    <>
      <SettingItem
        tab="performance"
        label="Режимы производительности"
        desc="энергосбережение power save CPU GPU статы PR pull requests ручной manual refresh анимации"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Режимы</div>

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

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.disableSystemStats === true}
              onChange={(e) => onSettingsChange({ disableSystemStats: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Отключить CPU/GPU-статы</span>
              <span className={styles.desc}>
                Останавливает фоновый опрос загрузки процессора и видеокарты во время работы агента
              </span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.prManualRefresh === true}
              onChange={(e) => onSettingsChange({ prManualRefresh: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Обновлять PR только вручную</span>
              <span className={styles.desc}>
                Отключает авто-опрос Pull Requests каждые 5 минут — обновление только по кнопке
              </span>
            </span>
          </label>
        </div>
      </SettingItem>

      <SettingItem
        tab="performance"
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
        tab="performance"
        label="GPU память Ollama"
        desc="num_gpu слои слоёв видеокарта gpu layers vram cpu oom"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>GPU / память (Ollama)</div>

          <div className={styles.row}>
            <div className={styles.rowContent}>
              <span className={styles.title}>Слоёв на GPU</span>
              <span className={styles.desc}>
                Сколько слоёв модели загружать на GPU. Пусто или -1 — авто (всё на GPU). 0 — только
                CPU (медленно, но без OOM). Дробные значения, например 20, позволяют запустить
                крупную модель частично: одни слои на GPU, остальные на RAM.
              </span>
            </div>
            <div className={styles.rowRight}>
              <input
                type="number"
                min={0}
                placeholder="-1"
                style={{ width: 72 }}
                value={settings.ollamaNumGpu ?? ''}
                onChange={(e) => {
                  const raw = e.target.value.trim()
                  onSettingsChange({ ollamaNumGpu: raw === '' ? undefined : Number(raw) })
                }}
              />
              <span className={styles.unit}>слоёв</span>
            </div>
          </div>
        </div>
      </SettingItem>

      <SettingItem
        tab="performance"
        label="Таймаут команд"
        desc="timeout таймаут командный секунды time seconds max"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Таймауты</div>

          <div className={styles.row}>
            <div className={styles.rowContent}>
              <span className={styles.title}>Таймаут команд</span>
              <span className={styles.desc}>
                Макс. время одной команды агента (по умолч. 120 с, макс. {COMMAND_TIMEOUT_SEC_MAX}{' '}
                с)
              </span>
            </div>
            <div className={styles.rowRight}>
              <input
                type="number"
                min={COMMAND_TIMEOUT_SEC_MIN}
                max={COMMAND_TIMEOUT_SEC_MAX}
                value={settings.commandTimeoutSec ?? DEFAULT_COMMAND_TIMEOUT_SEC}
                onChange={(e) =>
                  onSettingsChange({
                    commandTimeoutSec: Number(e.target.value) || DEFAULT_COMMAND_TIMEOUT_SEC
                  })
                }
              />
              <span className={styles.unit}>сек</span>
            </div>
          </div>
        </div>
      </SettingItem>

      <SettingItem
        tab="performance"
        label="Звуковые уведомления"
        desc="sound notification звук сигнал завершение задача"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Уведомления</div>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.soundNotifications === true}
              onChange={(e) => onSettingsChange({ soundNotifications: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Уведомления при завершении</span>
              <span className={styles.desc}>
                Звук и системный toast, если чат в фоне или окно свёрнуто
              </span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.minimizeToTray !== false}
              onChange={(e) => onSettingsChange({ minimizeToTray: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Сворачивать в трей</span>
              <span className={styles.desc}>
                Крестик скрывает окно; иконка в трее — клик открывает снова
              </span>
            </span>
          </label>

          <div style={{ marginTop: '0.75rem' }}>
            <div className={styles.sectionLabel}>Webhook «агент готов»</div>
            <input
              type="url"
              className={styles.searchInput}
              placeholder="https://hooks.slack.com/… или n8n"
              value={settings.webhookUrl ?? ''}
              onChange={(e) => onSettingsChange({ webhookUrl: e.target.value || undefined })}
              spellCheck={false}
            />
            <div className={styles.hint}>
              POST <code>{'{ chatId, projectPath, summary, durationMs }'}</code> при завершении
              прогона
            </div>
          </div>
        </div>
      </SettingItem>
    </>
  )
}
