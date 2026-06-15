import { useEffect } from 'react'
import type { AgentSettings, OllamaModel } from '../types'
import { ModelPanel } from './ModelPanel'
import { MemoryPanel } from './MemoryPanel'
import { SkillsPanel } from './SkillsPanel'
import type { useOllamaDownloadQueue } from '../hooks/useOllamaDownloadQueue'

type DownloadQueue = ReturnType<typeof useOllamaDownloadQueue>

interface Props {
  open: boolean
  settings: AgentSettings
  chatProjectPath: string
  ollamaOnline: boolean
  models: OllamaModel[]
  downloadQueue: DownloadQueue
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
  downloadQueue,
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

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.autoModel !== false}
              onChange={(e) => onSettingsChange({ autoModel: e.target.checked })}
            />
            <span>
              <strong>Автовыбор модели</strong> — подбирать модель под задачу, выгружать
              другие из RAM (если установлено несколько)
            </span>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.confirmActions === true}
              onChange={(e) => onSettingsChange({ confirmActions: e.target.checked })}
            />
            <span>
              <strong>Подтверждать действия</strong> — спрашивать перед записью файлов и
              запуском команд (мутирующие инструменты агента)
            </span>
          </label>

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
