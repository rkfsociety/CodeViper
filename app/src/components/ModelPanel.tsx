import { useEffect, useState } from 'react'
import type { OllamaModel, OllamaPullProgress, RecommendedModel } from '../types'
import { groupRecommendedModelsByTier } from '../types'

interface Props {
  ollamaUrl: string
  ollamaOnline: boolean
  models: OllamaModel[]
  selectedModel: string
  autoModel?: boolean
  onModelChange: (model: string) => void
  onRefresh: () => Promise<void>
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

function pullPercent(progress: OllamaPullProgress | null): number | null {
  if (!progress?.total || progress.completed == null) return null
  return Math.min(100, Math.round((progress.completed / progress.total) * 100))
}

export function ModelPanel({
  ollamaUrl,
  ollamaOnline,
  models,
  selectedModel,
  autoModel = true,
  onModelChange,
  onRefresh
}: Props) {
  const [pulling, setPulling] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState<OllamaPullProgress | null>(null)
  const [pullError, setPullError] = useState('')
  const [customModel, setCustomModel] = useState('')

  useEffect(() => {
    const unsubscribe = window.codeviper.onOllamaPullProgress((progress) => {
      setPullProgress(progress)
    })
    return unsubscribe
  }, [])

  async function downloadModel(model: RecommendedModel | string) {
    const name = typeof model === 'string' ? model : model.name
    if (!ollamaOnline || pulling) return

    setPulling(name)
    setPullProgress(null)
    setPullError('')

    try {
      await window.codeviper.pullOllamaModel(ollamaUrl, name)
      await onRefresh()
      onModelChange(name)
    } catch (error) {
      setPullError(error instanceof Error ? error.message : String(error))
    } finally {
      setPulling(null)
      setPullProgress(null)
    }
  }

  const percent = pullPercent(pullProgress)
  const installedNames = new Set(models.map((m) => m.name))
  const tierGroups = groupRecommendedModelsByTier()

  return (
    <div className="model-panel">
      <label>
        {autoModel ? 'Модель по умолчанию (fallback)' : 'Активная модель'}
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={!models.length || !!pulling}
        >
          {!models.length && <option value="">Нет установленных моделей</option>}
          {models.map((model) => (
            <option key={model.name} value={model.name}>
              {model.name} ({formatBytes(model.size)})
            </option>
          ))}
        </select>
      </label>

      {autoModel && models.length > 1 && (
        <div className="model-auto-hint">
          Перед каждым запросом агент сам выберет модель по сложности задачи и выгрузит
          лишние из памяти Ollama.
        </div>
      )}

      {pulling && (
        <div className="model-pull-status">
          <div className="model-pull-title">Скачивание {pulling}…</div>
          <div className="model-pull-text">{pullProgress?.status ?? 'Подключение…'}</div>
          {percent != null && (
            <>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${percent}%` }} />
              </div>
              <div className="model-pull-text">{percent}%</div>
            </>
          )}
        </div>
      )}

      {pullError && <div className="model-error">{pullError}</div>}

      <div className="model-section-title">
        Рекомендуемые модели (tool calling) — выберите по объёму RAM
      </div>

      {tierGroups.map(({ tier, models: tierModels }) => (
        <div key={tier.id} className="model-tier-group">
          <div className="model-tier-title">{tier.label}</div>
          <div className="model-cards">
            {tierModels.map((model) => {
              const installed = installedNames.has(model.name)
              return (
                <div
                  key={model.name}
                  className={`model-card${model.featured ? ' model-card-featured' : ''}`}
                >
                  <div className="model-card-head">
                    <strong>
                      {model.featured ? '★ ' : ''}
                      {model.name}
                    </strong>
                    <span className="model-ram">{model.ramHint}</span>
                  </div>
                  <div className="model-card-desc">{model.description}</div>
                  <button
                    className="btn"
                    disabled={!ollamaOnline || !!pulling || installed}
                    onClick={() => downloadModel(model)}
                  >
                    {installed ? 'Установлена' : pulling === model.name ? 'Скачивание…' : 'Скачать'}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <div className="model-custom">
        <input
          value={customModel}
          onChange={(e) => setCustomModel(e.target.value)}
          placeholder="Другая модель Ollama, напр. mistral-nemo:12b"
          disabled={!ollamaOnline || !!pulling}
        />
        <button
          className="btn primary"
          disabled={!ollamaOnline || !customModel.trim() || !!pulling}
          onClick={() => downloadModel(customModel.trim())}
        >
          Скачать
        </button>
      </div>
    </div>
  )
}
