import { useState } from 'react'
import styles from './SettingsModal.module.css'
import type { AgentSettings, PromptTemplate } from '../../types'
import { makeId } from '../../../shared/makeId'
import { SettingItem } from './shared'

interface Props {
  isActive: boolean
  isSearching: boolean
  settings: AgentSettings
  onSettingsChange: (patch: Partial<AgentSettings>) => void
}

export function AdvancedTab({ isActive, isSearching, settings, onSettingsChange }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [formTrigger, setFormTrigger] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formText, setFormText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  if (!isActive && !isSearching) return null

  const templates: PromptTemplate[] = settings.promptTemplates ?? []

  function removeTemplate(id: string) {
    onSettingsChange({ promptTemplates: templates.filter((t) => t.id !== id) })
  }

  function addTemplate() {
    const trigger = formTrigger.trim()
    const text = formText.trim()
    if (!trigger) {
      setFormError('Укажи имя команды')
      return
    }
    if (!/^[a-z0-9_-]+$/.test(trigger)) {
      setFormError('Только строчные буквы, цифры, _ и -')
      return
    }
    if (!text) {
      setFormError('Текст промпта не может быть пустым')
      return
    }
    if (templates.some((t) => t.trigger === trigger)) {
      setFormError(`Команда /${trigger} уже существует`)
      return
    }
    const newTpl: PromptTemplate = {
      id: makeId(),
      trigger,
      description: formDesc.trim(),
      text
    }
    onSettingsChange({ promptTemplates: [...templates, newTpl] })
    setFormTrigger('')
    setFormDesc('')
    setFormText('')
    setFormError(null)
    setShowForm(false)
  }

  return (
    <>
      <SettingItem
        tab="advanced"
        label="Разработка"
        desc="путь исходники codeviper source root override"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Разработка</div>
          <label>
            Путь к исходникам CodeViper
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="F:\\github\\CodeViper\\app"
                value={settings.sourceRootOverride ?? ''}
                onChange={(e) => onSettingsChange({ sourceRootOverride: e.target.value })}
                style={{ flex: 1 }}
              />
              <button
                onClick={async () => {
                  const path = await window.codeviper.selectFolder()
                  if (path) {
                    onSettingsChange({ sourceRootOverride: path })
                  }
                }}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  backgroundColor: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                Выбрать папку
              </button>
            </div>
          </label>
          <div className={`${styles.hint} ${styles.hintInline}`}>
            Абсолютный путь к папке <code>app/</code> исходников CodeViper. Если указан,
            используется вместо автоматического поиска. Оставьте пусто для автоматического поиска.
          </div>
          <label>
            Корень git-репозитория (для синхронизации знаний)
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="F:\\github\\CodeViper"
                value={settings.gitRepoRoot ?? ''}
                onChange={(e) => onSettingsChange({ gitRepoRoot: e.target.value })}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={async () => {
                  const path = await window.codeviper.selectFolder()
                  if (path) onSettingsChange({ gitRepoRoot: path })
                }}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  backgroundColor: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                Выбрать папку
              </button>
            </div>
          </label>
          <div className={`${styles.hint} ${styles.hintInline}`}>
            Клон репозитория CodeViper (где лежит <code>.git</code> и <code>ROADMAP.md</code>).
            Обычно заполняется автоматически (<code>%APPDATA%/CodeViper/source</code>); без клона —
            <code>gh auth login</code> или GitHub Token с правом <code>repo</code> в Интеграциях.
          </div>
        </div>
      </SettingItem>

      <SettingItem
        tab="advanced"
        label="Шаблоны промптов"
        desc="слэш команды шаблон промпт slash template /команда custom"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Шаблоны промптов</div>
          <p className={styles.desc}>
            Пользовательские команды для быстрого ввода. Доступны через <code>/имя</code> в поле
            чата — работают наравне со встроенными командами (<code>/test</code>,{' '}
            <code>/commit</code>, <code>/review</code> и др.).
          </p>

          {templates.length > 0 && (
            <div className={styles.templateList}>
              {templates.map((tpl) => (
                <div key={tpl.id} className={styles.templateItem}>
                  <div className={styles.templateItemContent}>
                    <span className={styles.templateTrigger}>/{tpl.trigger}</span>
                    <span className={styles.templateDesc} title={tpl.text}>
                      {tpl.description || tpl.text.slice(0, 60) + (tpl.text.length > 60 ? '…' : '')}
                    </span>
                  </div>
                  <button
                    className={styles.btnDanger}
                    onClick={() => removeTemplate(tpl.id)}
                    aria-label={`Удалить шаблон /${tpl.trigger}`}
                    title="Удалить"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {showForm ? (
            <div className={styles.templateForm}>
              {formError && <div className={styles.mcpError}>{formError}</div>}
              <label>
                Команда
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '14px',
                      color: 'var(--text-muted)'
                    }}
                  >
                    /
                  </span>
                  <input
                    type="text"
                    placeholder="deploy"
                    value={formTrigger}
                    onChange={(e) =>
                      setFormTrigger(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))
                    }
                    spellCheck={false}
                    autoFocus
                  />
                </div>
              </label>
              <label>
                Описание (кратко, необязательно)
                <input
                  type="text"
                  placeholder="Развернуть в production"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </label>
              <label>
                Текст промпта
                <textarea
                  placeholder="Задеплой текущую ветку в production: ..."
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                  rows={4}
                  spellCheck={false}
                />
              </label>
              <div className={styles.templateFormActions}>
                <button
                  className="btn"
                  onClick={() => {
                    setShowForm(false)
                    setFormError(null)
                  }}
                >
                  Отмена
                </button>
                <button className="btn btn-primary" onClick={addTemplate}>
                  Добавить
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn"
              onClick={() => setShowForm(true)}
              style={{ alignSelf: 'flex-start', marginTop: '4px' }}
            >
              + Добавить шаблон
            </button>
          )}
        </div>
      </SettingItem>
    </>
  )
}
