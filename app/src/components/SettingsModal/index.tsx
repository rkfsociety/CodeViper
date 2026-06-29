import { useEffect, useState } from 'react'
import styles from './SettingsModal.module.css'
import type { AgentSettings, OllamaModel } from '../../types'
import { useModalA11y } from '../../hooks/useModalA11y'
import type { useOllamaDownloadQueue } from '../../hooks/useOllamaDownloadQueue'
import { SearchCtx, SETTINGS_TABS, type SettingsTab } from './shared'
import { ModelTab } from './ModelTab'
import { BehaviorTab } from './BehaviorTab'
import { PerformanceTab } from './PerformanceTab'
import { MemoryTab } from './MemoryTab'
import { IntegrationsTab } from './IntegrationsTab'
import { PluginsTab } from './PluginsTab'
import { UpdatesFooter } from './UpdatesFooter'

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
  const [tab, setTab] = useState<SettingsTab>('model')
  const [searchQuery, setSearchQuery] = useState('')
  const isSearching = searchQuery.trim().length > 0
  const modalRef = useModalA11y<HTMLDivElement>(open)

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      return
    }
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
        ref={modalRef}
        className={`modal ${styles.settingsModal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="settings-title">Настройки</h2>
          <button type="button" className="btn modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className={styles.body}>
          <nav className={styles.nav} role="tablist">
            <div className={styles.searchBox}>
              <input
                className={styles.searchInput}
                placeholder="Поиск настроек…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Поиск по настройкам"
              />
              {searchQuery && (
                <button
                  type="button"
                  className={styles.searchClear}
                  onClick={() => setSearchQuery('')}
                  aria-label="Очистить поиск"
                >
                  ✕
                </button>
              )}
            </div>
            {SETTINGS_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={!isSearching && tab === item.id}
                className={`${styles.navItem}${!isSearching && tab === item.id ? ' ' + styles.navItemActive : ''}`}
                onClick={() => {
                  setSearchQuery('')
                  setTab(item.id)
                }}
              >
                <span className={styles.navIcon} dangerouslySetInnerHTML={{ __html: item.icon }} />
                {item.label}
              </button>
            ))}
          </nav>

          <SearchCtx.Provider value={searchQuery.trim()}>
            <div className={`${styles.content} modal-body settings`}>
              <ModelTab
                isActive={tab === 'model'}
                isSearching={isSearching}
                settings={settings}
                ollamaOnline={ollamaOnline}
                models={models}
                downloadQueue={downloadQueue}
                onSettingsChange={onSettingsChange}
                onRefreshOllama={onRefreshOllama}
              />

              <BehaviorTab
                isActive={tab === 'behavior'}
                isSearching={isSearching}
                settings={settings}
                onSettingsChange={onSettingsChange}
              />

              <PerformanceTab
                isActive={tab === 'performance'}
                isSearching={isSearching}
                settings={settings}
                onSettingsChange={onSettingsChange}
              />

              {!isSearching && tab === 'memory' && (
                <MemoryTab
                  settings={settings}
                  chatProjectPath={chatProjectPath}
                  memoryRefreshKey={memoryRefreshKey}
                  skillsRefreshKey={skillsRefreshKey}
                  onSelfLearningChange={onSelfLearningChange}
                />
              )}

              <IntegrationsTab
                isActive={tab === 'integrations'}
                isSearching={isSearching}
                settings={settings}
                chatProjectPath={chatProjectPath}
                onSettingsChange={onSettingsChange}
              />

              {!isSearching && tab === 'plugins' && <PluginsTab />}
            </div>
          </SearchCtx.Provider>
        </div>

        {!ollamaOnline && (
          <div className="hint">
            Ollama не отвечает. Установи с <strong>ollama.com</strong>, запусти приложение Ollama и
            нажми «Обновить Ollama» в верхней панели.
          </div>
        )}

        <UpdatesFooter />
      </div>
    </div>
  )
}
