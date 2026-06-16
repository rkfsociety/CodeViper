import { useEffect, useState } from 'react'
import type { AgentSettings, OllamaModel, PermissionMode } from '../types'
import {
  DEFAULT_MAX_STEPS, MAX_STEPS_MIN, MAX_STEPS_MAX,
  DEFAULT_MAX_RUNS_PER_HOUR, MAX_RUNS_PER_HOUR_MIN, MAX_RUNS_PER_HOUR_MAX,
  DEEPSEEK_API_BASE_URL, DEEPSEEK_MODEL_DEFAULT
} from '../../shared/constants'
import { PERMISSION_MODES, PERMISSION_MODE_LABELS } from '../types'
import { ModelPanel } from './ModelPanel'
import { MemoryPanel } from './MemoryPanel'
import { SkillsPanel } from './SkillsPanel'
import { CloudModelSelector } from './CloudModelSelector'
import type { useOllamaDownloadQueue } from '../hooks/useOllamaDownloadQueue'

type DownloadQueue = ReturnType<typeof useOllamaDownloadQueue>

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
    // При переключении на DeepSeek — подставить дефолтный URL и модель
    if (newProvider === 'deepseek') {
      if (!settings.providerApiKey) patch.providerApiKey = ''
    }
    onSettingsChange(patch)
  }

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal settings-modal"
        role="dialog"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="settings-title">Настройки</h2>
          <button type="button" className="btn modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className="modal-body settings">
          {/* ── Провайдер моделей ── */}
          <label>
            Провайдер моделей
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as 'ollama' | 'deepseek' | 'openai')}
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
                Базовый URL: <code>{DEEPSEEK_API_BASE_URL}</code>, модель по умолчанию: <code>{DEEPSEEK_MODEL_DEFAULT}</code>.
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
                    {pingState === 'checking' ? '⏳' : pingState === 'ok' ? '✅' : pingState === 'fail' ? '❌' : '🔌'}
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
                    {pingState === 'checking' ? '⏳' : pingState === 'ok' ? '✅' : pingState === 'fail' ? '❌' : '🔌'}
                  </button>
                </div>
              </label>
            </>
          )}

          <label className="settings-toggle">
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
          <div className="settings-hint">
            <strong>Спрашивать всё</strong> — подтверждение перед каждой записью/командой.{' '}
            <strong>Принимать правки</strong> — файлы без вопросов, команды с подтверждением.{' '}
            <strong>Без подтверждений</strong> — агент действует сам.
          </div>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.clarifyMode === true}
              onChange={(e) => onSettingsChange({ clarifyMode: e.target.checked })}
            />
            <span>
              <strong>Уточняющие вопросы</strong> — при неоднозначной задаче агент сначала
              задаёт вопросы, а потом приступает
            </span>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.deepReasoning === true}
              onChange={(e) => onSettingsChange({ deepReasoning: e.target.checked })}
            />
            <span>
              <strong>Глубокое рассуждение</strong> — для think-моделей (qwen3, deepseek-r1,
              qwq) включает режим рассуждения, для остальных усиливает промпт. Точнее, но
              медленнее
            </span>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.autoPushSelfEdits !== false}
              onChange={(e) => onSettingsChange({ autoPushSelfEdits: e.target.checked })}
            />
            <span>
              <strong>Автокоммит самоправок</strong> — когда агент меняет свой код, после
              задачи автоматически <code>git commit</code> + <code>push</code> на GitHub
              (чтобы правки не терялись при синхронизации на старте)
            </span>
          </label>

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
                onSettingsChange({ maxRunsPerHour: Number(e.target.value) || DEFAULT_MAX_RUNS_PER_HOUR })
              }
            />
          </label>

          <MemoryPanel
            projectPath={chatProjectPath}
            selfLearning={settings.selfLearning !== false}
            onSelfLearningChange={onSelfLearningChange}
            refreshKey={memoryRefreshKey}
          />

          <SkillsPanel projectPath={chatProjectPath} refreshKey={skillsRefreshKey} />
        </div>

        {!ollamaOnline && (
          <div className="hint">
            Ollama не отвечает. Установи с <strong>ollama.com</strong>, запусти приложение Ollama
            и нажми «Обновить Ollama» в верхней панели.
          </div>
        )}

        <div className="settings-about">
          <span className="settings-about-version">CodeViper v{__APP_VERSION__}</span>
          <a
            className="settings-about-link"
            href="https://github.com/rkfsociety/CodeViper/issues"
            target="_blank"
            rel="noreferrer"
          >
            Сообщить об ошибке
          </a>
          <a
            className="settings-about-link"
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
