import { useEffect, useMemo, useState } from 'react'
import styles from './SettingsModal.module.css'
import type { AgentSettings, BenchmarkResult, OllamaModel } from '../../types'
import {
  CUSTOM_API_BASE_URL,
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_MODEL_DEFAULT,
  GEMINI_API_BASE_URL,
  GEMINI_MODEL_DEFAULT,
  GEMINI_FREE_MODELS,
  LITEROUTER_API_BASE_URL,
  LITEROUTER_MODEL_DEFAULT,
  filterLiteRouterModelsByTier,
  filterOpenRouterModelsByTier,
  ORCHESTRATOR_DEFAULT_OLLAMA_MODEL
} from '../../../shared/constants'
import { isOrchestratorConfigured, resolveOrchestratorBackend } from '../../../shared/orchestrator'
import {
  filterOrchestratorCloudModels,
  isCloudModelProvider,
  orchestratorCloudProviderLabel,
  resolveOrchestratorCloudModel
} from '../../../shared/orchestratorCloud'
import { ModelPanel } from '../ModelPanel'
import { CloudModelSelector } from '../CloudModelSelector'
import { SettingItem } from './shared'
import type { useOllamaDownloadQueue } from '../../hooks/useOllamaDownloadQueue'

type DownloadQueue = ReturnType<typeof useOllamaDownloadQueue>

interface Props {
  isActive: boolean
  isSearching: boolean
  settings: AgentSettings
  ollamaOnline: boolean
  models: OllamaModel[]
  downloadQueue: DownloadQueue
  onSettingsChange: (patch: Partial<AgentSettings>) => void
  onRefreshOllama: () => Promise<void>
}

export function ModelTab({
  isActive,
  isSearching,
  settings,
  ollamaOnline,
  models,
  downloadQueue,
  onSettingsChange,
  onRefreshOllama
}: Props) {
  const [apiKeyVisible, setApiKeyVisible] = useState<Record<string, boolean>>({})
  const [pingState, setPingState] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle')
  const [benchRunning, setBenchRunning] = useState(false)
  const [benchResult, setBenchResult] = useState<BenchmarkResult | null>(null)
  const [ggufDownloading, setGgufDownloading] = useState(false)
  const [ggufDownloadPct, setGgufDownloadPct] = useState(0)
  const [ggufDownloadLabel, setGgufDownloadLabel] = useState('')

  useEffect(() => {
    return window.codeviper.onGgufDownloadProgress((p) => {
      if (!p) {
        setGgufDownloading(false)
        return
      }
      setGgufDownloading(true)
      const pct = p.total > 0 ? Math.round((p.downloaded / p.total) * 100) : 0
      const mb = (p.downloaded / 1_048_576).toFixed(1)
      const totalMb = p.total > 0 ? ` / ${(p.total / 1_048_576).toFixed(0)} МБ` : ''
      setGgufDownloadPct(pct)
      setGgufDownloadLabel(`${mb}${totalMb} МБ  ${pct}%`)
    })
  }, [])

  const provider = settings.modelProvider ?? 'ollama'
  const showDeprecatedLiteRouterTierInDeepseek = false

  const selectorModels = useMemo(() => {
    if (provider === 'literouter') {
      return filterLiteRouterModelsByTier(models, settings.literouterTier ?? 'free')
    }
    if (provider === 'openrouter') {
      return filterOpenRouterModelsByTier(models, settings.openrouterTier ?? 'free')
    }
    return models
  }, [provider, models, settings.literouterTier, settings.openrouterTier])

  const orchestratorCloudModels = useMemo(
    () => filterOrchestratorCloudModels(settings, models),
    [settings, models]
  )

  const orchestratorBackend = resolveOrchestratorBackend(settings)
  const cloudProvider = isCloudModelProvider(provider)

  if (!isActive && !isSearching) return null

  function orchestratorCloudModelPatch(
    tierModels: OllamaModel[]
  ): Partial<AgentSettings> | undefined {
    if (orchestratorBackend !== 'cloud') return undefined
    const current = settings.orchestratorCloudModel
    const valid = current && tierModels.some((m) => m.name === current)
    if (valid) return undefined
    const next = tierModels[0]?.name ?? resolveOrchestratorCloudModel(settings, tierModels)
    return next ? { orchestratorCloudModel: next } : undefined
  }

  function selectOrchestratorCloudBackend() {
    const nextModel = resolveOrchestratorCloudModel(settings, orchestratorCloudModels)
    onSettingsChange({
      orchestratorBackend: 'cloud',
      ...(nextModel ? { orchestratorCloudModel: nextModel } : {})
    })
  }

  function pickLiteRouterTier(tier: 'free' | 'paid') {
    const filtered = filterLiteRouterModelsByTier(models, tier)
    const fallbackModel = tier === 'free' ? LITEROUTER_MODEL_DEFAULT : settings.model
    const currentValid = filtered.some((m) => m.name === settings.model)
    const nextModel = currentValid ? settings.model : (filtered[0]?.name ?? fallbackModel)
    const selected = filtered.find((m) => m.name === nextModel)
    onSettingsChange({
      literouterTier: tier,
      model: nextModel,
      ...(selected?.contextLength ? { modelContextLength: selected.contextLength } : {}),
      ...orchestratorCloudModelPatch(filtered)
    })
  }

  function pickOpenRouterTier(tier: 'free' | 'paid') {
    const filtered = filterOpenRouterModelsByTier(models, tier)
    const currentValid = filtered.some((m) => m.name === settings.model)
    onSettingsChange({
      openrouterTier: tier,
      model: currentValid ? settings.model : (filtered[0]?.name ?? settings.model),
      ...(filtered[0]?.contextLength ? { modelContextLength: filtered[0].contextLength } : {}),
      ...orchestratorCloudModelPatch(filtered)
    })
  }

  function toggleKeyVisible(key: string) {
    setApiKeyVisible((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  async function handlePing() {
    setPingState('checking')
    try {
      let ok: boolean
      if (provider === 'ollama') {
        ok = await window.codeviper.checkOllama(settings.ollamaUrl)
      } else if (provider === 'literouter') {
        ok = await window.codeviper.pingProvider({
          type: 'literouter',
          baseUrl: settings.literouterBaseUrl || LITEROUTER_API_BASE_URL,
          apiKey: settings.literouterApiKey,
          model: settings.model
        })
      } else if (provider === 'custom') {
        ok = await window.codeviper.pingProvider({
          type: 'custom',
          baseUrl: settings.customBaseUrl || CUSTOM_API_BASE_URL,
          apiKey: settings.customApiKey,
          model: settings.model
        })
      } else {
        ok = await window.codeviper.checkOllama(undefined)
      }
      setPingState(ok ? 'ok' : 'fail')
    } catch {
      setPingState('fail')
    }
    setTimeout(() => setPingState('idle'), 3000)
  }

  async function handleBenchmark() {
    if (!settings.model || benchRunning) return
    setBenchRunning(true)
    setBenchResult(null)
    try {
      const result = await window.codeviper.benchmarkModel(settings.ollamaUrl, settings.model)
      setBenchResult(result)
    } catch (e) {
      setBenchResult({
        model: settings.model,
        runs: [],
        avgLatencyMs: 0,
        avgTps: 0,
        toolCallOk: false,
        error: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setBenchRunning(false)
    }
  }

  async function handleDownloadGguf() {
    setGgufDownloading(true)
    try {
      const path = await window.codeviper.downloadGguf()
      onSettingsChange({ orchestratorModelPath: path })
    } catch {
      // отменено или ошибка сети
    } finally {
      setGgufDownloading(false)
      setGgufDownloadPct(0)
      setGgufDownloadLabel('')
    }
  }

  function handleProviderChange(
    newProvider:
      | 'ollama'
      | 'deepseek'
      | 'literouter'
      | 'openai'
      | 'openrouter'
      | 'gemini'
      | 'anthropic'
      | 'groq'
      | 'together'
      | 'custom'
  ) {
    const patch: Partial<AgentSettings> = { modelProvider: newProvider }
    if (newProvider === 'deepseek') {
      if (!settings.providerApiKey) patch.providerApiKey = ''
      if (!/^deepseek/i.test(settings.model || '')) {
        patch.model = DEEPSEEK_MODEL_DEFAULT
      }
    }
    if (newProvider === 'gemini' && !/^gemini/i.test(settings.model || '')) {
      patch.model = GEMINI_MODEL_DEFAULT
    }
    if (newProvider === 'literouter') {
      if (!settings.literouterBaseUrl?.trim()) patch.literouterBaseUrl = LITEROUTER_API_BASE_URL
      patch.literouterTier = settings.literouterTier ?? 'free'
      if (!(settings.model || '').trim()) patch.model = LITEROUTER_MODEL_DEFAULT
    }
    if (newProvider === 'anthropic' && !/^claude/i.test(settings.model || '')) {
      patch.model = 'claude-3-5-sonnet-20241022'
    }
    if (newProvider === 'custom' && !settings.customBaseUrl?.trim()) {
      patch.customBaseUrl = CUSTOM_API_BASE_URL
    }
    onSettingsChange(patch)
  }

  const pingIcon =
    pingState === 'checking' ? '⏳' : pingState === 'ok' ? '✅' : pingState === 'fail' ? '❌' : '🔌'

  return (
    <>
      {/* ── Провайдер моделей ── */}
      <SettingItem
        tab="model"
        label="Провайдер моделей"
        desc="ollama deepseek literouter gemini anthropic openai openrouter groq together provider api"
      >
        <label>
          Провайдер моделей
          <select
            value={provider}
            onChange={(e) =>
              handleProviderChange(
                e.target.value as
                  | 'ollama'
                  | 'deepseek'
                  | 'literouter'
                  | 'openai'
                  | 'openrouter'
                  | 'gemini'
                  | 'anthropic'
                  | 'groq'
                  | 'together'
                  | 'custom'
              )
            }
          >
            <option value="ollama">Ollama (локально)</option>
            <option value="anthropic">Claude (Anthropic API)</option>
            <option value="deepseek">DeepSeek API</option>
            <option value="literouter">LiteRouter</option>
            <option value="gemini">Gemini API</option>
            <option value="openai">OpenAI-совместимый API</option>
            <option value="custom">Custom endpoint (LM Studio, vLLM)</option>
            <option value="openrouter">OpenRouter</option>
            <option value="groq">Groq API</option>
            <option value="together">Together AI</option>
          </select>
        </label>
      </SettingItem>

      {provider === 'ollama' && (
        <SettingItem tab="model" label="Ollama URL" desc="ollama адрес url сервер">
          <label>
            Ollama URL
            <input
              value={settings.ollamaUrl}
              onChange={(e) => onSettingsChange({ ollamaUrl: e.target.value })}
              onBlur={() => void onRefreshOllama()}
            />
          </label>
        </SettingItem>
      )}

      {provider === 'deepseek' && (
        <SettingItem tab="model" label="DeepSeek API ключ" desc="deepseek api key ключ sk-">
          <>
            <div className={styles.hint}>
              Используется <strong>DeepSeek API</strong> — OpenAI-совместимый облачный API. Базовый
              URL: <code>{DEEPSEEK_API_BASE_URL}</code>, модель по умолчанию:{' '}
              <code>{DEEPSEEK_MODEL_DEFAULT}</code>.
            </div>
            {showDeprecatedLiteRouterTierInDeepseek && (
              <>
                <div className={styles.geminiTierRow}>
                  <button
                    type="button"
                    className={`btn${(settings.literouterTier ?? 'free') === 'free' ? ' active' : ''}`}
                    onClick={() => pickLiteRouterTier('free')}
                  >
                    Бесплатный
                  </button>
                  <button
                    type="button"
                    className={`btn${(settings.literouterTier ?? 'free') === 'paid' ? ' active' : ''}`}
                    onClick={() => pickLiteRouterTier('paid')}
                  >
                    Платный
                  </button>
                </div>
                <div className={styles.hint}>
                  Бесплатный режим показывает только модели с суффиксом <code>:free</code>.
                </div>
              </>
            )}
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
                  {pingIcon}
                </button>
              </div>
            </label>
          </>
        </SettingItem>
      )}

      {provider === 'literouter' && (
        <SettingItem
          tab="model"
          label="LiteRouter API ключ"
          desc="literouter api key openai compatible proxy deepseek free mistral free llama free"
        >
          <>
            <div className={styles.hint}>
              <strong>LiteRouter</strong> использует OpenAI-совместимый proxy. Базовый URL:{' '}
              <code>{LITEROUTER_API_BASE_URL}</code>, модель по умолчанию:{' '}
              <code>{LITEROUTER_MODEL_DEFAULT}</code>.
            </div>
            <div className={styles.geminiTierRow}>
              <button
                type="button"
                className={`btn${(settings.literouterTier ?? 'free') === 'free' ? ' active' : ''}`}
                onClick={() => pickLiteRouterTier('free')}
              >
                Бесплатный
              </button>
              <button
                type="button"
                className={`btn${(settings.literouterTier ?? 'free') === 'paid' ? ' active' : ''}`}
                onClick={() => pickLiteRouterTier('paid')}
              >
                Платный
              </button>
            </div>
            <div className={styles.hint}>
              Бесплатный режим показывает только модели с суффиксом <code>:free</code>.
            </div>
            <label>
              API базовый URL
              <input
                placeholder={LITEROUTER_API_BASE_URL}
                value={settings.literouterBaseUrl ?? ''}
                onChange={(e) => onSettingsChange({ literouterBaseUrl: e.target.value })}
                onBlur={() => void onRefreshOllama()}
              />
            </label>
            <label>
              LiteRouter API ключ
              <div className="settings-api-key-row">
                <input
                  type={apiKeyVisible['literouter'] ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={settings.literouterApiKey ?? ''}
                  onChange={(e) => onSettingsChange({ literouterApiKey: e.target.value })}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => toggleKeyVisible('literouter')}
                  title={apiKeyVisible['literouter'] ? 'Скрыть' : 'Показать'}
                >
                  {apiKeyVisible['literouter'] ? '🙈' : '👁'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void handlePing()}
                  disabled={pingState === 'checking' || !settings.literouterApiKey}
                  title="Проверить подключение"
                >
                  {pingIcon}
                </button>
              </div>
            </label>
          </>
        </SettingItem>
      )}

      {provider === 'gemini' &&
        (() => {
          const tier = settings.geminiTier ?? 'free'
          const isFree = tier === 'free'
          const currentFreeModel =
            GEMINI_FREE_MODELS.find((m) => m.id === settings.model) ?? GEMINI_FREE_MODELS[0]
          return (
            <SettingItem
              tab="model"
              label="Gemini API ключ"
              desc="gemini google api key бесплатный платный rpm tpm free paid AIza модель"
            >
              <>
                <div className={styles.hint}>
                  Используется <strong>Gemini API</strong> через <code>{GEMINI_API_BASE_URL}</code>.
                </div>

                <div className={styles.geminiTierRow}>
                  <button
                    type="button"
                    className={`btn${isFree ? ' active' : ''}`}
                    onClick={() => {
                      const first = GEMINI_FREE_MODELS[0]
                      const freeGeminiModels = filterOrchestratorCloudModels(
                        { ...settings, geminiTier: 'free' },
                        models
                      )
                      onSettingsChange({
                        geminiTier: 'free',
                        model: first.id,
                        geminiRpm: first.rpm,
                        ...orchestratorCloudModelPatch(freeGeminiModels)
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
                        model: settings.model || GEMINI_MODEL_DEFAULT,
                        ...orchestratorCloudModelPatch(models)
                      })
                    }
                  >
                    Платный
                  </button>
                </div>

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
                      {pingIcon}
                    </button>
                  </div>
                </label>

                {isFree ? (
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
                      RPM: <strong>{currentFreeModel.rpm}</strong> · RPD:{' '}
                      <strong>
                        {'rpd' in currentFreeModel && currentFreeModel.rpd != null
                          ? currentFreeModel.rpd
                          : '∞'}
                      </strong>{' '}
                      · TPM:{' '}
                      <strong>
                        {currentFreeModel.tpm != null
                          ? `${(currentFreeModel.tpm / 1000).toFixed(0)}K`
                          : '∞'}
                      </strong>{' '}
                      — лимиты фиксированы для бесплатного уровня.
                    </span>
                  </label>
                ) : (
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
                )}
              </>
            </SettingItem>
          )
        })()}

      {provider === 'anthropic' && (
        <SettingItem tab="model" label="Claude API ключ" desc="anthropic claude api key sk-ant-">
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
                  {pingIcon}
                </button>
              </div>
            </label>
          </>
        </SettingItem>
      )}

      {provider === 'openai' && (
        <SettingItem
          tab="model"
          label="OpenAI API ключ базовый URL"
          desc="openai api key sk- базовый url compatible совместимый"
        >
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
                  {pingIcon}
                </button>
              </div>
            </label>
          </>
        </SettingItem>
      )}

      {provider === 'custom' && (
        <SettingItem
          tab="model"
          label="Custom OpenAI endpoint"
          desc="custom lm studio vllm локальный openai compatible base url api key model id"
        >
          <>
            <div className={styles.hint}>
              Локальный или произвольный <strong>OpenAI-совместимый</strong> сервер (LM Studio,
              vLLM, llama.cpp server). Базовый URL по умолчанию: <code>{CUSTOM_API_BASE_URL}</code>.
            </div>
            <label>
              API базовый URL
              <input
                placeholder={CUSTOM_API_BASE_URL}
                value={settings.customBaseUrl ?? ''}
                onChange={(e) => onSettingsChange({ customBaseUrl: e.target.value })}
                onBlur={() => void onRefreshOllama()}
              />
            </label>
            <label>
              API ключ (опционально)
              <div className="settings-api-key-row">
                <input
                  type={apiKeyVisible['custom'] ? 'text' : 'password'}
                  placeholder="lm-studio или пусто"
                  value={settings.customApiKey ?? ''}
                  onChange={(e) => onSettingsChange({ customApiKey: e.target.value })}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => toggleKeyVisible('custom')}
                  title={apiKeyVisible['custom'] ? 'Скрыть' : 'Показать'}
                >
                  {apiKeyVisible['custom'] ? '🙈' : '👁'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void handlePing()}
                  disabled={pingState === 'checking'}
                  title="Проверить подключение (/models)"
                >
                  {pingIcon}
                </button>
              </div>
            </label>
            <label>
              ID модели
              <input
                placeholder="local-model"
                value={settings.model}
                onChange={(e) => onSettingsChange({ model: e.target.value })}
              />
              <span className={styles.hint}>
                Точное имя модели с сервера (как в LM Studio / vLLM). Список ниже загружается после
                ping.
              </span>
            </label>
          </>
        </SettingItem>
      )}

      {provider === 'openrouter' &&
        (() => {
          const tier = settings.openrouterTier ?? 'free'
          const isFree = tier === 'free'
          return (
            <SettingItem
              tab="model"
              label="OpenRouter API ключ"
              desc="openrouter api key sk-or- агрегатор gpt claude llama gemini free paid бесплатный платный"
            >
              <>
                <div className={styles.hint}>
                  <strong>OpenRouter</strong> — агрегатор моделей (GPT-4o, Claude, Gemini, Llama и
                  др.). Базовый URL: <code>https://openrouter.ai/api/v1</code>. Получить ключ:{' '}
                  <strong>openrouter.ai/keys</strong>
                </div>

                <div className={styles.geminiTierRow}>
                  <button
                    type="button"
                    className={`btn${isFree ? ' active' : ''}`}
                    onClick={() => pickOpenRouterTier('free')}
                  >
                    Бесплатный
                  </button>
                  <button
                    type="button"
                    className={`btn${!isFree ? ' active' : ''}`}
                    onClick={() => pickOpenRouterTier('paid')}
                  >
                    Платный
                  </button>
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
                      {pingIcon}
                    </button>
                  </div>
                </label>

                <span className={styles.hint}>
                  {isFree
                    ? 'Бесплатные модели помечены суффиксом :free в каталоге OpenRouter.'
                    : 'Платные модели — без суффикса :free; список загружается после ввода ключа.'}
                </span>
              </>
            </SettingItem>
          )
        })()}

      {provider === 'groq' && (
        <SettingItem
          tab="model"
          label="Groq API ключ"
          desc="groq api key gsk_ lpu быстрый инференс"
        >
          <>
            <div className={styles.hint}>
              <strong>Groq API</strong> — сверхбыстрый инференс (LPU). Модель по умолчанию:{' '}
              <code>llama3-8b-8192</code>. Получить ключ: <strong>console.groq.com/keys</strong>
            </div>
            <label>
              Groq API ключ
              <div className="settings-api-key-row">
                <input
                  type={apiKeyVisible['groq'] ? 'text' : 'password'}
                  placeholder="gsk_..."
                  value={settings.groqApiKey ?? ''}
                  onChange={(e) => onSettingsChange({ groqApiKey: e.target.value })}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => toggleKeyVisible('groq')}
                  title={apiKeyVisible['groq'] ? 'Скрыть' : 'Показать'}
                >
                  {apiKeyVisible['groq'] ? '🙈' : '👁'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void handlePing()}
                  disabled={pingState === 'checking' || !settings.groqApiKey}
                  title="Проверить подключение"
                >
                  {pingIcon}
                </button>
              </div>
            </label>
          </>
        </SettingItem>
      )}

      {provider === 'together' && (
        <SettingItem
          tab="model"
          label="Together AI API ключ"
          desc="together ai api key облачный llama"
        >
          <>
            <div className={styles.hint}>
              <strong>Together AI</strong> — облачный инференс с OpenAI-совместимым API. Модель по
              умолчанию: <code>meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo</code>. Получить ключ:{' '}
              <strong>api.together.ai/settings/api-keys</strong>
            </div>
            <label>
              Together AI API ключ
              <div className="settings-api-key-row">
                <input
                  type={apiKeyVisible['together'] ? 'text' : 'password'}
                  placeholder="..."
                  value={settings.togetherApiKey ?? ''}
                  onChange={(e) => onSettingsChange({ togetherApiKey: e.target.value })}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => toggleKeyVisible('together')}
                  title={apiKeyVisible['together'] ? 'Скрыть' : 'Показать'}
                >
                  {apiKeyVisible['together'] ? '🙈' : '👁'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void handlePing()}
                  disabled={pingState === 'checking' || !settings.togetherApiKey}
                  title="Проверить подключение"
                >
                  {pingIcon}
                </button>
              </div>
            </label>
          </>
        </SettingItem>
      )}

      {settings.modelProvider === 'ollama' && (
        <SettingItem
          tab="model"
          label="Автовыбор модели"
          desc="auto model автоматический выбор ram задача"
        >
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.autoModel !== false}
              onChange={(e) => onSettingsChange({ autoModel: e.target.checked })}
            />
            <span>
              <strong>Автовыбор модели</strong> — подбирать модель под задачу, выгружать другие из
              RAM (если установлено несколько)
            </span>
          </label>
        </SettingItem>
      )}

      {settings.modelProvider === 'ollama' && (
        <SettingItem
          tab="model"
          label="Модель для суммаризации"
          desc="summarize model суммаризация сжатие лёгкая"
        >
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
              Сжатие длинной истории чата при достижении порога. По умолчанию берётся самая лёгкая
              модель в Ollama — быстрее и не отвлекает основную модель агента.
            </div>
          </>
        </SettingItem>
      )}

      <SettingItem
        tab="model"
        label="Порог суммаризации"
        desc="threshold сжатие контекст компрессия summarize percentage экономичный сбалансированный качество"
      >
        <label>
          Порог суммаризации:{' '}
          <strong>
            {settings.aggressiveCompression ? 65 : (settings.contextSummarizeThreshold ?? 85)}%
          </strong>
          <div
            style={{ display: 'flex', gap: '0.5em', marginBottom: '0.5em', marginTop: '0.35em' }}
          >
            {(
              [
                { label: 'Экономичный', value: 55 },
                { label: 'Сбалансированный', value: 70 },
                { label: 'Качество', value: 85 }
              ] as { label: string; value: number }[]
            ).map((preset) => {
              const current = settings.aggressiveCompression
                ? 65
                : (settings.contextSummarizeThreshold ?? 85)
              const active = !settings.aggressiveCompression && current === preset.value
              return (
                <button
                  key={preset.value}
                  type="button"
                  disabled={settings.aggressiveCompression === true}
                  onClick={() =>
                    onSettingsChange({
                      aggressiveCompression: false,
                      contextSummarizeThreshold: preset.value
                    })
                  }
                  style={{
                    flex: 1,
                    padding: '0.25em 0.4em',
                    fontSize: '0.78em',
                    cursor: settings.aggressiveCompression ? 'not-allowed' : 'pointer',
                    borderRadius: '4px',
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: active ? 'var(--bg)' : 'var(--text)',
                    opacity: settings.aggressiveCompression ? 0.4 : 1
                  }}
                >
                  {preset.label}
                  <br />
                  <span style={{ opacity: 0.7 }}>{preset.value}%</span>
                </button>
              )
            })}
          </div>
          <input
            type="range"
            min={50}
            max={85}
            step={5}
            disabled={settings.aggressiveCompression === true}
            value={settings.aggressiveCompression ? 65 : (settings.contextSummarizeThreshold ?? 85)}
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
              Суммаризировать при 65% заполнения контекста — экономия 30–40% на длинных диалогах;
              перекрывает слайдер выше
            </span>
          </span>
        </label>
      </SettingItem>

      {/* ── Второй провайдер (дополнительно) ── */}
      <SettingItem
        tab="model"
        label="Облачный API"
        desc="cloud provider dual deepseek gemini openai openrouter суммаризация облако дополнительный"
      >
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
                        'deepseek' | 'openai' | 'openrouter' | 'gemini'
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

              {(() => {
                const cp = settings.cloudProvider ?? 'deepseek'
                const keyField =
                  cp === 'deepseek'
                    ? ('deepseekApiKey' as const)
                    : cp === 'gemini'
                      ? ('geminiApiKey' as const)
                      : cp === 'openrouter'
                        ? ('openrouterApiKey' as const)
                        : ('openaiApiKey' as const)
                const keyLabel =
                  cp === 'deepseek'
                    ? 'DeepSeek API ключ'
                    : cp === 'gemini'
                      ? 'Gemini API ключ'
                      : cp === 'openrouter'
                        ? 'OpenRouter API ключ'
                        : 'OpenAI API ключ'
                return (
                  <label>
                    {keyLabel}
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={settings[keyField] ?? ''}
                      onChange={(e) => onSettingsChange({ [keyField]: e.target.value })}
                      autoComplete="off"
                    />
                  </label>
                )
              })()}

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
      </SettingItem>

      {/* Non-searchable: ModelPanel, benchmark, orchestrator, update channel, explorer */}
      {isActive && !isSearching && (
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
          ) : provider === 'gemini' && (settings.geminiTier ?? 'free') === 'free' ? null : (
            <CloudModelSelector
              provider={provider}
              model={settings.model}
              defaultModel={
                provider === 'deepseek'
                  ? DEEPSEEK_MODEL_DEFAULT
                  : provider === 'literouter'
                    ? LITEROUTER_MODEL_DEFAULT
                    : ''
              }
              models={selectorModels}
              onChange={(model, contextLength) =>
                onSettingsChange({
                  model,
                  ...(contextLength ? { modelContextLength: contextLength } : {})
                })
              }
            />
          )}

          {provider === 'ollama' && settings.model && (
            <div className={styles.section} style={{ marginTop: 12 }}>
              <div className={styles.sectionLabel}>Бенчмарк модели</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void handleBenchmark()}
                  disabled={benchRunning}
                >
                  {benchRunning ? 'Тестирую…' : 'Запустить бенчмарк'}
                </button>
                {benchRunning && (
                  <span style={{ fontSize: 12, opacity: 0.6 }}>3 прогона + tool call</span>
                )}
              </div>
              {benchResult &&
                (benchResult.error ? (
                  <div style={{ color: 'var(--color-error, #e05)', fontSize: 12 }}>
                    Ошибка: {benchResult.error}
                  </div>
                ) : (
                  <div style={{ fontSize: 12 }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 6 }}>
                      <thead>
                        <tr style={{ opacity: 0.6 }}>
                          <th style={{ textAlign: 'left', paddingRight: 12, fontWeight: 'normal' }}>
                            Прогон
                          </th>
                          <th
                            style={{ textAlign: 'right', paddingRight: 12, fontWeight: 'normal' }}
                          >
                            Токены
                          </th>
                          <th
                            style={{ textAlign: 'right', paddingRight: 12, fontWeight: 'normal' }}
                          >
                            tok/s
                          </th>
                          <th style={{ textAlign: 'right', fontWeight: 'normal' }}>Задержка</th>
                        </tr>
                      </thead>
                      <tbody>
                        {benchResult.runs.map((r, i) => (
                          <tr key={i}>
                            <td style={{ paddingRight: 12 }}>#{i + 1}</td>
                            <td style={{ textAlign: 'right', paddingRight: 12 }}>{r.tokens}</td>
                            <td style={{ textAlign: 'right', paddingRight: 12 }}>{r.tps}</td>
                            <td style={{ textAlign: 'right' }}>{r.latencyMs} мс</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: 'flex', gap: 16, opacity: 0.8 }}>
                      <span>
                        Среднее: <b>{benchResult.avgTps} tok/s</b>
                      </span>
                      <span>
                        Задержка: <b>{benchResult.avgLatencyMs} мс</b>
                      </span>
                      <span>
                        Tool call: <b>{benchResult.toolCallOk ? '✓' : '✗'}</b>
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* ── Оркестратор ── */}
          <div className={styles.section} style={{ marginTop: 12 }}>
            <div className={styles.sectionLabel}>Оркестратор (предпланирование)</div>

            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={settings.orchestratorEnabled === true}
                onChange={(e) => onSettingsChange({ orchestratorEnabled: e.target.checked })}
              />
              <span className={styles.track} aria-hidden="true"></span>
              <span className={styles.label}>Включить оркестратор</span>
            </label>
            <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
              Строит краткий план и помечает сложные задачи. Исходный запрос пользователя не
              изменяется. Без этого тумблера «Сначала показать план» (вкладка «Агент») использует
              основную модель агента.
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
              {cloudProvider && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <input
                    type="radio"
                    name="orchestrator-backend"
                    checked={orchestratorBackend === 'cloud'}
                    onChange={selectOrchestratorCloudBackend}
                  />
                  {orchestratorCloudProviderLabel(provider)} (текущий провайдер)
                </label>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input
                  type="radio"
                  name="orchestrator-backend"
                  checked={orchestratorBackend === 'ollama'}
                  onChange={() => onSettingsChange({ orchestratorBackend: 'ollama' })}
                />
                Ollama (локально)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input
                  type="radio"
                  name="orchestrator-backend"
                  checked={orchestratorBackend === 'gguf'}
                  onChange={() => onSettingsChange({ orchestratorBackend: 'gguf' })}
                />
                GGUF (node-llama-cpp)
              </label>
            </div>

            {orchestratorBackend === 'cloud' && cloudProvider ? (
              <div style={{ marginTop: 8 }}>
                <CloudModelSelector
                  provider={provider}
                  model={
                    settings.orchestratorCloudModel ??
                    resolveOrchestratorCloudModel(settings, orchestratorCloudModels)
                  }
                  defaultModel={resolveOrchestratorCloudModel(settings, orchestratorCloudModels)}
                  models={orchestratorCloudModels}
                  onChange={(modelId) => onSettingsChange({ orchestratorCloudModel: modelId })}
                />
                <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
                  {provider === 'literouter' &&
                    (settings.literouterTier ?? 'free') === 'free' &&
                    'Только модели с суффиксом :free (режим Free).'}
                  {provider === 'openrouter' &&
                    (settings.openrouterTier ?? 'free') === 'free' &&
                    'Только бесплатные модели каталога OpenRouter.'}
                  {provider === 'gemini' &&
                    (settings.geminiTier ?? 'free') === 'free' &&
                    'Только модели бесплатного tier Gemini.'}
                </div>
              </div>
            ) : orchestratorBackend === 'ollama' ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>
                    Модель Ollama
                  </span>
                  <input
                    type="text"
                    className="input input-sm"
                    style={{ flex: 1, minWidth: 120 }}
                    placeholder={ORCHESTRATOR_DEFAULT_OLLAMA_MODEL}
                    value={settings.orchestratorOllamaModel ?? ''}
                    onChange={(e) => onSettingsChange({ orchestratorOllamaModel: e.target.value })}
                  />
                </div>
                <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
                  URL: {settings.ollamaUrl}. По умолчанию {ORCHESTRATOR_DEFAULT_OLLAMA_MODEL}.
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      opacity: settings.orchestratorModelPath ? 1 : 0.45
                    }}
                    title={settings.orchestratorModelPath}
                  >
                    {settings.orchestratorModelPath
                      ? settings.orchestratorModelPath.split(/[/\\]/).pop()
                      : 'Файл не выбран'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      void window.codeviper.selectGgufFile().then((path) => {
                        if (path) onSettingsChange({ orchestratorModelPath: path })
                      })
                    }
                  >
                    Выбрать файл…
                  </button>
                  {settings.orchestratorModelPath && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ opacity: 0.6, color: 'var(--red, #e05555)' }}
                      onClick={() => {
                        const path = settings.orchestratorModelPath!
                        void window.codeviper
                          .deleteGgufFile(path)
                          .catch(() => undefined)
                          .then(() => onSettingsChange({ orchestratorModelPath: '' }))
                      }}
                      title="Удалить файл модели с диска"
                    >
                      Удалить модель
                    </button>
                  )}
                </div>
                {ggufDownloading ? (
                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 999,
                        background: 'var(--bg-element)',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${ggufDownloadPct}%`,
                          background: 'var(--green, #4caf7d)',
                          transition: 'width 0.2s'
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 4
                      }}
                    >
                      <span style={{ fontSize: 11, opacity: 0.65 }}>{ggufDownloadLabel}</span>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ opacity: 0.7 }}
                        onClick={() => window.codeviper.cancelGgufDownload()}
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  !settings.orchestratorModelPath && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ marginTop: 6 }}
                      onClick={() => void handleDownloadGguf()}
                    >
                      Скачать Qwen2.5-1.5B (~970 МБ)
                    </button>
                  )
                )}
              </>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0 }}>
                Мин. длина сообщения
              </span>
              <input
                type="number"
                min={10}
                max={500}
                step={10}
                value={settings.orchestratorMinMessageLength ?? 80}
                onChange={(e) =>
                  onSettingsChange({
                    orchestratorMinMessageLength: Math.max(10, parseInt(e.target.value, 10) || 80)
                  })
                }
                style={{ width: 64 }}
                className="input input-sm"
              />
              <span style={{ fontSize: 11, opacity: 0.55 }}>символов</span>
            </div>

            {settings.orchestratorEnabled && !isOrchestratorConfigured(settings) && (
              <div style={{ fontSize: 11, color: 'var(--red, #e05555)', marginTop: 6 }}>
                {resolveOrchestratorBackend(settings) === 'ollama'
                  ? 'Укажите модель Ollama или включите Ollama на этой машине.'
                  : 'Выберите или скачайте GGUF-файл.'}
              </div>
            )}
          </div>

          {/* ── Explorer субагент ── */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>Explorer субагент</div>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={settings.explorerEnabled === true}
                onChange={(e) => onSettingsChange({ explorerEnabled: e.target.checked })}
              />
              Разведка перед сложными задачами
            </label>
            <div style={{ fontSize: 11, opacity: 0.55, marginTop: 4 }}>
              При сложном запросе субагент-разведчик изучит проект и добавит сводку в контекст.
              Замедляет старт, улучшает качество ответа.
            </div>
          </div>
        </>
      )}
    </>
  )
}
