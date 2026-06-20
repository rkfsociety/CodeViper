import { useMemo, useState } from 'react'
import type { OllamaModel } from '../types'

const KNOWN_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
  gemini: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite-preview-06-17',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
  ]
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

  if (provider === 'openrouter' || provider === 'gemini') {
    return (
      <div className="cloud-model-selector">
        <label>
          Model
          {models.length > 0 ? (
            <>
              <input
                placeholder="Search models..."
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
              placeholder={provider === 'gemini' ? 'gemini-2.5-flash' : 'openai/gpt-4o-mini'}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </label>
        {models.length === 0 && (
          <div className="settings-hint">
            Enter the API key and press refresh to load the list of models with tool calling
            support.
          </div>
        )}
        {models.length > 0 && filtered.length === 0 && (
          <div className="settings-hint">No models found for "{search}"</div>
        )}
      </div>
    )
  }

  const apiModels =
    (provider === 'openai' || provider === 'gemini') && models.length > 0
      ? models.map((m) => m.name)
      : knownModels
  const isCustom = effectiveModel && !apiModels.includes(effectiveModel)

  return (
    <div className="cloud-model-selector">
      <label>
        Model
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
          <option value="__custom__">Other (type manually)...</option>
        </select>
      </label>

      {isCustom && (
        <label>
          Model name
          <input
            value={effectiveModel}
            placeholder={defaultModel || 'model-name'}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}

      {!isCustom && (
        <div className="settings-hint">
          Type a custom model name if the one you need is not listed.
        </div>
      )}
    </div>
  )
}
