import styles from './SettingsModal.module.css'
import type { AgentSettings, PermissionMode } from '../../types'
import { PERMISSION_MODES, PERMISSION_MODE_LABELS } from '../../types'
import { SettingItem } from './shared'

interface Props {
  isActive: boolean
  isSearching: boolean
  settings: AgentSettings
  onSettingsChange: (patch: Partial<AgentSettings>) => void
}

export function SecurityTab({ isActive, isSearching, settings, onSettingsChange }: Props) {
  if (!isActive && !isSearching) return null

  return (
    <SettingItem
      tab="security"
      label="Безопасность"
      desc="режим доступа запрещённые команды blocklist permission спрашивать принимать bypass"
    >
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Безопасность</div>
        <label>
          Режим доступа
          <select
            value={settings.permissionMode ?? 'bypass'}
            onChange={(e) => onSettingsChange({ permissionMode: e.target.value as PermissionMode })}
          >
            {PERMISSION_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {PERMISSION_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        <div className={`${styles.hint} ${styles.hintInline}`}>
          <strong>Спрашивать всё</strong> — подтверждение перед каждой записью/командой.{' '}
          <strong>Принимать правки</strong> — файлы без вопросов, команды с подтверждением.{' '}
          <strong>Без подтверждений</strong> — агент действует сам.
        </div>

        <label>
          Запрещённые команды
          <textarea
            rows={4}
            placeholder={'npm publish\\.+--access public\ncurl .+ | bash\ndocker push'}
            value={(settings.commandBlocklist ?? []).join('\n')}
            onChange={(e) => {
              const lines = e.target.value.split('\n')
              onSettingsChange({ commandBlocklist: lines })
            }}
            style={{ fontFamily: 'monospace', resize: 'vertical' }}
          />
        </label>
        <div className={`${styles.hint} ${styles.hintInline}`}>
          Каждая строка — паттерн (подстрока или регулярное выражение). Совпадение блокирует
          команду. Применяется поверх встроенного списка.
        </div>

        <label>
          Всегда разрешать команды
          <textarea
            rows={4}
            placeholder={'npm test\ngit status\ngit diff'}
            value={(settings.commandAllowlist ?? []).join('\n')}
            onChange={(e) => {
              const lines = e.target.value.split('\n')
              onSettingsChange({ commandAllowlist: lines })
            }}
            style={{ fontFamily: 'monospace', resize: 'vertical' }}
          />
        </label>
        <div className={`${styles.hint} ${styles.hintInline}`}>
          Паттерны команд, которые всегда разрешены — даже если совпадают с запрещёнными.
          Проверяется до blocklist.
        </div>
      </div>
    </SettingItem>
  )
}
