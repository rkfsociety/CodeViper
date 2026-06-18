import { useEffect, useState } from 'react'
import type { AgentSettings, GitSyncStrategy, OllamaModel, PermissionMode } from '../types'
import { GIT_SYNC_STRATEGIES, GIT_SYNC_STRATEGY_LABELS } from '../types'
import {
  DEFAULT_MAX_STEPS,
  MAX_STEPS_MIN,
  MAX_STEPS_MAX,
  DEFAULT_MAX_RUNS_PER_HOUR,
  MAX_RUNS_PER_HOUR_MIN,
  MAX_RUNS_PER_HOUR_MAX,
  DEFAULT_COMMAND_TIMEOUT_SEC,
  COMMAND_TIMEOUT_SEC_MIN,
  COMMAND_TIMEOUT_SEC_MAX,
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_MODEL_DEFAULT
} from '../../shared/constants'
import { PERMISSION_MODES, PERMISSION_MODE_LABELS } from '../types'
import { ModelPanel } from './ModelPanel'
import { MemoryPanel } from './MemoryPanel'
import { SkillsPanel } from './SkillsPanel'
import { CloudModelSelector } from './CloudModelSelector'
import { useModalA11y } from '../hooks/useModalA11y'
import type { useOllamaDownloadQueue } from '../hooks/useOllamaDownloadQueue'
import styles from './SettingsModal.module.css'

type DownloadQueue = ReturnType<typeof useOllamaDownloadQueue>

type SettingsTab = 'model' | 'behavior' | 'memory'

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'model', label: 'Модель' },
  { id: 'behavior', label: 'Поведение' },
  { id: 'memory', label: 'Память и навыки' }
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
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [pingState, setPingState] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle')
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

  function handleProviderChange(newProvider: 'ollama' | 'deepseek' | 'openai') {
    const patch: Partial<AgentSettings> = { modelProvider: newProvider }
    if (newProvider === 'deepseek') {
      if (!settings.providerApiKey) patch.providerApiKey = ''
      // Если текущая модель не deepseek-* — подставляем дефолтную
      if (!/^deepseek/i.test(settings.model || '')) {
        patch.model = DEEPSEEK_MODEL_DEFAULT
      }
    }
    onSettingsChange(patch)
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

        <div className={styles.tabs} role="tablist">
          {SETTINGS_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`${styles.tab}${tab === item.id ? ' ' + styles.active : ''}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="modal-body settings">
          {tab === 'model' && (
            <>
              {/* ── Провайдер моделей ── */}
              <label>
                Провайдер моделей
                <select
                  value={provider}
                  onChange={(e) =>
                    handleProviderChange(e.target.value as 'ollama' | 'deepseek' | 'openai')
                  }
                >
                  <option value="ollama">Ollama (локально)</option>
                  <option value="deepseek">DeepSeek API</option>
                  <option value="openai">OpenAI-совместимый API</option>
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
                  <div className="settings-hint">
                    Используется <strong>DeepSeek API</strong> — OpenAI-совместимый облачный API.
                    Базовый URL: <code>{DEEPSEEK_API_BASE_URL}</code>, модель по умолчанию:{' '}
                    <code>{DEEPSEEK_MODEL_DEFAULT}</code>.
                  </div>
                  <label>
                    DeepSeek API ключ
                    <div className="settings-api-key-row">
                      <input
                        type={apiKeyVisible ? 'text' : 'password'}
                        placeholder="sk-..."
                        value={settings.providerApiKey ?? ''}
                        onChange={(e) => onSettingsChange({ providerApiKey: e.target.value })}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setApiKeyVisible((v) => !v)}
                        title={apiKeyVisible ? 'Скрыть' : 'Показать'}
                      >
                        {apiKeyVisible ? '🙈' : '👁'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => void handlePing()}
                        disabled={pingState === 'checking' || !settings.providerApiKey}
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
                        type={apiKeyVisible ? 'text' : 'password'}
                        placeholder="sk-..."
                        value={settings.providerApiKey ?? ''}
                        onChange={(e) => onSettingsChange({ providerApiKey: e.target.value })}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setApiKeyVisible((v) => !v)}
                        title={apiKeyVisible ? 'Скрыть' : 'Показать'}
                      >
                        {apiKeyVisible ? '🙈' : '👁'}
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

              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={settings.autoModel !== false}
                  onChange={(e) => onSettingsChange({ autoModel: e.target.checked })}
                />
                <span>
                  <strong>Автовыбор модели</strong> — подбирать модель под задачу, выгружать другие
                  из RAM (если установлено несколько)
                </span>
              </label>

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
              <div className="settings-hint">
                Сжатие длинной истории чата при ~85% лимита контекста. По умолчанию берётся самая
                лёгкая модель в Ollama — быстрее и не отвлекает основную модель агента.
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
                <div className={`settings-hint ${styles.hintInline}`}>
                  <strong>Спрашивать всё</strong> — подтверждение перед каждой записью/командой.{' '}
                  <strong>Принимать правки</strong> — файлы без вопросов, команды с подтверждением.{' '}
                  <strong>Без подтверждений</strong> — агент действует сам.
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
                  <span className={styles.content}>
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
                  <span className={styles.content}>
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
                    checked={settings.readonlyMode === true}
                    onChange={(e) => onSettingsChange({ readonlyMode: e.target.checked })}
                  />
                  <span className={styles.track} aria-hidden="true">
                    <span className={styles.thumb} />
                  </span>
                  <span className={styles.content}>
                    <span className={styles.title}>Только чтение</span>
                    <span className={styles.desc}>
                      Блокирует все инструменты записи; агент может только читать файлы и искать по
                      коду
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
                  <span className={styles.content}>
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
                  <span className={styles.content}>
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
                    <div className={`settings-hint ${styles.hintInline}`}>
                      <strong>Stash + reset</strong> — локальные правки прячутся в{' '}
                      <code>git stash</code>, затем <code>reset --hard</code> на версию GitHub
                      (приоритет у GitHub). <strong>Rebase</strong> — локальные коммиты переносятся
                      поверх версии GitHub. <strong>Fast-forward only</strong> — обновление только
                      если нет расхождений; иначе остаётся локальная версия (ничего не теряется).
                      <br />
                      При незакоммиченных изменениях лаунчер покажет предупреждение и спросит
                      подтверждение перед синхронизацией.
                    </div>
                  </>
                )}
              </div>

              {/* ── Производительность ── */}
              <div className={styles.section}>
                <div className={styles.sectionLabel}>Производительность</div>

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

                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={settings.soundNotifications === true}
                    onChange={(e) => onSettingsChange({ soundNotifications: e.target.checked })}
                  />
                  <span className={styles.track} aria-hidden="true">
                    <span className={styles.thumb} />
                  </span>
                  <span className={styles.content}>
                    <span className={styles.title}>Звуковые уведомления</span>
                    <span className={styles.desc}>
                      Короткий сигнал при завершении задачи агента
                    </span>
                  </span>
                </label>
              </div>

              {/* ── Интеграции ── */}
              <div className={styles.section}>
                <div className={styles.sectionLabel}>Интеграции</div>
                <label>
                  GitHub Token
                  <input
                    type="password"
                    placeholder="ghp_..."
                    value={settings.githubToken ?? ''}
                    onChange={(e) => onSettingsChange({ githubToken: e.target.value })}
                  />
                </label>
                <div className={`settings-hint ${styles.hintInline}`}>
                  Personal Access Token с правом <code>gist</code> для кнопки «Поделиться» в Памяти
                  и Навыках. Создать:{' '}
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
                    github.com/settings/tokens
                  </a>
                </div>
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
                  onChange={(model) => onSettingsChange({ model })}
                />
              )}

              <label>
                Макс. шагов агента
                <input
                  type="number"
                  min={MAX_STEPS_MIN}
                  max={MAX_STEPS_MAX}
                  value={settings.maxSteps}
                  onChange={(e) =>
                    onSettingsChange({ maxSteps: Number(e.target.value) || DEFAULT_MAX_STEPS })
                  }
                />
              </label>

              <label>
                Макс. прогонов в час
                <input
                  type="number"
                  min={MAX_RUNS_PER_HOUR_MIN}
                  max={MAX_RUNS_PER_HOUR_MAX}
                  value={settings.maxRunsPerHour ?? DEFAULT_MAX_RUNS_PER_HOUR}
                  onChange={(e) =>
                    onSettingsChange({
                      maxRunsPerHour: Number(e.target.value) || DEFAULT_MAX_RUNS_PER_HOUR
                    })
                  }
                />
              </label>
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
