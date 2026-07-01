import { useState } from 'react'
import styles from './SettingsModal.module.css'
import type { AgentSettings } from '../../types'
import { SettingItem } from './shared'

interface Props {
  isActive: boolean
  isSearching: boolean
  settings: AgentSettings
  onSettingsChange: (patch: Partial<AgentSettings>) => void
}

export function NotificationsTab({ isActive, isSearching, settings, onSettingsChange }: Props) {
  const [apiKeyVisible, setApiKeyVisible] = useState<Record<string, boolean>>({})

  if (!isActive && !isSearching) return null

  function toggleKeyVisible(key: string) {
    setApiKeyVisible((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <>
      <SettingItem
        tab="notifications"
        label="Звуковые уведомления"
        desc="sound notification звук сигнал завершение задача tray трей"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Локальные уведомления</div>

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
        </div>
      </SettingItem>

      <SettingItem
        tab="notifications"
        label="Webhook «агент готов»"
        desc="webhook slack n8n post агент готов"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Webhook</div>
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
      </SettingItem>

      <SettingItem
        tab="notifications"
        label="Discord webhook"
        desc="discord webhook уведомление агент готов embed incoming webhook"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Discord</div>
          <label>
            Incoming Webhook URL
            <input
              type="url"
              placeholder="https://discord.com/api/webhooks/…"
              value={settings.discordWebhookUrl ?? ''}
              onChange={(e) =>
                onSettingsChange({ discordWebhookUrl: e.target.value.trim() || undefined })
              }
              spellCheck={false}
            />
          </label>
          <div className={`${styles.hint} ${styles.hintInline}`}>
            POST embed «Агент готов» при завершении прогона. Создать webhook: канал → Настройки →
            Интеграции → Webhooks.
          </div>
        </div>
      </SettingItem>

      <SettingItem
        tab="notifications"
        label="Telegram Bot"
        desc="telegram bot уведомление агент готов sendmessage chat_id botfather"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Telegram</div>
          <label>
            Bot Token
            <div className="settings-api-key-row">
              <input
                type={apiKeyVisible['telegram'] ? 'text' : 'password'}
                placeholder="123456789:ABCdefGHI…"
                value={settings.telegramBotToken ?? ''}
                onChange={(e) =>
                  onSettingsChange({ telegramBotToken: e.target.value.trim() || undefined })
                }
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => toggleKeyVisible('telegram')}
                title={apiKeyVisible['telegram'] ? 'Скрыть' : 'Показать'}
              >
                {apiKeyVisible['telegram'] ? '🙈' : '👁'}
              </button>
            </div>
          </label>
          <label>
            Chat ID
            <input
              type="text"
              placeholder="-1001234567890"
              value={settings.telegramChatId ?? ''}
              onChange={(e) =>
                onSettingsChange({ telegramChatId: e.target.value.trim() || undefined })
              }
              spellCheck={false}
            />
          </label>
          <div className={`${styles.hint} ${styles.hintInline}`}>
            Сообщение «Агент готов» через Bot API <code>sendMessage</code>. Токен — у{' '}
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">
              @BotFather
            </a>
            ; chat_id — у{' '}
            <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer">
              @userinfobot
            </a>{' '}
            или ID группы/канала.
          </div>
        </div>
      </SettingItem>
    </>
  )
}
