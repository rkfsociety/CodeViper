import { useMemo, useState } from 'react'
import type { OllamaModel, OllamaPullProgress, RecommendedModel } from '../types'
import { filterToolCallingModels, groupRecommendedModelsByTier, isRecommendedModelInstalled } from '../types'

interface DownloadQueueProps {
  pulling: string | null
  queued: string[]
  progress: OllamaPullProgress | null
  error: string
  percent: number | null
  onEnqueue: (modelName: string) => void
  onRemoveFromQueue: (modelName: string) => void
  onClearError: () => void
}

interface Props {
  ollamaUrl: string
  ollamaOnline: boolean
  models: OllamaModel[]
  selectedModel: string
  autoModel?: boolean
  downloadQueue: DownloadQueueProps
  onModelChange: (model: string) => void
  onRefresh: () => Promise<void>
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  return `${Math.round(bytes / 1024 ** 2)} MB`
}

export function ModelPanel({
  ollamaUrl,
  ollamaOnline,
  models,
  selectedModel,
  autoModel = true,
  downloadQueue,
  onModelChange,
  onRefresh
}: Props) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const { pulling, queued, progress, error, percent, onEnqueue, onRemoveFromQueue, onClearError } =
    downloadQueue

  const toolModels = useMemo(() => filterToolCallingModels(models), [models])
  const unsupportedModels = useMemo(
    () => models.filter((model) => !toolModels.some((item) => item.name === model.name)),
    [models, toolModels]
  )

  function queueModel(model: RecommendedModel) {
    onClearError()
    onEnqueue(model.name)
  }

  async function removeModel(name: string) {
    if (!ollamaOnline || pulling || deleting) return
    if (!window.confirm(`Удалить модель ${name} с диска?`)) return

    setDeleting(name)
    setActionError('')

    try {
      await window.codeviper.deleteOllamaModel(ollamaUrl, name)
      await onRefresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(null)
    }
  }

  const busy = !!pulling || !!deleting
  const queuedSet = useMemo(() => new Set(queued), [queued])

  const downloadableTierGroups = useMemo(
    () =>
      groupRecommendedModelsByTier()
        .map(({ tier, models: tierModels }) => ({
          tier,
          models: tierModels.filter(
            (model) =>
              !isRecommendedModelInstalled(model.name, models) ||
              pulling === model.name ||
              queuedSet.has(model.name)
          )
        }))
        .filter((group) => group.models.length > 0),
    [models, pulling, queuedSet]
  )

  const catalogEmpty = downloadableTierGroups.length === 0 && !pulling && queued.length === 0

  function catalogButtonLabel(modelName: string): string {
    if (pulling === modelName) return 'Скачивание…'
    if (queuedSet.has(modelName)) {
      const index = queued.indexOf(modelName)
      return index === 0 && pulling ? 'Скачивание…' : `В очереди #${index + 1}`
    }
    return 'В очередь'
  }

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

      {(pulling || queued.length > 0) && (
        <div className="model-pull-status">
          <div className="model-pull-title">
            {pulling ? `Скачивание ${pulling}…` : 'Очередь скачивания'}
          </div>
          {pulling && (
            <div className="model-pull-text">{progress?.status ?? 'Подключение…'}</div>
          )}
          {percent != null && pulling && (
            <>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${percent}%` }} />
              </div>
              <div className="model-pull-text">{percent}%</div>
            </>
          )}
          {queued.length > 0 && (
            <div className="model-queue-list">
              {queued.map((name, index) => (
                <div key={name} className="model-queue-item">
                  <span>
                    {index + 1}. {name}
                    {pulling === name ? ' — сейчас' : ''}
                  </span>
                  {pulling !== name && (
                    <button
                      type="button"
                      className="btn model-queue-remove"
                      onClick={() => onRemoveFromQueue(name)}
                    >
                      убрать
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="model-auto-hint">
            Можно закрыть настройки — скачивание продолжится в фоне. Статус — в верхней панели.
          </div>
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
                  disabled={!ollamaOnline || !!pulling || !!deleting}
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
                  disabled={!ollamaOnline || !!pulling || !!deleting}
                  onClick={() => removeModel(model.name)}
                >
                  {deleting === model.name ? 'Удаление…' : 'Удалить'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {error && <div className="model-error">{error}</div>}
      {actionError && <div className="model-error">{actionError}</div>}

      <div className="model-section-title">
        Каталог моделей с tool calling — выберите по объёму RAM
      </div>
      <div className="model-auto-hint">
        Нажмите «В очередь» на нескольких моделях — скачаются по порядку. Окно настроек можно
        закрыть.
      </div>

      {catalogEmpty && (
        <div className="empty model-catalog-empty">Все модели каталога уже установлены.</div>
      )}

      {downloadableTierGroups.map(({ tier, models: tierModels }) => (
        <div key={tier.id} className="model-tier-group">
          <div className="model-tier-title">{tier.label}</div>
          <div className="model-cards">
            {tierModels.map((model) => {
              const inQueue = queuedSet.has(model.name)
              const isPulling = pulling === model.name
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
                    disabled={!ollamaOnline || isPulling || inQueue}
                    onClick={() => queueModel(model)}
                  >
                    {catalogButtonLabel(model.name)}
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
