import { useState, useMemo } from 'react'
import type { OllamaModel } from '../types'

const KNOWN_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini']
}

function fmtContext(ctx?: number): string {
  if (!ctx) return ''
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`
  if (ctx >= 1_000) return `${(ctx / 1_000).toFixed(0)}K`
  return String(ctx)
}

interface Props {
  provider: string
  model: string
  defaultModel: string
  /** Список моделей от API (заполняется для openrouter и openai) */
  models?: OllamaModel[]
  onChange: (model: string, contextLength?: number) => void
}

export function CloudModelSelector({
  provider,
  model,
  defaultModel,
  models = [],
  onChange
}: Props) {
  const [search, setSearch] = useState('')

  const knownModels = KNOWN_MODELS[provider] ?? []
  const effectiveModel = model || defaultModel

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return models.filter((m) => m.name.toLowerCase().includes(q))
  }, [models, search])

  // Для openrouter — показываем загруженный список с поиском
  if (provider === 'openrouter') {
    return (
      <div className="cloud-model-selector">
        <label>
          Модель
          {models.length > 0 ? (
            <>
              <input
                placeholder="Поиск модели…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ marginBottom: 4 }}
              />
              <select
                value={effectiveModel}
                onChange={(e) => {
                  const selected = models.find((m) => m.name === e.target.value)
                  onChange(e.target.value, selected?.contextLength)
                }}
                size={Math.min(8, filtered.length || 1)}
                style={{ height: 'auto' }}
              >
                {filtered.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                    {m.contextLength ? ` (${fmtContext(m.contextLength)})` : ''}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <input
              value={effectiveModel}
              placeholder="openai/gpt-4o-mini"
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </label>
        {models.length === 0 && (
          <div className="settings-hint">
            Введите API ключ OpenRouter и нажмите «Обновить» — загрузится список моделей с
            поддержкой tool calling.
          </div>
        )}
        {models.length > 0 && filtered.length === 0 && (
          <div className="settings-hint">Нет моделей по запросу «{search}»</div>
        )}
      </div>
    )
  }

  // Для DeepSeek и OpenAI-совместимых — статичный список + кастом
  const apiModels =
    provider === 'openai' && models.length > 0 ? models.map((m) => m.name) : knownModels
  const isCustom = effectiveModel && !apiModels.includes(effectiveModel)

  return (
    <div className="cloud-model-selector">
      <label>
        Модель
        <select
          value={isCustom ? '__custom__' : effectiveModel}
          onChange={(e) => {
            if (e.target.value !== '__custom__') {
              const selected = models.find((m) => m.name === e.target.value)
              onChange(e.target.value, selected?.contextLength)
            }
          }}
        >
          {apiModels.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
          <option value="__custom__">Другая (ввести вручную)…</option>
        </select>
      </label>

      {isCustom && (
        <label>
          Название модели
          <input
            value={effectiveModel}
            placeholder={defaultModel || 'model-name'}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}

      {!isCustom && (
        <div className="settings-hint">
          Введите название модели вручную, если нужной нет в списке.
        </div>
      )}
    </div>
  )
}
