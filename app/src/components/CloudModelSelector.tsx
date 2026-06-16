
// Известные модели по провайдерам
const KNOWN_MODELS: Record<string, string[]> = {
  deepseek: [
    'deepseek-chat',
    'deepseek-coder',
    'deepseek-reasoner'
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
    'o1',
    'o1-mini',
    'o3-mini'
  ]
}

interface Props {
  provider: string
  model: string
  defaultModel: string
  onChange: (model: string) => void
}

export function CloudModelSelector({ provider, model, defaultModel, onChange }: Props) {
  const knownModels = KNOWN_MODELS[provider] ?? []
  const effectiveModel = model || defaultModel
  const isCustom = effectiveModel && !knownModels.includes(effectiveModel)

  return (
    <div className="cloud-model-selector">
      <label>
        Модель
        <select
          value={isCustom ? '__custom__' : effectiveModel}
          onChange={(e) => {
            if (e.target.value !== '__custom__') {
              onChange(e.target.value)
            }
          }}
        >
          {knownModels.map((m) => (
            <option key={m} value={m}>{m}</option>
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
