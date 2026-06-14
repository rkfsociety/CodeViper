import { useEffect } from 'react'
import type { AgentSettings, OllamaModel } from '../types'
import { ModelPanel } from './ModelPanel'
import { MemoryPanel } from './MemoryPanel'
import { SkillsPanel } from './SkillsPanel'

interface Props {
  open: boolean
  settings: AgentSettings
  chatProjectPath: string
  ollamaOnline: boolean
  models: OllamaModel[]
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
  memoryRefreshKey,
  skillsRefreshKey,
  onClose,
  onSettingsChange,
  onRefreshOllama,
  onSelfLearningChange
}: Props) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

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
          <label>
            Ollama URL
            <input
              value={settings.ollamaUrl}
              onChange={(e) => onSettingsChange({ ollamaUrl: e.target.value })}
              onBlur={() => void onRefreshOllama()}
            />
          </label>

          <ModelPanel
            ollamaUrl={settings.ollamaUrl}
            ollamaOnline={ollamaOnline}
            models={models}
            selectedModel={settings.model}
            onModelChange={(model) => onSettingsChange({ model })}
            onRefresh={onRefreshOllama}
          />

          <label>
            Макс. шагов агента
            <input
              type="number"
              min={3}
              max={30}
              value={settings.maxSteps}
              onChange={(e) =>
                onSettingsChange({ maxSteps: Number(e.target.value) || 12 })
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
      </div>
    </div>
  )
}
