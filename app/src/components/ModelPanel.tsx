import { useEffect, useMemo, useState } from 'react'
import type { OllamaModel, OllamaPullProgress, RecommendedModel } from '../types'
import { filterToolCallingModels, groupRecommendedModelsByTier } from '../types'

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
  const [deleting, setDeleting] = useState<string | null>(null)
  const [pullProgress, setPullProgress] = useState<OllamaPullProgress | null>(null)
  const [pullError, setPullError] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    const unsubscribe = window.codeviper.onOllamaPullProgress((progress) => {
      setPullProgress(progress)
    })
    return unsubscribe
  }, [])

  const toolModels = useMemo(() => filterToolCallingModels(models), [models])
  const unsupportedModels = useMemo(
    () => models.filter((model) => !toolModels.some((item) => item.name === model.name)),
    [models, toolModels]
  )

  async function downloadModel(model: RecommendedModel) {
    if (!ollamaOnline || pulling || deleting) return

    setPulling(model.name)
    setPullProgress(null)
    setPullError('')
    setActionError('')

    try {
      await window.codeviper.pullOllamaModel(ollamaUrl, model.name)
      await onRefresh()
      onModelChange(model.name)
    } catch (error) {
      setPullError(error instanceof Error ? error.message : String(error))
    } finally {
      setPulling(null)
      setPullProgress(null)
    }
  }

  async function removeModel(name: string) {
    if (!ollamaOnline || pulling || deleting) return
    if (!window.confirm(`Удалить модель ${name} с диска?`)) return

    setDeleting(name)
    setActionError('')
    setPullError('')

    try {
      await window.codeviper.deleteOllamaModel(ollamaUrl, name)
      await onRefresh()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setDeleting(null)
    }
  }

  const percent = pullPercent(pullProgress)
  const installedNames = new Set(models.map((m) => m.name))
  const tierGroups = groupRecommendedModelsByTier()
  const busy = !!pulling || !!deleting

  return (
    <div className="model-panel">
      <label>
        {autoModel ? 'Модель по умолчанию (fallback)' : 'Активная модель'}
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={!toolModels.length || busy}
        >
          {!toolModels.length && <option value="">Нет моделей с tool calling</option>}
          {toolModels.map((model) => (
            <option key={model.name} value={model.name}>
              {model.name} ({formatBytes(model.size)})
            </option>
          ))}
        </select>
      </label>

      {autoModel && toolModels.length > 1 && (
        <div className="model-auto-hint">
          Перед каждым запросом агент сам выберет модель с tool calling по сложности задачи и
          выгрузит лишние из памяти Ollama.
        </div>
      )}

      {toolModels.length > 0 && (
        <>
          <div className="model-section-title">Установленные модели (tool calling)</div>
          <div className="model-installed-list">
            {toolModels.map((model) => (
              <div key={model.name} className="model-installed-row">
                <div className="model-installed-info">
                  <strong>{model.name}</strong>
                  <span className="model-installed-size">{formatBytes(model.size)}</span>
                </div>
                <button
                  className="btn model-delete-btn"
                  disabled={!ollamaOnline || busy}
                  onClick={() => removeModel(model.name)}
                >
                  {deleting === model.name ? 'Удаление…' : 'Удалить'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {unsupportedModels.length > 0 && (
        <>
          <div className="model-section-title model-section-warn">
            Без tool calling — агент не использует ({unsupportedModels.length})
          </div>
          <div className="model-auto-hint">
            Эти модели установлены в Ollama, но не подходят для агента. Удалите или не используйте.
          </div>
          <div className="model-installed-list">
            {unsupportedModels.map((model) => (
              <div key={model.name} className="model-installed-row model-installed-unsupported">
                <div className="model-installed-info">
                  <strong>{model.name}</strong>
                  <span className="model-installed-size">{formatBytes(model.size)}</span>
                </div>
                <button
                  className="btn model-delete-btn"
                  disabled={!ollamaOnline || busy}
                  onClick={() => removeModel(model.name)}
                >
                  {deleting === model.name ? 'Удаление…' : 'Удалить'}
                </button>
              </div>
            ))}
          </div>
        </>
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
      {actionError && <div className="model-error">{actionError}</div>}

      <div className="model-section-title">
        Каталог моделей с tool calling — выберите по объёму RAM
      </div>
      <div className="model-auto-hint">
        Скачать можно только модели из каталога — все они поддерживают вызов инструментов агента.
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
                    disabled={!ollamaOnline || busy || installed}
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
    </div>
  )
}
