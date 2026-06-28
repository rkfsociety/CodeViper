import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentSettings, OllamaModel } from '../types'
import { useModalA11y } from '../hooks/useModalA11y'
import { CloudModelSelector } from './CloudModelSelector'
import {
  CODEVIPER_GITHUB_CLONE_URL,
  DEEPSEEK_MODEL_DEFAULT,
  filterOpenRouterModelsByTier,
  GEMINI_MODEL_DEFAULT
} from '../../shared/constants'
import styles from './OnboardingWizard.module.css'

type ModelProvider = NonNullable<AgentSettings['modelProvider']>

const PROVIDERS: { value: ModelProvider; label: string }[] = [
  { value: 'ollama', label: 'Ollama (локально)' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'gemini', label: 'Gemini API' },
  { value: 'deepseek', label: 'DeepSeek API' },
  { value: 'anthropic', label: 'Claude (Anthropic)' },
  { value: 'openai', label: 'OpenAI-совместимый API' },
  { value: 'groq', label: 'Groq API' },
  { value: 'together', label: 'Together AI' }
]

const STEP_LABELS = ['Провайдер', 'Модель', 'Проект'] as const

const EXAMPLE_PROMPTS_URL = `${CODEVIPER_GITHUB_CLONE_URL}/blob/master/docs/example-prompts.md`

function defaultModelForProvider(provider: ModelProvider): string {
  switch (provider) {
    case 'deepseek':
      return DEEPSEEK_MODEL_DEFAULT
    case 'gemini':
      return GEMINI_MODEL_DEFAULT
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022'
    default:
      return ''
  }
}

function applyProviderPatch(draft: AgentSettings, provider: ModelProvider): Partial<AgentSettings> {
  const patch: Partial<AgentSettings> = { modelProvider: provider }
  const model = draft.model ?? ''
  if (provider === 'deepseek' && !/^deepseek/i.test(model)) {
    patch.model = DEEPSEEK_MODEL_DEFAULT
  }
  if (provider === 'gemini' && !/^gemini/i.test(model)) {
    patch.model = GEMINI_MODEL_DEFAULT
  }
  if (provider === 'anthropic' && !/^claude/i.test(model)) {
    patch.model = 'claude-3-5-sonnet-20241022'
  }
  if (provider === 'openrouter') {
    patch.openrouterTier = draft.openrouterTier ?? 'free'
  }
  return patch
}

interface Props {
  open: boolean
  settings: AgentSettings
  models: OllamaModel[]
  ollamaOnline: boolean
  onSettingsChange: (patch: Partial<AgentSettings>) => void
  onPickProject: () => Promise<void>
  onComplete: () => void
}

export function OnboardingWizard({
  open,
  settings,
  models,
  ollamaOnline,
  onSettingsChange,
  onPickProject,
  onComplete
}: Props) {
  const modalRef = useModalA11y<HTMLDivElement>(open)
  const [step, setStep] = useState(1)
  const [draft, setDraft] = useState(settings)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setStep(1)
      setDraft(settings)
    }
    wasOpenRef.current = open
  }, [open, settings])

  const provider = draft.modelProvider ?? 'ollama'

  const selectorModels = useMemo(() => {
    if (provider === 'openrouter') {
      return filterOpenRouterModelsByTier(models, draft.openrouterTier ?? 'free')
    }
    return models
  }, [provider, models, draft.openrouterTier])

  const defaultModel = defaultModelForProvider(provider)

  function patchDraft(patch: Partial<AgentSettings>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  function handleProviderChange(next: ModelProvider) {
    patchDraft(applyProviderPatch(draft, next))
  }

  function handleSkip() {
    onSettingsChange({ firstRunCompleted: true })
    onComplete()
  }

  function handleNext() {
    onSettingsChange({
      modelProvider: draft.modelProvider,
      model: draft.model,
      autoModel: draft.autoModel,
      openrouterTier: draft.openrouterTier,
      modelContextLength: draft.modelContextLength
    })
    setStep((s) => Math.min(3, s + 1))
  }

  async function handleOpenProject() {
    onSettingsChange({
      modelProvider: draft.modelProvider,
      model: draft.model,
      autoModel: draft.autoModel,
      openrouterTier: draft.openrouterTier,
      modelContextLength: draft.modelContextLength,
      firstRunCompleted: true
    })
    await onPickProject()
    onComplete()
  }

  function handleFinishWithoutProject() {
    onSettingsChange({
      modelProvider: draft.modelProvider,
      model: draft.model,
      autoModel: draft.autoModel,
      openrouterTier: draft.openrouterTier,
      modelContextLength: draft.modelContextLength,
      firstRunCompleted: true
    })
    onComplete()
  }

  if (!open) return null

  return (
    <div className="modal-backdrop">
      <div
        ref={modalRef}
        className={`modal ${styles.modal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="onboarding-title">Добро пожаловать в CodeViper</h2>
        </div>

        <div className={`modal-body ${styles.body}`}>
          <div className={styles.steps} aria-label="Шаги настройки">
            {STEP_LABELS.map((label, index) => {
              const n = index + 1
              const cls =
                n === step
                  ? `${styles.step} ${styles.stepActive}`
                  : n < step
                    ? `${styles.step} ${styles.stepDone}`
                    : styles.step
              return (
                <div key={label} className={cls}>
                  {n}. {label}
                </div>
              )
            })}
          </div>

          {step === 1 && (
            <>
              <p className={styles.hint}>
                Выберите провайдер моделей. Позже это можно изменить в настройках (Ctrl+,).
              </p>
              <div className={styles.field}>
                <label htmlFor="onboarding-provider">Провайдер моделей</label>
                <select
                  id="onboarding-provider"
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value as ModelProvider)}
                >
                  {PROVIDERS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <p className={styles.hint}>
                {provider === 'ollama'
                  ? ollamaOnline
                    ? 'Выберите локальную модель Ollama или оставьте «Авто».'
                    : 'Ollama не отвечает — убедитесь, что сервер запущен, или выберите «Авто».'
                  : 'Выберите модель для выбранного провайдера.'}
              </p>
              {provider === 'ollama' ? (
                <div className={styles.field}>
                  <label htmlFor="onboarding-ollama-model">Модель</label>
                  <select
                    id="onboarding-ollama-model"
                    value={draft.autoModel !== false ? '__auto__' : draft.model}
                    onChange={(e) => {
                      if (e.target.value === '__auto__') {
                        patchDraft({ autoModel: true })
                      } else {
                        patchDraft({ autoModel: false, model: e.target.value })
                      }
                    }}
                  >
                    <option value="__auto__">Авто — лучшая доступная модель</option>
                    {models.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <CloudModelSelector
                  provider={provider}
                  model={draft.model ?? ''}
                  defaultModel={defaultModel}
                  models={selectorModels}
                  onChange={(model, contextLength) =>
                    patchDraft({
                      autoModel: false,
                      model,
                      ...(contextLength ? { modelContextLength: contextLength } : {})
                    })
                  }
                />
              )}
            </>
          )}

          {step === 3 && (
            <>
              <p className={styles.hint}>
                Откройте папку проекта, с которым будете работать. Можно пропустить и выбрать проект
                позже из панели чата.
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => void window.codeviper.openExternal(EXAMPLE_PROMPTS_URL)}
              >
                Примеры запросов
              </button>
            </>
          )}
        </div>

        <div className={styles.footer}>
          <button type="button" className="btn" onClick={handleSkip}>
            Пропустить
          </button>
          <div className={styles.footerRight}>
            {step > 1 && (
              <button type="button" className="btn" onClick={() => setStep((s) => s - 1)}>
                Назад
              </button>
            )}
            {step < 3 && (
              <button type="button" className="btn primary" onClick={handleNext}>
                Далее
              </button>
            )}
            {step === 3 && (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => void handleFinishWithoutProject()}
                >
                  Без проекта
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void handleOpenProject()}
                >
                  Открыть проект
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
