import { useEffect, useState } from 'react'
import styles from './SettingsModal.module.css'
import type { AgentSettings, OllamaModel } from '../../types'
import { useModalA11y } from '../../hooks/useModalA11y'
import type { useOllamaDownloadQueue } from '../../hooks/useOllamaDownloadQueue'
import { SearchCtx, SETTINGS_NAV_GROUPS, type SettingsTab } from './shared'
import { ModelTab } from './ModelTab'
import { AgentTab } from './AgentTab'
import { SecurityTab } from './SecurityTab'
import { AutomationTab } from './AutomationTab'
import { ToolsTab } from './ToolsTab'
import { AdvancedTab } from './AdvancedTab'
import { AppearanceTab } from './AppearanceTab'
import { PerformanceTab } from './PerformanceTab'
import { NotificationsTab } from './NotificationsTab'
import { MemoryTab } from './MemoryTab'
import { IntegrationsTab } from './IntegrationsTab'
import { McpTab } from './McpTab'
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
    <div className={`modal-backdrop ${styles.settingsBackdrop}`} onClick={onClose}>
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
            {SETTINGS_NAV_GROUPS.map((group) => (
              <div key={group.label} className={styles.navGroup}>
                <div className={styles.navGroupLabel}>{group.label}</div>
                {group.tabs.map((item) => (
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
                    <span
                      className={styles.navIcon}
                      dangerouslySetInnerHTML={{ __html: item.icon }}
                    />
                    {item.label}
                  </button>
                ))}
              </div>
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

              <AgentTab
                isActive={tab === 'agent'}
                isSearching={isSearching}
                settings={settings}
                onSettingsChange={onSettingsChange}
              />

              <SecurityTab
                isActive={tab === 'security'}
                isSearching={isSearching}
                settings={settings}
                onSettingsChange={onSettingsChange}
              />

              <AppearanceTab
                isActive={tab === 'appearance'}
                isSearching={isSearching}
                settings={settings}
                onSettingsChange={onSettingsChange}
              />

              <ToolsTab
                isActive={tab === 'tools'}
                isSearching={isSearching}
                settings={settings}
                onSettingsChange={onSettingsChange}
              />

              <AutomationTab
                isActive={tab === 'automation'}
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

              <AdvancedTab
                isActive={tab === 'advanced'}
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

              <NotificationsTab
                isActive={tab === 'notifications'}
                isSearching={isSearching}
                settings={settings}
                onSettingsChange={onSettingsChange}
              />

              <IntegrationsTab
                isActive={tab === 'integrations'}
                isSearching={isSearching}
                settings={settings}
                onSettingsChange={onSettingsChange}
              />

              <McpTab
                isActive={tab === 'mcp'}
                isSearching={isSearching}
                settings={settings}
                chatProjectPath={chatProjectPath}
                onSettingsChange={onSettingsChange}
              />

              <PluginsTab isActive={tab === 'plugins'} isSearching={isSearching} />
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
