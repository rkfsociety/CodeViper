import { useMemo, useState } from 'react'
import type { OllamaModel, OllamaPullProgress, RecommendedModel } from '../types'
import {
  filterToolCallingModels,
  groupRecommendedModelsByTier,
  isRecommendedModelInstalled
} from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import styles from './ModelPanel.module.css'

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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

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

  function requestRemoveModel(name: string) {
    if (!ollamaOnline || pulling || deleting) return
    setConfirmDelete(name)
  }

  async function removeModel(name: string) {
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
    <div className={styles.panel}>
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
        <div className={styles.autoHint}>
          Перед каждым запросом агент сам выберет модель с tool calling по сложности задачи и
          выгрузит лишние из памяти Ollama.
        </div>
      )}

      {(pulling || queued.length > 0) && (
        <div className={styles.pullStatus}>
          <div className={styles.pullTitle}>
            {pulling ? `Скачивание ${pulling}…` : 'Очередь скачивания'}
          </div>
          {pulling && <div className={styles.pullText}>{progress?.status ?? 'Подключение…'}</div>}
          {percent != null && pulling && (
            <>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${percent}%` }} />
              </div>
              <div className={styles.pullText}>{percent}%</div>
            </>
          )}
          {queued.length > 0 && (
            <div className={styles.queueList}>
              {queued.map((name, index) => (
                <div key={name} className={styles.queueItem}>
                  <span>
                    {index + 1}. {name}
                    {pulling === name ? ' — сейчас' : ''}
                  </span>
                  {pulling !== name && (
                    <button
                      type="button"
                      className={`btn ${styles.queueRemove}`}
                      onClick={() => onRemoveFromQueue(name)}
                    >
                      убрать
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className={styles.autoHint}>
            Можно закрыть настройки — скачивание продолжится в фоне. Статус — в верхней панели.
          </div>
        </div>
      )}

      {toolModels.length > 0 && (
        <>
          <div className={styles.sectionTitle}>Установленные модели (tool calling)</div>
          <div className={styles.installedList}>
            {toolModels.map((model) => (
              <div key={model.name} className={styles.installedRow}>
                <div className={styles.installedInfo}>
                  <strong>{model.name}</strong>
                  <span className={styles.installedSize}>{formatBytes(model.size)}</span>
                </div>
                <button
                  className={`btn ${styles.deleteBtn}`}
                  disabled={!ollamaOnline || !!pulling || !!deleting}
                  onClick={() => requestRemoveModel(model.name)}
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
          <div className={`${styles.sectionTitle} ${styles.sectionWarn}`}>
            Без tool calling — агент не использует ({unsupportedModels.length})
          </div>
          <div className={styles.autoHint}>
            Эти модели установлены в Ollama, но не подходят для агента. Удалите или не используйте.
          </div>
          <div className={styles.installedList}>
            {unsupportedModels.map((model) => (
              <div
                key={model.name}
                className={`${styles.installedRow} ${styles.installedUnsupported}`}
              >
                <div className={styles.installedInfo}>
                  <strong>{model.name}</strong>
                  <span className={styles.installedSize}>{formatBytes(model.size)}</span>
                </div>
                <button
                  className={`btn ${styles.deleteBtn}`}
                  disabled={!ollamaOnline || !!pulling || !!deleting}
                  onClick={() => requestRemoveModel(model.name)}
                >
                  {deleting === model.name ? 'Удаление…' : 'Удалить'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {error && <div className={styles.error}>{error}</div>}
      {actionError && <div className={styles.error}>{actionError}</div>}

      <div className={styles.sectionTitle}>
        Каталог моделей с tool calling — выберите по объёму RAM
      </div>
      <div className={styles.autoHint}>
        Нажмите «В очередь» на нескольких моделях — скачаются по порядку. Окно настроек можно
        закрыть.
      </div>

      {catalogEmpty && <div className="empty">Все модели каталога уже установлены.</div>}

      {downloadableTierGroups.map(({ tier, models: tierModels }) => (
        <div key={tier.id} className={styles.tierGroup}>
          <div className={styles.tierTitle}>{tier.label}</div>
          <div className={styles.cards}>
            {tierModels.map((model) => {
              const inQueue = queuedSet.has(model.name)
              const isPulling = pulling === model.name
              return (
                <div
                  key={model.name}
                  className={`${styles.card}${model.featured ? ' ' + styles.cardFeatured : ''}`}
                >
                  <div className={styles.cardHead}>
                    <strong>
                      {model.featured ? '★ ' : ''}
                      {model.name}
                    </strong>
                    <span className={styles.ram}>{model.ramHint}</span>
                  </div>
                  <div className={styles.cardDesc}>{model.description}</div>
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

      <ConfirmDialog
        open={!!confirmDelete}
        title="Удалить модель"
        message={
          confirmDelete
            ? `Удалить модель ${confirmDelete} с диска? Скачать заново можно из каталога.`
            : ''
        }
        confirmLabel="Удалить"
        danger
        onConfirm={() => {
          const name = confirmDelete
          setConfirmDelete(null)
          if (name) void removeModel(name)
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
