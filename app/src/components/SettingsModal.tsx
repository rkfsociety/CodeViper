import { useEffect, useState } from 'react'
import styles from './SettingsModal.module.css'
import type { AgentSettings, GitSyncStrategy, OllamaModel, PermissionMode } from '../types'
import { GIT_SYNC_STRATEGIES, GIT_SYNC_STRATEGY_LABELS } from '../types'
import {
  DEFAULT_COMMAND_TIMEOUT_SEC,
  COMMAND_TIMEOUT_SEC_MIN,
  COMMAND_TIMEOUT_SEC_MAX,
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_MODEL_DEFAULT,
  GEMINI_API_BASE_URL,
  GEMINI_MODEL_DEFAULT,
  GEMINI_FREE_MODELS
} from '../../shared/constants'
import { PERMISSION_MODES, PERMISSION_MODE_LABELS } from '../types'
import { ModelPanel } from './ModelPanel'
import { MemoryPanel } from './MemoryPanel'
import { SkillsPanel } from './SkillsPanel'
import { CloudModelSelector } from './CloudModelSelector'
import { useModalA11y } from '../hooks/useModalA11y'
import type { useOllamaDownloadQueue } from '../hooks/useOllamaDownloadQueue'

type DownloadQueue = ReturnType<typeof useOllamaDownloadQueue>

type SettingsTab = 'model' | 'behavior' | 'performance' | 'memory' | 'integrations'

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: string }[] = [
  {
    id: 'model',
    label: 'Модель',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  },
  {
    id: 'behavior',
    label: 'Поведение',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  },
  {
    id: 'performance',
    label: 'Производительность',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12L5 7l3 3 3-4 3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  },
  {
    id: 'memory',
    label: 'Память и навыки',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 3.5V2M11 3.5V2M1.5 7h13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  },
  {
    id: 'integrations',
    label: 'Интеграции',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="3" cy="8" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="4" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="12" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 8h3l2.5-4M5 8h3l2.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  }
]

interface Props {
  open: boolean
  settings: AgentSettings
  chatProjectPath: string
  ollamaOnline: boolean
  models: OllamaModel[]
  downloadQueue: DownloadQueue
  memoryRefreshKey: number
  skillsRefreshKey: number
  onClose: () => void
  onSettingsChange: (patch: Partial<AgentSettings>) => void
  onRefreshOllama: () => Promise<void>
  onSelfLearningChange: (selfLearning: boolean) => void
}

export function SettingsModal({
  open,
  settings,
  chatProjectPath,
  ollamaOnline,
  models,
  downloadQueue,
  memoryRefreshKey,
  skillsRefreshKey,
  onClose,
  onSettingsChange,
  onRefreshOllama,
  onSelfLearningChange
}: Props) {
  const [apiKeyVisible, setApiKeyVisible] = useState<Record<string, boolean>>({})
  const [pingState, setPingState] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle')
  const [qdrantPingState, setQdrantPingState] = useState<'idle' | 'checking' | 'ok' | 'fail'>(
    'idle'
  )

  function toggleKeyVisible(key: string) {
    setApiKeyVisible((prev) => ({ ...prev, [key]: !prev[key] }))
  }
  const [tab, setTab] = useState<SettingsTab>('model')
  const modalRef = useModalA11y<HTMLDivElement>(open)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const provider = settings.modelProvider ?? 'ollama'

  async function handlePing() {
    setPingState('checking')
    try {
      const ok = await window.codeviper.checkOllama(
        provider === 'ollama' ? settings.ollamaUrl : undefined
      )
      setPingState(ok ? 'ok' : 'fail')
    } catch {
      setPingState('fail')
    }
    setTimeout(() => setPingState('idle'), 3000)
  }

  function handleProviderChange(
    newProvider: 'ollama' | 'deepseek' | 'openai' | 'openrouter' | 'gemini' | 'anthropic'
  ) {
    const patch: Partial<AgentSettings> = { modelProvider: newProvider }
    if (newProvider === 'deepseek') {
      if (!settings.providerApiKey) patch.providerApiKey = ''
      // Если текущая модель не deepseek-* — подставляем дефолтную
      if (!/^deepseek/i.test(settings.model || '')) {
        patch.model = DEEPSEEK_MODEL_DEFAULT
      }
    }
    if (newProvider === 'gemini' && !/^gemini/i.test(settings.model || '')) {
      patch.model = GEMINI_MODEL_DEFAULT
    }
    if (newProvider === 'anthropic' && !/^claude/i.test(settings.model || '')) {
      patch.model = 'claude-3-5-sonnet-20241022'
    }
    onSettingsChange(patch)
  }

  async function handleQdrantPing() {
    const url = settings.qdrantUrl?.trim()
    if (!url) return
    setQdrantPingState('checking')
    try {
      const ok = await window.codeviper.checkQdrant(url, settings.qdrantApiKey || undefined)
      setQdrantPingState(ok ? 'ok' : 'fail')
    } catch {
      setQdrantPingState('fail')
    }
    setTimeout(() => setQdrantPingState('idle'), 3000)
  }

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        className={`modal ${styles.settingsModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="settings-title">Настройки</h2>
          <button type="button" className="btn modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <nav className={styles.nav} role="tablist">
            {SETTINGS_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`${styles.navItem}${tab === item.id ? ' ' + styles.navItemActive : ''}`}
                onClick={() => setTab(item.id)}
              >
                <span className={styles.navIcon} dangerouslySetInnerHTML={{ __html: item.icon }} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className={`${styles.content} modal-body settings`}>
            {tab === 'model' && (
              <>
                {/* ── Провайдер моделей ── */}
                <label>
                  Провайдер моделей
                  <select
                    value={provider}
                    onChange={(e) =>
                      handleProviderChange(
                        e.target.value as
                          | 'ollama'
                          | 'deepseek'
                          | 'openai'
                          | 'openrouter'
                          | 'gemini'
                          | 'anthropic'
                      )
                    }
                  >
                    <option value="ollama">Ollama (локально)</option>
                    <option value="anthropic">Claude (Anthropic API)</option>
                    <option value="deepseek">DeepSeek API</option>
                    <option value="gemini">Gemini API</option>
                    <option value="openai">OpenAI-совместимый API</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                </label>

                {provider === 'ollama' && (
                  <label>
                    Ollama URL
                    <input
                      value={settings.ollamaUrl}
                      onChange={(e) => onSettingsChange({ ollamaUrl: e.target.value })}
                      onBlur={() => void onRefreshOllama()}
                    />
                  </label>
                )}

                {provider === 'deepseek' && (
                  <>
                    <div className={styles.hint}>
                      Используется <strong>DeepSeek API</strong> — OpenAI-совместимый облачный API.
                      Базовый URL: <code>{DEEPSEEK_API_BASE_URL}</code>, модель по умолчанию:{' '}
                      <code>{DEEPSEEK_MODEL_DEFAULT}</code>.
                    </div>
                    <label>
                      DeepSeek API ключ
                      <div className="settings-api-key-row">
                        <input
                          type={apiKeyVisible['deepseek'] ? 'text' : 'password'}
                          placeholder="sk-..."
                          value={settings.deepseekApiKey ?? ''}
                          onChange={(e) => onSettingsChange({ deepseekApiKey: e.target.value })}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => toggleKeyVisible('deepseek')}
                          title={apiKeyVisible['deepseek'] ? 'Скрыть' : 'Показать'}
                        >
                          {apiKeyVisible['deepseek'] ? '🙈' : '👁'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => void handlePing()}
                          disabled={pingState === 'checking' || !settings.deepseekApiKey}
                          title="Проверить подключение"
                        >
                          {pingState === 'checking'
                            ? '⏳'
                            : pingState === 'ok'
                              ? '✅'
                              : pingState === 'fail'
                                ? '❌'
                                : '🔌'}
                        </button>
                      </div>
                    </label>
                  </>
                )}

                {provider === 'gemini' &&
                  (() => {
                    const tier = settings.geminiTier ?? 'free'
                    const isFree = tier === 'free'
                    const currentFreeModel =
                      GEMINI_FREE_MODELS.find((m) => m.id === settings.model) ??
                      GEMINI_FREE_MODELS[0]
                    return (
                      <>
                        <div className={styles.hint}>
                          Используется <strong>Gemini API</strong> через{' '}
                          <code>{GEMINI_API_BASE_URL}</code>.
                        </div>

                        {/* Переключатель уровня */}
                        <div className={styles.geminiTierRow}>
                          <button
                            type="button"
                            className={`btn${isFree ? ' active' : ''}`}
                            onClick={() => {
                              const first = GEMINI_FREE_MODELS[0]
                              onSettingsChange({
                                geminiTier: 'free',
                                model: first.id,
                                geminiRpm: first.rpm
                              })
                            }}
                          >
                            Бесплатный
                          </button>
                          <button
                            type="button"
                            className={`btn${!isFree ? ' active' : ''}`}
                            onClick={() =>
                              onSettingsChange({
                                geminiTier: 'paid',
                                model: settings.model || GEMINI_MODEL_DEFAULT
                              })
                            }
                          >
                            Платный
                          </button>
                        </div>

                        {/* API ключ */}
                        <label>
                          Gemini API ключ
                          <div className="settings-api-key-row">
                            <input
                              type={apiKeyVisible['gemini'] ? 'text' : 'password'}
                              placeholder="AIza..."
                              value={settings.geminiApiKey ?? ''}
                              onChange={(e) => onSettingsChange({ geminiApiKey: e.target.value })}
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => toggleKeyVisible('gemini')}
                              title={apiKeyVisible['gemini'] ? 'Скрыть' : 'Показать'}
                            >
                              {apiKeyVisible['gemini'] ? '🙈' : '👁'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => void handlePing()}
                              disabled={pingState === 'checking' || !settings.geminiApiKey}
                              title="Проверить подключение"
                            >
                              {pingState === 'checking'
                                ? '⏳'
                                : pingState === 'ok'
                                  ? '✅'
                                  : pingState === 'fail'
                                    ? '❌'
                                    : '🔌'}
                            </button>
                          </div>
                        </label>

                        {isFree ? (
                          /* Бесплатный — выбор из фиксированного списка */
                          <label>
                            Модель
                            <select
                              value={currentFreeModel.id}
                              onChange={(e) => {
                                const m = GEMINI_FREE_MODELS.find((x) => x.id === e.target.value)
                                if (m) onSettingsChange({ model: m.id, geminiRpm: m.rpm })
                              }}
                            >
                              {GEMINI_FREE_MODELS.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.label}
                                </option>
                              ))}
                            </select>
                            <span className={styles.hint}>
                              RPM: <strong>{currentFreeModel.rpm}</strong> · TPM:{' '}
                              <strong>
                                {currentFreeModel.tpm != null
                                  ? `${(currentFreeModel.tpm / 1000).toFixed(0)}K`
                                  : '∞'}
                              </strong>{' '}
                              — лимиты фиксированы для бесплатного уровня.
                            </span>
                          </label>
                        ) : (
                          /* Платный — ручной ввод модели и RPM */
                          <>
                            <label>
                              Лимит запросов в минуту (RPM)
                              <input
                                type="number"
                                min={1}
                                max={2000}
                                step={1}
                                value={settings.geminiRpm ?? 15}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10)
                                  if (!isNaN(v) && v >= 1) onSettingsChange({ geminiRpm: v })
                                }}
                              />
                              <span className={styles.hint}>
                                Интервал между запросами рассчитывается автоматически.
                              </span>
                            </label>
                          </>
                        )}
                      </>
                    )
                  })()}

                {provider === 'anthropic' && (
                  <>
                    <div className={styles.hint}>
                      Используется <strong>Claude API (Anthropic)</strong>. Модель по умолчанию:{' '}
                      <code>claude-3-5-sonnet-20241022</code>.
                    </div>
                    <label>
                      Claude API ключ
                      <div className="settings-api-key-row">
                        <input
                          type={apiKeyVisible['claude'] ? 'text' : 'password'}
                          placeholder="sk-ant-..."
                          value={settings.claudeApiKey ?? ''}
                          onChange={(e) => onSettingsChange({ claudeApiKey: e.target.value })}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => toggleKeyVisible('claude')}
                          title={apiKeyVisible['claude'] ? 'Скрыть' : 'Показать'}
                        >
                          {apiKeyVisible['claude'] ? '🙈' : '👁'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => void handlePing()}
                          disabled={pingState === 'checking' || !settings.claudeApiKey}
                          title="Проверить подключение"
                        >
                          {pingState === 'checking'
                            ? '⏳'
                            : pingState === 'ok'
                              ? '✅'
                              : pingState === 'fail'
                                ? '❌'
                                : '🔌'}
                        </button>
                      </div>
                    </label>
                  </>
                )}

                {provider === 'openai' && (
                  <>
                    <label>
                      API базовый URL
                      <input
                        placeholder="https://api.openai.com/v1"
                        value={settings.ollamaUrl}
                        onChange={(e) => onSettingsChange({ ollamaUrl: e.target.value })}
                      />
                    </label>
                    <label>
                      API ключ
                      <div className="settings-api-key-row">
                        <input
                          type={apiKeyVisible['openai'] ? 'text' : 'password'}
                          placeholder="sk-..."
                          value={settings.openaiApiKey ?? ''}
                          onChange={(e) => onSettingsChange({ openaiApiKey: e.target.value })}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => toggleKeyVisible('openai')}
                          title={apiKeyVisible['openai'] ? 'Скрыть' : 'Показать'}
                        >
                          {apiKeyVisible['openai'] ? '🙈' : '👁'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => void handlePing()}
                          disabled={pingState === 'checking'}
                          title="Проверить подключение"
                        >
                          {pingState === 'checking'
                            ? '⏳'
                            : pingState === 'ok'
                              ? '✅'
                              : pingState === 'fail'
                                ? '❌'
                                : '🔌'}
                        </button>
                      </div>
                    </label>
                  </>
                )}

                {provider === 'openrouter' && (
                  <>
                    <div className={styles.hint}>
                      <strong>OpenRouter</strong> — агрегатор моделей (GPT-4o, Claude, Gemini, Llama
                      и др.). Базовый URL: <code>https://openrouter.ai/api/v1</code>. Получить ключ:{' '}
                      <strong>openrouter.ai/keys</strong>
                    </div>
                    <label>
                      OpenRouter API ключ
                      <div className="settings-api-key-row">
                        <input
                          type={apiKeyVisible['openrouter'] ? 'text' : 'password'}
                          placeholder="sk-or-..."
                          value={settings.openrouterApiKey ?? ''}
                          onChange={(e) => onSettingsChange({ openrouterApiKey: e.target.value })}
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => toggleKeyVisible('openrouter')}
                          title={apiKeyVisible['openrouter'] ? 'Скрыть' : 'Показать'}
                        >
                          {apiKeyVisible['openrouter'] ? '🙈' : '👁'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => void handlePing()}
                          disabled={pingState === 'checking' || !settings.openrouterApiKey}
                          title="Проверить подключение"
                        >
                          {pingState === 'checking'
                            ? '⏳'
                            : pingState === 'ok'
                              ? '✅'
                              : pingState === 'fail'
                                ? '❌'
                                : '🔌'}
                        </button>
                      </div>
                    </label>
                  </>
                )}

                {settings.modelProvider === 'ollama' && (
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={settings.autoModel !== false}
                      onChange={(e) => onSettingsChange({ autoModel: e.target.checked })}
                    />
                    <span>
                      <strong>Автовыбор модели</strong> — подбирать модель под задачу, выгружать
                      другие из RAM (если установлено несколько)
                    </span>
                  </label>
                )}

                {settings.modelProvider === 'ollama' && (
                  <>
                    <label>
                      Модель для суммаризации
                      <select
                        value={settings.summarizeModel ?? ''}
                        onChange={(e) => onSettingsChange({ summarizeModel: e.target.value })}
                      >
                        <option value="">Авто — самая лёгкая установленная</option>
                        {models.map((model) => (
                          <option key={model.name} value={model.name}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className={styles.hint}>
                      Сжатие длинной истории чата при достижении порога. По умолчанию берётся самая
                      лёгкая модель в Ollama — быстрее и не отвлекает основную модель агента.
                    </div>
                  </>
                )}

                <label>
                  Порог суммаризации:{' '}
                  <strong>
                    {settings.aggressiveCompression
                      ? 65
                      : (settings.contextSummarizeThreshold ?? 85)}
                    %
                  </strong>
                  <input
                    type="range"
                    min={50}
                    max={85}
                    step={5}
                    disabled={settings.aggressiveCompression === true}
                    value={
                      settings.aggressiveCompression
                        ? 65
                        : (settings.contextSummarizeThreshold ?? 85)
                    }
                    onChange={(e) =>
                      onSettingsChange({ contextSummarizeThreshold: Number(e.target.value) })
                    }
                    style={{ width: '100%' }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.75em',
                      opacity: 0.6
                    }}
                  >
                    <span>50% — максимальная экономия</span>
                    <span>85% — дефолт</span>
                  </div>
                </label>

                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={settings.aggressiveCompression === true}
                    onChange={(e) => {
                      onSettingsChange({
                        aggressiveCompression: e.target.checked,
                        ...(e.target.checked ? {} : { contextSummarizeThreshold: 85 })
                      })
                    }}
                  />
                  <span className={styles.track} aria-hidden="true">
                    <span className={styles.thumb} />
                  </span>
                  <span className={styles.toggleContent}>
                    <span className={styles.title}>Агрессивное сжатие (65%)</span>
                    <span className={styles.desc}>
                      Суммаризировать при 65% заполнения контекста — экономия 30–40% на длинных
                      диалогах; перекрывает слайдер выше
                    </span>
                  </span>
                </label>

                {/* ── Второй провайдер (дополнительно) ── */}
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>Облачный API (дополнительно)</div>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={settings.cloudEnabled === true}
                      onChange={(e) => onSettingsChange({ cloudEnabled: e.target.checked })}
                    />
                    <span className={styles.track} aria-hidden="true">
                      <span className={styles.thumb} />
                    </span>
                    <span className={styles.toggleContent}>
                      <span className={styles.title}>Включить облачный провайдер</span>
                      <span className={styles.desc}>
                        {provider === 'ollama'
                          ? 'Ollama остаётся основным; облако используется для суммаризации контекста'
                          : 'Облако остаётся основным; Ollama используется для суммаризации контекста'}
                      </span>
                    </span>
                  </label>

                  {settings.cloudEnabled && (
                    <>
                      <label>
                        Тип облачного провайдера
                        <select
                          value={settings.cloudProvider ?? 'deepseek'}
                          onChange={(e) =>
                            onSettingsChange({
                              cloudProvider: e.target.value as
                                | 'deepseek'
                                | 'openai'
                                | 'openrouter'
                                | 'gemini'
                            })
                          }
                        >
                          <option value="deepseek">DeepSeek API</option>
                          <option value="gemini">Gemini API</option>
                          <option value="openai">OpenAI-совместимый API</option>
                          <option value="openrouter">OpenRouter</option>
                        </select>
                      </label>

                      {(settings.cloudProvider ?? 'deepseek') === 'deepseek' ? (
                        <label>
                          Базовый URL
                          <input
                            placeholder="https://api.deepseek.com"
                            value={settings.cloudBaseUrl || 'https://api.deepseek.com'}
                            disabled
                          />
                        </label>
                      ) : (
                        <label>
                          Базовый URL
                          <input
                            placeholder={
                              (settings.cloudProvider ?? 'openai') === 'openrouter'
                                ? 'https://openrouter.ai/api/v1'
                                : (settings.cloudProvider ?? 'deepseek') === 'gemini'
                                  ? 'https://generativelanguage.googleapis.com/v1beta'
                                  : 'https://api.openai.com/v1'
                            }
                            value={settings.cloudBaseUrl ?? ''}
                            onChange={(e) => onSettingsChange({ cloudBaseUrl: e.target.value })}
                          />
                        </label>
                      )}

                      <label>
                        API ключ
                        <input
                          type="password"
                          placeholder="sk-..."
                          value={settings.cloudApiKey ?? ''}
                          onChange={(e) => onSettingsChange({ cloudApiKey: e.target.value })}
                          autoComplete="off"
                        />
                      </label>

                      <label>
                        Модель
                        <input
                          placeholder={
                            (settings.cloudProvider ?? 'deepseek') === 'deepseek'
                              ? 'deepseek-chat'
                              : (settings.cloudProvider ?? 'deepseek') === 'gemini'
                                ? 'gemini-2.5-flash'
                                : 'gpt-4o-mini'
                          }
                          value={settings.cloudModel ?? ''}
                          onChange={(e) => onSettingsChange({ cloudModel: e.target.value })}
                        />
                      </label>
                      <div className={styles.hint}>
                        {provider === 'ollama'
                          ? 'Облачная модель будет использоваться для суммаризации длинных диалогов вместо локальной — качество сжатия обычно выше.'
                          : 'Ollama будет использоваться для локальной суммаризации, освобождая облачные токены.'}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {tab === 'behavior' && (
              <>
                {/* ── Безопасность ── */}
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>Безопасность</div>
                  <label>
                    Режим доступа
                    <select
                      value={settings.permissionMode ?? 'bypass'}
                      onChange={(e) =>
                        onSettingsChange({ permissionMode: e.target.value as PermissionMode })
                      }
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
                    <strong>Принимать правки</strong> — файлы без вопросов, команды с
                    подтверждением. <strong>Без подтверждений</strong> — агент действует сам.
                  </div>
                </div>

                {/* ── Поведение агента ── */}
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>Поведение агента</div>

                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={settings.clarifyMode === true}
                      onChange={(e) => onSettingsChange({ clarifyMode: e.target.checked })}
                    />
                    <span className={styles.track} aria-hidden="true">
                      <span className={styles.thumb} />
                    </span>
                    <span className={styles.toggleContent}>
                      <span className={styles.title}>Уточняющие вопросы</span>
                      <span className={styles.desc}>
                        При неоднозначной задаче агент сначала задаёт вопросы, а потом приступает
                      </span>
                    </span>
                  </label>

                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={settings.deepReasoning === true}
                      onChange={(e) => onSettingsChange({ deepReasoning: e.target.checked })}
                    />
                    <span className={styles.track} aria-hidden="true">
                      <span className={styles.thumb} />
                    </span>
                    <span className={styles.toggleContent}>
                      <span className={styles.title}>Глубокое рассуждение</span>
                      <span className={styles.desc}>
                        Для think-моделей (qwen3, deepseek-r1, qwq) включает режим рассуждения, для
                        остальных усиливает промпт. Точнее, но медленнее
                      </span>
                    </span>
                  </label>

                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={settings.excludeThinkingFromHistory !== false}
                      onChange={(e) =>
                        onSettingsChange({ excludeThinkingFromHistory: e.target.checked })
                      }
                    />
                    <span className={styles.track} aria-hidden="true">
                      <span className={styles.thumb} />
                    </span>
                    <span className={styles.toggleContent}>
                      <span className={styles.title}>Исключать reasoning из истории</span>
                      <span className={styles.desc}>
                        Убирает блоки &lt;think&gt;…&lt;/think&gt; из истории при построении
                        контекста. Экономит 20–50% токенов для think-моделей (DeepSeek-R1, QwQ,
                        Qwen3)
                      </span>
                    </span>
                  </label>

                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={settings.readonlyMode === true}
                      onChange={(e) => onSettingsChange({ readonlyMode: e.target.checked })}
                    />
                    <span className={styles.track} aria-hidden="true">
                      <span className={styles.thumb} />
                    </span>
                    <span className={styles.toggleContent}>
                      <span className={styles.title}>Только чтение</span>
                      <span className={styles.desc}>
                        Блокирует все инструменты записи; агент может только читать файлы и искать
                        по коду
                      </span>
                    </span>
                  </label>
                </div>

                {/* ── Автоматизация ── */}
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>Автоматизация</div>

                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={settings.autoPushSelfEdits !== false}
                      onChange={(e) => onSettingsChange({ autoPushSelfEdits: e.target.checked })}
                    />
                    <span className={styles.track} aria-hidden="true">
                      <span className={styles.thumb} />
                    </span>
                    <span className={styles.toggleContent}>
                      <span className={styles.title}>Автокоммит самоправок</span>
                      <span className={styles.desc}>
                        После правки кода агентом — автоматически git commit + push на GitHub
                      </span>
                    </span>
                  </label>

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
                        <strong>Stash + reset</strong> — локальные правки прячутся в{' '}
                        <code>git stash</code>, затем <code>reset --hard</code> на версию GitHub
                        (приоритет у GitHub). <strong>Rebase</strong> — локальные коммиты
                        переносятся поверх версии GitHub. <strong>Fast-forward only</strong> —
                        обновление только если нет расхождений; иначе остаётся локальная версия
                        (ничего не теряется).
                        <br />
                        При незакоммиченных изменениях лаунчер покажет предупреждение и спросит
                        подтверждение перед синхронизацией.
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {tab === 'model' && (
              <>
                {provider === 'ollama' ? (
                  <ModelPanel
                    ollamaUrl={settings.ollamaUrl}
                    ollamaOnline={ollamaOnline}
                    models={models}
                    selectedModel={settings.model}
                    autoModel={settings.autoModel !== false}
                    downloadQueue={{
                      pulling: downloadQueue.pulling,
                      queued: downloadQueue.queued,
                      progress: downloadQueue.progress,
                      error: downloadQueue.error,
                      percent: downloadQueue.percent,
                      onEnqueue: downloadQueue.enqueue,
                      onRemoveFromQueue: downloadQueue.removeFromQueue,
                      onClearError: downloadQueue.clearError
                    }}
                    onModelChange={(model) => onSettingsChange({ model })}
                    onRefresh={onRefreshOllama}
                  />
                ) : (
                  <CloudModelSelector
                    provider={provider}
                    model={settings.model}
                    defaultModel={provider === 'deepseek' ? DEEPSEEK_MODEL_DEFAULT : ''}
                    models={models}
                    onChange={(model, contextLength) =>
                      onSettingsChange({
                        model,
                        ...(contextLength ? { modelContextLength: contextLength } : {})
                      })
                    }
                  />
                )}
              </>
            )}

            {tab === 'performance' && (
              <>
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
                        Останавливает фоновый опрос загрузки процессора и видеокарты во время работы
                        агента
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
                        Отключает авто-опрос Pull Requests каждые 5 минут — обновление только по
                        кнопке
                      </span>
                    </span>
                  </label>
                </div>

                <div className={styles.section}>
                  <div className={styles.sectionLabel}>GPU / память (Ollama)</div>

                  <div className={styles.row}>
                    <div className={styles.rowContent}>
                      <span className={styles.title}>Слоёв на GPU</span>
                      <span className={styles.desc}>
                        Сколько слоёв модели загружать на GPU. Пусто или -1 — авто (всё на GPU). 0 —
                        только CPU (медленно, но без OOM). Дробные значения, например 20, позволяют
                        запустить крупную модель частично: одни слои на GPU, остальные на RAM.
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
                          onSettingsChange({
                            ollamaNumGpu: raw === '' ? undefined : Number(raw)
                          })
                        }}
                      />
                      <span className={styles.unit}>слоёв</span>
                    </div>
                  </div>
                </div>

                <div className={styles.section}>
                  <div className={styles.sectionLabel}>Таймауты</div>

                  <div className={styles.row}>
                    <div className={styles.rowContent}>
                      <span className={styles.title}>Таймаут команд</span>
                      <span className={styles.desc}>
                        Макс. время одной команды агента (по умолч. 120 с, макс.{' '}
                        {COMMAND_TIMEOUT_SEC_MAX} с)
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
                      <span className={styles.title}>Звуковые уведомления</span>
                      <span className={styles.desc}>
                        Короткий сигнал при завершении задачи агента
                      </span>
                    </span>
                  </label>
                </div>
              </>
            )}

            {tab === 'integrations' && (
              <>
                {/* ── GitHub ── */}
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>GitHub</div>
                  <label>
                    GitHub Token
                    <input
                      type="password"
                      placeholder="ghp_..."
                      value={settings.githubToken ?? ''}
                      onChange={(e) => onSettingsChange({ githubToken: e.target.value })}
                    />
                  </label>
                  <div className={`${styles.hint} ${styles.hintInline}`}>
                    Personal Access Token с правом <code>gist</code> для кнопки «Поделиться» в
                    Памяти и Навыках. Создать:{' '}
                    <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
                      github.com/settings/tokens
                    </a>
                  </div>
                </div>

                {/* ── Qdrant ── */}
                <div className={styles.section}>
                  <div className={styles.sectionLabel}>Qdrant</div>
                  <label>
                    URL
                    <div className="settings-api-key-row">
                      <input
                        placeholder="http://localhost:6333"
                        value={settings.qdrantUrl ?? ''}
                        onChange={(e) => onSettingsChange({ qdrantUrl: e.target.value })}
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => void handleQdrantPing()}
                        disabled={qdrantPingState === 'checking' || !settings.qdrantUrl?.trim()}
                        title="Проверить подключение"
                      >
                        {qdrantPingState === 'checking'
                          ? '⏳'
                          : qdrantPingState === 'ok'
                            ? '✅'
                            : qdrantPingState === 'fail'
                              ? '❌'
                              : '🔌'}
                      </button>
                    </div>
                  </label>
                  <label>
                    API ключ
                    <div className="settings-api-key-row">
                      <input
                        type={apiKeyVisible['qdrant'] ? 'text' : 'password'}
                        placeholder="(опционально)"
                        value={settings.qdrantApiKey ?? ''}
                        onChange={(e) => onSettingsChange({ qdrantApiKey: e.target.value })}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => toggleKeyVisible('qdrant')}
                        title={apiKeyVisible['qdrant'] ? 'Скрыть' : 'Показать'}
                      >
                        {apiKeyVisible['qdrant'] ? '🙈' : '👁'}
                      </button>
                    </div>
                  </label>
                  <div className={`${styles.hint} ${styles.hintInline}`}>
                    Векторная база данных для семантического поиска по коду и памяти агента. API
                    ключ нужен только для защищённых инстансов Qdrant Cloud.
                  </div>
                </div>
              </>
            )}

            {tab === 'memory' && (
              <>
                <MemoryPanel
                  projectPath={chatProjectPath}
                  selfLearning={settings.selfLearning !== false}
                  onSelfLearningChange={onSelfLearningChange}
                  githubToken={settings.githubToken}
                  refreshKey={memoryRefreshKey}
                />

                <SkillsPanel
                  projectPath={chatProjectPath}
                  githubToken={settings.githubToken}
                  refreshKey={skillsRefreshKey}
                />
              </>
            )}
          </div>
        </div>

        {!ollamaOnline && (
          <div className="hint">
            Ollama не отвечает. Установи с <strong>ollama.com</strong>, запусти приложение Ollama и
            нажми «Обновить Ollama» в верхней панели.
          </div>
        )}

        <div className={styles.about}>
          <span className={styles.aboutVersion}>CodeViper v{__APP_VERSION__}</span>
          <a
            className={styles.aboutLink}
            href="https://github.com/rkfsociety/CodeViper/issues"
            target="_blank"
            rel="noreferrer"
          >
            Сообщить об ошибке
          </a>
          <a
            className={styles.aboutLink}
            href="https://github.com/rkfsociety/CodeViper"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  )
}
