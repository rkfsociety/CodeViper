import { useEffect, useState, createContext, useContext, type ReactNode } from 'react'
import styles from './SettingsModal.module.css'
import type { AgentSettings, GitSyncStrategy, OllamaModel, PermissionMode } from '../types'
import { GIT_SYNC_STRATEGIES, GIT_SYNC_STRATEGY_LABELS } from '../types'
import {
  DEFAULT_COMMAND_TIMEOUT_SEC,
  COMMAND_TIMEOUT_SEC_MIN,
  COMMAND_TIMEOUT_SEC_MAX,
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_MODEL_DEFAULT,
  GEMINI_API_BASE_URL,
  GEMINI_MODEL_DEFAULT,
  GEMINI_FREE_MODELS
} from '../../shared/constants'
import { PERMISSION_MODES, PERMISSION_MODE_LABELS } from '../types'
import { ModelPanel } from './ModelPanel'
import { MemoryPanel } from './MemoryPanel'
import { SkillsPanel } from './SkillsPanel'
import { CloudModelSelector } from './CloudModelSelector'
import { useModalA11y } from '../hooks/useModalA11y'
import type { useOllamaDownloadQueue } from '../hooks/useOllamaDownloadQueue'

type DownloadQueue = ReturnType<typeof useOllamaDownloadQueue>

type SettingsTab = 'model' | 'behavior' | 'performance' | 'memory' | 'integrations' | 'plugins'

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: string }[] = [
  {
    id: 'model',
    label: 'Модель',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  },
  {
    id: 'behavior',
    label: 'Поведение',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  },
  {
    id: 'performance',
    label: 'Производительность',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12L5 7l3 3 3-4 3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  },
  {
    id: 'memory',
    label: 'Память и навыки',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 3.5V2M11 3.5V2M1.5 7h13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  },
  {
    id: 'integrations',
    label: 'Интеграции',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="3" cy="8" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="4" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="12" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 8h3l2.5-4M5 8h3l2.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  },
  {
    id: 'plugins',
    label: 'Плагины',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="2" width="10" height="12" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M6 6h4M6 9h4M6 12h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  }
]

// ── Search helpers ──────────────────────────────────────────────────────────

const SearchCtx = createContext('')

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className={styles.searchMark}>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

function SettingItem({
  tab,
  label,
  desc,
  children
}: {
  tab: SettingsTab
  label: string
  desc?: string
  children: ReactNode
}) {
  const query = useContext(SearchCtx)
  if (query) {
    const hay = (label + ' ' + (desc ?? '')).toLowerCase()
    if (!hay.includes(query.toLowerCase())) return null
    const tabLabel = SETTINGS_TABS.find((t) => t.id === tab)?.label ?? ''
    return (
      <div className={styles.searchItem}>
        <div className={styles.searchItemHeader}>
          <span className={styles.searchItemTab}>{tabLabel}</span>
          <span className={styles.searchItemLabel}>
            <Highlight text={label} query={query} />
          </span>
        </div>
        {children}
      </div>
    )
  }
  return <>{children}</>
}

// ────────────────────────────────────────────────────────────────────────────

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

const TOOL_GROUPS: { id: string; label: string; desc: string; tools: string[] }[] = [
  {
    id: 'files',
    label: 'Файлы',
    desc: 'Чтение, запись, поиск, история файлов',
    tools: [
      'search_knowledge_base',
      'list_directory',
      'grep_files',
      'find_files',
      'search_in_project',
      'read_file',
      'read_multiple_files',
      'file_info',
      'project_stats',
      'search_in_file',
      'file_search_summary',
      'show_file_history',
      'copy_file',
      'rename_folder',
      'copy_folder',
      'preview_edit',
      'preview_patch',
      'write_file',
      'create_file',
      'edit_file',
      'undo_edit',
      'append_file',
      'delete_file',
      'move_file'
    ]
  },
  {
    id: 'commands',
    label: 'Команды',
    desc: 'Shell, скрипты, линтер',
    tools: ['run_command', 'run_script', 'review_code']
  },
  {
    id: 'git',
    label: 'Git',
    desc: 'Статус, diff, история коммитов',
    tools: ['git_status', 'git_diff', 'git_log', 'recent_changes']
  },
  {
    id: 'github',
    label: 'GitHub',
    desc: 'Issues, PR, Workflows',
    tools: ['create_issue', 'create_pr', 'list_issues', 'open_issue', 'trigger_github_workflow']
  },
  {
    id: 'gitlab',
    label: 'GitLab',
    desc: 'Merge Requests, пайплайны',
    tools: ['list_gitlab_mrs', 'create_gitlab_mr', 'get_gitlab_pipeline']
  },
  {
    id: 'memory',
    label: 'Память',
    desc: 'Сохранять паттерны и знания',
    tools: ['remember', 'search_memory', 'forget']
  },
  {
    id: 'packages',
    label: 'Зависимости',
    desc: 'package.json, тесты, lock-файл',
    tools: ['package_info', 'read_package_lock', 'dependency_summary', 'test_summary']
  },
  {
    id: 'skills',
    label: 'Навыки',
    desc: 'Управление навыками агента',
    tools: [
      'list_skills',
      'read_skill',
      'create_skill',
      'update_skill',
      'delete_skill',
      'read_skill_data',
      'write_skill_data'
    ]
  },
  {
    id: 'todo',
    label: 'Todo',
    desc: 'Список задач в чате',
    tools: ['set_todo_list', 'complete_todo_item', 'clear_todo_list']
  },
  {
    id: 'indexing',
    label: 'Индексация',
    desc: 'RAG и семантический поиск (Qdrant)',
    tools: ['index_project']
  },
  {
    id: 'web',
    label: 'Веб',
    desc: 'Fetch и поиск в интернете',
    tools: ['web_fetch', 'web_search']
  }
]

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
  const [searchQuery, setSearchQuery] = useState('')
  const isSearching = searchQuery.trim().length > 0
  const [apiKeyVisible, setApiKeyVisible] = useState<Record<string, boolean>>({})
  const [pingState, setPingState] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle')
  const [qdrantPingState, setQdrantPingState] = useState<'idle' | 'checking' | 'ok' | 'fail'>(
    'idle'
  )
  const [milvusPingState, setMilvusPingState] = useState<'idle' | 'checking' | 'ok' | 'fail'>(
    'idle'
  )
  const [mcpUrl, setMcpUrl] = useState('')
  const [mcpBusy, setMcpBusy] = useState(false)
  const [mcpError, setMcpError] = useState<string | null>(null)

  function toggleKeyVisible(key: string) {
    setApiKeyVisible((prev) => ({ ...prev, [key]: !prev[key] }))
  }
  const [tab, setTab] = useState<SettingsTab>('model')
  const modalRef = useModalA11y<HTMLDivElement>(open)

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      setMcpUrl('')
      setMcpError(null)
      setMcpBusy(false)
      return
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const provider = settings.modelProvider ?? 'ollama'

  async function handlePing() {
    setPingState('checking')
    try {
      const ok = await window.codeviper.checkOllama(
        provider === 'ollama' ? settings.ollamaUrl : undefined
      )
      setPingState(ok ? 'ok' : 'fail')
    } catch {
      setPingState('fail')
    }
    setTimeout(() => setPingState('idle'), 3000)
  }

  function handleProviderChange(
    newProvider:
      | 'ollama'
      | 'deepseek'
      | 'openai'
      | 'openrouter'
      | 'gemini'
      | 'anthropic'
      | 'groq'
      | 'together'
  ) {
    const patch: Partial<AgentSettings> = { modelProvider: newProvider }
    if (newProvider === 'deepseek') {
      if (!settings.providerApiKey) patch.providerApiKey = ''
      // Если текущая модель не deepseek-* — подставляем дефолтную
      if (!/^deepseek/i.test(settings.model || '')) {
        patch.model = DEEPSEEK_MODEL_DEFAULT
      }
    }
    if (newProvider === 'gemini' && !/^gemini/i.test(settings.model || '')) {
      patch.model = GEMINI_MODEL_DEFAULT
    }
    if (newProvider === 'anthropic' && !/^claude/i.test(settings.model || '')) {
      patch.model = 'claude-3-5-sonnet-20241022'
    }
    onSettingsChange(patch)
  }

  async function handleQdrantPing() {
    const url = settings.qdrantUrl?.trim()
    if (!url) return
    setQdrantPingState('checking')
    try {
      const ok = await window.codeviper.checkQdrant(url, settings.qdrantApiKey || undefined)
      setQdrantPingState(ok ? 'ok' : 'fail')
    } catch {
      setQdrantPingState('fail')
    }
    setTimeout(() => setQdrantPingState('idle'), 3000)
  }

  async function handleMilvusPing() {
    const url = settings.milvusUrl?.trim()
    if (!url) return
    setMilvusPingState('checking')
    try {
      const ok = await window.codeviper.checkMilvus(url, settings.milvusApiKey || undefined)
      setMilvusPingState(ok ? 'ok' : 'fail')
    } catch {
      setMilvusPingState('fail')
    }
    setTimeout(() => setMilvusPingState('idle'), 3000)
  }

  async function handleAddMcpServer() {
    const url = mcpUrl.trim()
    if (!url || mcpBusy) return

    setMcpBusy(true)
    setMcpError(null)
    try {
      const updated = await window.codeviper.addMcpServer(settings, url)
      onSettingsChange({ mcpServers: updated.mcpServers })
      setMcpUrl('')
    } catch (error) {
      setMcpError(error instanceof Error ? error.message : 'Не удалось добавить MCP-сервер')
    } finally {
      setMcpBusy(false)
    }
  }

  async function handleRemoveMcpServer(serverUrl: string) {
    if (mcpBusy) return

    setMcpBusy(true)
    setMcpError(null)
    try {
      const updated = await window.codeviper.removeMcpServer(settings, serverUrl)
      onSettingsChange({ mcpServers: updated.mcpServers })
    } catch (error) {
      setMcpError(error instanceof Error ? error.message : 'Не удалось удалить MCP-сервер')
    } finally {
      setMcpBusy(false)
    }
  }

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
              {(tab === 'model' || isSearching) && (
                <>
                  {/* ── Провайдер моделей ── */}
                  <SettingItem
                    tab="model"
                    label="Провайдер моделей"
                    desc="ollama deepseek gemini anthropic openai openrouter groq together provider api"
                  >
                    <label>
                      Провайдер моделей
                      <select
                        value={provider}
                        onChange={(e) =>
                          handleProviderChange(
                            e.target.value as
                              | 'ollama'
                              | 'deepseek'
                              | 'openai'
                              | 'openrouter'
                              | 'gemini'
                              | 'anthropic'
                              | 'groq'
                              | 'together'
                          )
                        }
                      >
                        <option value="ollama">Ollama (локально)</option>
                        <option value="anthropic">Claude (Anthropic API)</option>
                        <option value="deepseek">DeepSeek API</option>
                        <option value="gemini">Gemini API</option>
                        <option value="openai">OpenAI-совместимый API</option>
                        <option value="openrouter">OpenRouter</option>
                        <option value="groq">Groq API</option>
                        <option value="together">Together AI</option>
                      </select>
                    </label>
                  </SettingItem>

                  {provider === 'ollama' && (
                    <SettingItem tab="model" label="Ollama URL" desc="ollama адрес url сервер">
                      <label>
                        Ollama URL
                        <input
                          value={settings.ollamaUrl}
                          onChange={(e) => onSettingsChange({ ollamaUrl: e.target.value })}
                          onBlur={() => void onRefreshOllama()}
                        />
                      </label>
                    </SettingItem>
                  )}

                  {provider === 'deepseek' && (
                    <SettingItem
                      tab="model"
                      label="DeepSeek API ключ"
                      desc="deepseek api key ключ sk-"
                    >
                      <>
                        <div className={styles.hint}>
                          Используется <strong>DeepSeek API</strong> — OpenAI-совместимый облачный
                          API. Базовый URL: <code>{DEEPSEEK_API_BASE_URL}</code>, модель по
                          умолчанию: <code>{DEEPSEEK_MODEL_DEFAULT}</code>.
                        </div>
                        <label>
                          DeepSeek API ключ
                          <div className="settings-api-key-row">
                            <input
                              type={apiKeyVisible['deepseek'] ? 'text' : 'password'}
                              placeholder="sk-..."
                              value={settings.deepseekApiKey ?? ''}
                              onChange={(e) => onSettingsChange({ deepseekApiKey: e.target.value })}
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => toggleKeyVisible('deepseek')}
                              title={apiKeyVisible['deepseek'] ? 'Скрыть' : 'Показать'}
                            >
                              {apiKeyVisible['deepseek'] ? '🙈' : '👁'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => void handlePing()}
                              disabled={pingState === 'checking' || !settings.deepseekApiKey}
                              title="Проверить подключение"
                            >
                              {pingState === 'checking'
                                ? '⏳'
                                : pingState === 'ok'
                                  ? '✅'
                                  : pingState === 'fail'
                                    ? '❌'
                                    : '🔌'}
                            </button>
                          </div>
                        </label>
                      </>
                    </SettingItem>
                  )}

                  {provider === 'gemini' &&
                    (() => {
                      const tier = settings.geminiTier ?? 'free'
                      const isFree = tier === 'free'
                      const currentFreeModel =
                        GEMINI_FREE_MODELS.find((m) => m.id === settings.model) ??
                        GEMINI_FREE_MODELS[0]
                      return (
                        <SettingItem
                          tab="model"
                          label="Gemini API ключ"
                          desc="gemini google api key бесплатный платный rpm tpm free paid AIza модель"
                        >
                          <>
                            <div className={styles.hint}>
                              Используется <strong>Gemini API</strong> через{' '}
                              <code>{GEMINI_API_BASE_URL}</code>.
                            </div>

                            {/* Переключатель уровня */}
                            <div className={styles.geminiTierRow}>
                              <button
                                type="button"
                                className={`btn${isFree ? ' active' : ''}`}
                                onClick={() => {
                                  const first = GEMINI_FREE_MODELS[0]
                                  onSettingsChange({
                                    geminiTier: 'free',
                                    model: first.id,
                                    geminiRpm: first.rpm
                                  })
                                }}
                              >
                                Бесплатный
                              </button>
                              <button
                                type="button"
                                className={`btn${!isFree ? ' active' : ''}`}
                                onClick={() =>
                                  onSettingsChange({
                                    geminiTier: 'paid',
                                    model: settings.model || GEMINI_MODEL_DEFAULT
                                  })
                                }
                              >
                                Платный
                              </button>
                            </div>

                            {/* API ключ */}
                            <label>
                              Gemini API ключ
                              <div className="settings-api-key-row">
                                <input
                                  type={apiKeyVisible['gemini'] ? 'text' : 'password'}
                                  placeholder="AIza..."
                                  value={settings.geminiApiKey ?? ''}
                                  onChange={(e) =>
                                    onSettingsChange({ geminiApiKey: e.target.value })
                                  }
                                  autoComplete="off"
                                />
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => toggleKeyVisible('gemini')}
                                  title={apiKeyVisible['gemini'] ? 'Скрыть' : 'Показать'}
                                >
                                  {apiKeyVisible['gemini'] ? '🙈' : '👁'}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => void handlePing()}
                                  disabled={pingState === 'checking' || !settings.geminiApiKey}
                                  title="Проверить подключение"
                                >
                                  {pingState === 'checking'
                                    ? '⏳'
                                    : pingState === 'ok'
                                      ? '✅'
                                      : pingState === 'fail'
                                        ? '❌'
                                        : '🔌'}
                                </button>
                              </div>
                            </label>

                            {isFree ? (
                              /* Бесплатный — выбор из фиксированного списка */
                              <label>
                                Модель
                                <select
                                  value={currentFreeModel.id}
                                  onChange={(e) => {
                                    const m = GEMINI_FREE_MODELS.find(
                                      (x) => x.id === e.target.value
                                    )
                                    if (m) onSettingsChange({ model: m.id, geminiRpm: m.rpm })
                                  }}
                                >
                                  {GEMINI_FREE_MODELS.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.label}
                                    </option>
                                  ))}
                                </select>
                                <span className={styles.hint}>
                                  RPM: <strong>{currentFreeModel.rpm}</strong> · RPD:{' '}
                                  <strong>
                                    {'rpd' in currentFreeModel && currentFreeModel.rpd != null
                                      ? currentFreeModel.rpd
                                      : '∞'}
                                  </strong>{' '}
                                  · TPM:{' '}
                                  <strong>
                                    {currentFreeModel.tpm != null
                                      ? `${(currentFreeModel.tpm / 1000).toFixed(0)}K`
                                      : '∞'}
                                  </strong>{' '}
                                  — лимиты фиксированы для бесплатного уровня.
                                </span>
                              </label>
                            ) : (
                              /* Платный — ручной ввод модели и RPM */
                              <>
                                <label>
                                  Лимит запросов в минуту (RPM)
                                  <input
                                    type="number"
                                    min={1}
                                    max={2000}
                                    step={1}
                                    value={settings.geminiRpm ?? 15}
                                    onChange={(e) => {
                                      const v = parseInt(e.target.value, 10)
                                      if (!isNaN(v) && v >= 1) onSettingsChange({ geminiRpm: v })
                                    }}
                                  />
                                  <span className={styles.hint}>
                                    Интервал между запросами рассчитывается автоматически.
                                  </span>
                                </label>
                              </>
                            )}
                          </>
                        </SettingItem>
                      )
                    })()}

                  {provider === 'anthropic' && (
                    <SettingItem
                      tab="model"
                      label="Claude API ключ"
                      desc="anthropic claude api key sk-ant-"
                    >
                      <>
                        <div className={styles.hint}>
                          Используется <strong>Claude API (Anthropic)</strong>. Модель по умолчанию:{' '}
                          <code>claude-3-5-sonnet-20241022</code>.
                        </div>
                        <label>
                          Claude API ключ
                          <div className="settings-api-key-row">
                            <input
                              type={apiKeyVisible['claude'] ? 'text' : 'password'}
                              placeholder="sk-ant-..."
                              value={settings.claudeApiKey ?? ''}
                              onChange={(e) => onSettingsChange({ claudeApiKey: e.target.value })}
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => toggleKeyVisible('claude')}
                              title={apiKeyVisible['claude'] ? 'Скрыть' : 'Показать'}
                            >
                              {apiKeyVisible['claude'] ? '🙈' : '👁'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => void handlePing()}
                              disabled={pingState === 'checking' || !settings.claudeApiKey}
                              title="Проверить подключение"
                            >
                              {pingState === 'checking'
                                ? '⏳'
                                : pingState === 'ok'
                                  ? '✅'
                                  : pingState === 'fail'
                                    ? '❌'
                                    : '🔌'}
                            </button>
                          </div>
                        </label>
                      </>
                    </SettingItem>
                  )}

                  {provider === 'openai' && (
                    <SettingItem
                      tab="model"
                      label="OpenAI API ключ базовый URL"
                      desc="openai api key sk- базовый url compatible совместимый"
                    >
                      <>
                        <label>
                          API базовый URL
                          <input
                            placeholder="https://api.openai.com/v1"
                            value={settings.ollamaUrl}
                            onChange={(e) => onSettingsChange({ ollamaUrl: e.target.value })}
                          />
                        </label>
                        <label>
                          API ключ
                          <div className="settings-api-key-row">
                            <input
                              type={apiKeyVisible['openai'] ? 'text' : 'password'}
                              placeholder="sk-..."
                              value={settings.openaiApiKey ?? ''}
                              onChange={(e) => onSettingsChange({ openaiApiKey: e.target.value })}
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => toggleKeyVisible('openai')}
                              title={apiKeyVisible['openai'] ? 'Скрыть' : 'Показать'}
                            >
                              {apiKeyVisible['openai'] ? '🙈' : '👁'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => void handlePing()}
                              disabled={pingState === 'checking'}
                              title="Проверить подключение"
                            >
                              {pingState === 'checking'
                                ? '⏳'
                                : pingState === 'ok'
                                  ? '✅'
                                  : pingState === 'fail'
                                    ? '❌'
                                    : '🔌'}
                            </button>
                          </div>
                        </label>
                      </>
                    </SettingItem>
                  )}

                  {provider === 'openrouter' && (
                    <SettingItem
                      tab="model"
                      label="OpenRouter API ключ"
                      desc="openrouter api key sk-or- агрегатор gpt claude llama gemini"
                    >
                      <>
                        <div className={styles.hint}>
                          <strong>OpenRouter</strong> — агрегатор моделей (GPT-4o, Claude, Gemini,
                          Llama и др.). Базовый URL: <code>https://openrouter.ai/api/v1</code>.
                          Получить ключ: <strong>openrouter.ai/keys</strong>
                        </div>
                        <label>
                          OpenRouter API ключ
                          <div className="settings-api-key-row">
                            <input
                              type={apiKeyVisible['openrouter'] ? 'text' : 'password'}
                              placeholder="sk-or-..."
                              value={settings.openrouterApiKey ?? ''}
                              onChange={(e) =>
                                onSettingsChange({ openrouterApiKey: e.target.value })
                              }
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => toggleKeyVisible('openrouter')}
                              title={apiKeyVisible['openrouter'] ? 'Скрыть' : 'Показать'}
                            >
                              {apiKeyVisible['openrouter'] ? '🙈' : '👁'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => void handlePing()}
                              disabled={pingState === 'checking' || !settings.openrouterApiKey}
                              title="Проверить подключение"
                            >
                              {pingState === 'checking'
                                ? '⏳'
                                : pingState === 'ok'
                                  ? '✅'
                                  : pingState === 'fail'
                                    ? '❌'
                                    : '🔌'}
                            </button>
                          </div>
                        </label>
                      </>
                    </SettingItem>
                  )}

                  {provider === 'groq' && (
                    <SettingItem
                      tab="model"
                      label="Groq API ключ"
                      desc="groq api key gsk_ lpu быстрый инференс"
                    >
                      <>
                        <div className={styles.hint}>
                          <strong>Groq API</strong> — сверхбыстрый инференс (LPU). Модель по
                          умолчанию: <code>llama3-8b-8192</code>. Получить ключ:{' '}
                          <strong>console.groq.com/keys</strong>
                        </div>
                        <label>
                          Groq API ключ
                          <div className="settings-api-key-row">
                            <input
                              type={apiKeyVisible['groq'] ? 'text' : 'password'}
                              placeholder="gsk_..."
                              value={settings.groqApiKey ?? ''}
                              onChange={(e) => onSettingsChange({ groqApiKey: e.target.value })}
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => toggleKeyVisible('groq')}
                              title={apiKeyVisible['groq'] ? 'Скрыть' : 'Показать'}
                            >
                              {apiKeyVisible['groq'] ? '🙈' : '👁'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => void handlePing()}
                              disabled={pingState === 'checking' || !settings.groqApiKey}
                              title="Проверить подключение"
                            >
                              {pingState === 'checking'
                                ? '⏳'
                                : pingState === 'ok'
                                  ? '✅'
                                  : pingState === 'fail'
                                    ? '❌'
                                    : '🔌'}
                            </button>
                          </div>
                        </label>
                      </>
                    </SettingItem>
                  )}

                  {provider === 'together' && (
                    <SettingItem
                      tab="model"
                      label="Together AI API ключ"
                      desc="together ai api key облачный llama"
                    >
                      <>
                        <div className={styles.hint}>
                          <strong>Together AI</strong> — облачный инференс с OpenAI-совместимым API.
                          Модель по умолчанию:{' '}
                          <code>meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo</code>. Получить
                          ключ: <strong>api.together.ai/settings/api-keys</strong>
                        </div>
                        <label>
                          Together AI API ключ
                          <div className="settings-api-key-row">
                            <input
                              type={apiKeyVisible['together'] ? 'text' : 'password'}
                              placeholder="..."
                              value={settings.togetherApiKey ?? ''}
                              onChange={(e) => onSettingsChange({ togetherApiKey: e.target.value })}
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => toggleKeyVisible('together')}
                              title={apiKeyVisible['together'] ? 'Скрыть' : 'Показать'}
                            >
                              {apiKeyVisible['together'] ? '🙈' : '👁'}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              onClick={() => void handlePing()}
                              disabled={pingState === 'checking' || !settings.togetherApiKey}
                              title="Проверить подключение"
                            >
                              {pingState === 'checking'
                                ? '⏳'
                                : pingState === 'ok'
                                  ? '✅'
                                  : pingState === 'fail'
                                    ? '❌'
                                    : '🔌'}
                            </button>
                          </div>
                        </label>
                      </>
                    </SettingItem>
                  )}

                  {settings.modelProvider === 'ollama' && (
                    <SettingItem
                      tab="model"
                      label="Автовыбор модели"
                      desc="auto model автоматический выбор ram задача"
                    >
                      <label className={styles.toggle}>
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
                    </SettingItem>
                  )}

                  {settings.modelProvider === 'ollama' && (
                    <SettingItem
                      tab="model"
                      label="Модель для суммаризации"
                      desc="summarize model суммаризация сжатие лёгкая"
                    >
                      <>
                        <label>
                          Модель для суммаризации
                          <select
                            value={settings.summarizeModel ?? ''}
                            onChange={(e) => onSettingsChange({ summarizeModel: e.target.value })}
                          >
                            <option value="">Авто — самая лёгкая установленная</option>
                            {models.map((model) => (
                              <option key={model.name} value={model.name}>
                                {model.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className={styles.hint}>
                          Сжатие длинной истории чата при достижении порога. По умолчанию берётся
                          самая лёгкая модель в Ollama — быстрее и не отвлекает основную модель
                          агента.
                        </div>
                      </>
                    </SettingItem>
                  )}

                  <SettingItem
                    tab="model"
                    label="Порог суммаризации"
                    desc="threshold сжатие контекст компрессия summarize percentage экономичный сбалансированный качество"
                  >
                    <label>
                      Порог суммаризации:{' '}
                      <strong>
                        {settings.aggressiveCompression
                          ? 65
                          : (settings.contextSummarizeThreshold ?? 85)}
                        %
                      </strong>
                      <div
                        style={{
                          display: 'flex',
                          gap: '0.5em',
                          marginBottom: '0.5em',
                          marginTop: '0.35em'
                        }}
                      >
                        {(
                          [
                            { label: 'Экономичный', value: 55 },
                            { label: 'Сбалансированный', value: 70 },
                            { label: 'Качество', value: 85 }
                          ] as { label: string; value: number }[]
                        ).map((preset) => {
                          const current = settings.aggressiveCompression
                            ? 65
                            : (settings.contextSummarizeThreshold ?? 85)
                          const active = !settings.aggressiveCompression && current === preset.value
                          return (
                            <button
                              key={preset.value}
                              type="button"
                              disabled={settings.aggressiveCompression === true}
                              onClick={() =>
                                onSettingsChange({
                                  aggressiveCompression: false,
                                  contextSummarizeThreshold: preset.value
                                })
                              }
                              style={{
                                flex: 1,
                                padding: '0.25em 0.4em',
                                fontSize: '0.78em',
                                cursor: settings.aggressiveCompression ? 'not-allowed' : 'pointer',
                                borderRadius: '4px',
                                border: active
                                  ? '2px solid var(--accent)'
                                  : '1px solid var(--border)',
                                background: active ? 'var(--accent)' : 'var(--bg-secondary)',
                                color: active ? 'var(--bg)' : 'var(--text)',
                                opacity: settings.aggressiveCompression ? 0.4 : 1
                              }}
                            >
                              {preset.label}
                              <br />
                              <span style={{ opacity: 0.7 }}>{preset.value}%</span>
                            </button>
                          )
                        })}
                      </div>
                      <input
                        type="range"
                        min={50}
                        max={85}
                        step={5}
                        disabled={settings.aggressiveCompression === true}
                        value={
                          settings.aggressiveCompression
                            ? 65
                            : (settings.contextSummarizeThreshold ?? 85)
                        }
                        onChange={(e) =>
                          onSettingsChange({ contextSummarizeThreshold: Number(e.target.value) })
                        }
                        style={{ width: '100%' }}
                      />
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.75em',
                          opacity: 0.6
                        }}
                      >
                        <span>50% — максимальная экономия</span>
                        <span>85% — дефолт</span>
                      </div>
                    </label>

                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={settings.aggressiveCompression === true}
                        onChange={(e) => {
                          onSettingsChange({
                            aggressiveCompression: e.target.checked,
                            ...(e.target.checked ? {} : { contextSummarizeThreshold: 85 })
                          })
                        }}
                      />
                      <span className={styles.track} aria-hidden="true">
                        <span className={styles.thumb} />
                      </span>
                      <span className={styles.toggleContent}>
                        <span className={styles.title}>Агрессивное сжатие (65%)</span>
                        <span className={styles.desc}>
                          Суммаризировать при 65% заполнения контекста — экономия 30–40% на длинных
                          диалогах; перекрывает слайдер выше
                        </span>
                      </span>
                    </label>
                  </SettingItem>

                  {/* ── Второй провайдер (дополнительно) ── */}
                  <SettingItem
                    tab="model"
                    label="Облачный API"
                    desc="cloud provider dual deepseek gemini openai openrouter суммаризация облако дополнительный"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>Облачный API (дополнительно)</div>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={settings.cloudEnabled === true}
                          onChange={(e) => onSettingsChange({ cloudEnabled: e.target.checked })}
                        />
                        <span className={styles.track} aria-hidden="true">
                          <span className={styles.thumb} />
                        </span>
                        <span className={styles.toggleContent}>
                          <span className={styles.title}>Включить облачный провайдер</span>
                          <span className={styles.desc}>
                            {provider === 'ollama'
                              ? 'Ollama остаётся основным; облако используется для суммаризации контекста'
                              : 'Облако остаётся основным; Ollama используется для суммаризации контекста'}
                          </span>
                        </span>
                      </label>

                      {settings.cloudEnabled && (
                        <>
                          <label>
                            Тип облачного провайдера
                            <select
                              value={settings.cloudProvider ?? 'deepseek'}
                              onChange={(e) =>
                                onSettingsChange({
                                  cloudProvider: e.target.value as
                                    | 'deepseek'
                                    | 'openai'
                                    | 'openrouter'
                                    | 'gemini'
                                })
                              }
                            >
                              <option value="deepseek">DeepSeek API</option>
                              <option value="gemini">Gemini API</option>
                              <option value="openai">OpenAI-совместимый API</option>
                              <option value="openrouter">OpenRouter</option>
                            </select>
                          </label>

                          {(settings.cloudProvider ?? 'deepseek') === 'deepseek' ? (
                            <label>
                              Базовый URL
                              <input
                                placeholder="https://api.deepseek.com"
                                value={settings.cloudBaseUrl || 'https://api.deepseek.com'}
                                disabled
                              />
                            </label>
                          ) : (
                            <label>
                              Базовый URL
                              <input
                                placeholder={
                                  (settings.cloudProvider ?? 'openai') === 'openrouter'
                                    ? 'https://openrouter.ai/api/v1'
                                    : (settings.cloudProvider ?? 'deepseek') === 'gemini'
                                      ? 'https://generativelanguage.googleapis.com/v1beta'
                                      : 'https://api.openai.com/v1'
                                }
                                value={settings.cloudBaseUrl ?? ''}
                                onChange={(e) => onSettingsChange({ cloudBaseUrl: e.target.value })}
                              />
                            </label>
                          )}

                          <label>
                            API ключ
                            <input
                              type="password"
                              placeholder="sk-..."
                              value={settings.cloudApiKey ?? ''}
                              onChange={(e) => onSettingsChange({ cloudApiKey: e.target.value })}
                              autoComplete="off"
                            />
                          </label>

                          <label>
                            Модель
                            <input
                              placeholder={
                                (settings.cloudProvider ?? 'deepseek') === 'deepseek'
                                  ? 'deepseek-chat'
                                  : (settings.cloudProvider ?? 'deepseek') === 'gemini'
                                    ? 'gemini-2.5-flash'
                                    : 'gpt-4o-mini'
                              }
                              value={settings.cloudModel ?? ''}
                              onChange={(e) => onSettingsChange({ cloudModel: e.target.value })}
                            />
                          </label>
                          <div className={styles.hint}>
                            {provider === 'ollama'
                              ? 'Облачная модель будет использоваться для суммаризации длинных диалогов вместо локальной — качество сжатия обычно выше.'
                              : 'Ollama будет использоваться для локальной суммаризации, освобождая облачные токены.'}
                          </div>
                        </>
                      )}
                    </div>
                  </SettingItem>
                </>
              )}

              {(tab === 'behavior' || isSearching) && (
                <>
                  {/* ── Безопасность ── */}
                  <SettingItem
                    tab="behavior"
                    label="Безопасность"
                    desc="режим доступа запрещённые команды blocklist permission спрашивать принимать bypass"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>Безопасность</div>
                      <label>
                        Режим доступа
                        <select
                          value={settings.permissionMode ?? 'bypass'}
                          onChange={(e) =>
                            onSettingsChange({ permissionMode: e.target.value as PermissionMode })
                          }
                        >
                          {PERMISSION_MODES.map((mode) => (
                            <option key={mode} value={mode}>
                              {PERMISSION_MODE_LABELS[mode]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className={`${styles.hint} ${styles.hintInline}`}>
                        <strong>Спрашивать всё</strong> — подтверждение перед каждой
                        записью/командой. <strong>Принимать правки</strong> — файлы без вопросов,
                        команды с подтверждением. <strong>Без подтверждений</strong> — агент
                        действует сам.
                      </div>

                      <label>
                        Запрещённые команды
                        <textarea
                          rows={4}
                          placeholder={
                            'npm publish\\.+--access public\ncurl .+ | bash\ndocker push'
                          }
                          value={(settings.commandBlocklist ?? []).join('\n')}
                          onChange={(e) => {
                            const lines = e.target.value.split('\n')
                            onSettingsChange({ commandBlocklist: lines })
                          }}
                          style={{ fontFamily: 'monospace', resize: 'vertical' }}
                        />
                      </label>
                      <div className={`${styles.hint} ${styles.hintInline}`}>
                        Каждая строка — паттерн (подстрока или регулярное выражение). Совпадение
                        блокирует команду. Применяется поверх встроенного списка.
                      </div>
                    </div>
                  </SettingItem>

                  {/* ── Поведение агента ── */}
                  <SettingItem
                    tab="behavior"
                    label="Поведение агента"
                    desc="уточняющие вопросы глубокое рассуждение reasoning reasoning исключать только чтение readonly clarify deep"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>Поведение агента</div>

                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={settings.clarifyMode === true}
                          onChange={(e) => onSettingsChange({ clarifyMode: e.target.checked })}
                        />
                        <span className={styles.track} aria-hidden="true">
                          <span className={styles.thumb} />
                        </span>
                        <span className={styles.toggleContent}>
                          <span className={styles.title}>Уточняющие вопросы</span>
                          <span className={styles.desc}>
                            При неоднозначной задаче агент сначала задаёт вопросы, а потом
                            приступает
                          </span>
                        </span>
                      </label>

                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={settings.deepReasoning === true}
                          onChange={(e) => onSettingsChange({ deepReasoning: e.target.checked })}
                        />
                        <span className={styles.track} aria-hidden="true">
                          <span className={styles.thumb} />
                        </span>
                        <span className={styles.toggleContent}>
                          <span className={styles.title}>Глубокое рассуждение</span>
                          <span className={styles.desc}>
                            Для think-моделей (qwen3, deepseek-r1, qwq) включает режим рассуждения,
                            для остальных усиливает промпт. Точнее, но медленнее
                          </span>
                        </span>
                      </label>

                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={settings.excludeThinkingFromHistory !== false}
                          onChange={(e) =>
                            onSettingsChange({ excludeThinkingFromHistory: e.target.checked })
                          }
                        />
                        <span className={styles.track} aria-hidden="true">
                          <span className={styles.thumb} />
                        </span>
                        <span className={styles.toggleContent}>
                          <span className={styles.title}>Исключать reasoning из истории</span>
                          <span className={styles.desc}>
                            Убирает блоки &lt;think&gt;…&lt;/think&gt; из истории при построении
                            контекста. Экономит 20–50% токенов для think-моделей (DeepSeek-R1, QwQ,
                            Qwen3)
                          </span>
                        </span>
                      </label>

                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={settings.readonlyMode === true}
                          onChange={(e) => onSettingsChange({ readonlyMode: e.target.checked })}
                        />
                        <span className={styles.track} aria-hidden="true">
                          <span className={styles.thumb} />
                        </span>
                        <span className={styles.toggleContent}>
                          <span className={styles.title}>Только чтение</span>
                          <span className={styles.desc}>
                            Блокирует все инструменты записи; агент может только читать файлы и
                            искать по коду
                          </span>
                        </span>
                      </label>
                    </div>
                  </SettingItem>

                  {/* ── Дополнительные инструкции ── */}
                  <SettingItem
                    tab="behavior"
                    label="Дополнительные инструкции"
                    desc="системный промпт кастомный инструкции system prompt custom instructions"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>Дополнительные инструкции</div>
                      <p className={styles.desc}>
                        Текст дописывается в конец системного промпта агента. Используй для
                        добавления правил, стиля ответов или ограничений.
                      </p>
                      <textarea
                        className={styles.customPromptTextarea}
                        placeholder="Например: всегда отвечай кратко и только по делу. Не используй markdown-заголовки."
                        value={settings.customSystemPrompt ?? ''}
                        onChange={(e) => onSettingsChange({ customSystemPrompt: e.target.value })}
                        rows={5}
                        spellCheck={false}
                      />
                    </div>
                  </SettingItem>

                  {/* ── Автоматизация ── */}
                  <SettingItem
                    tab="behavior"
                    label="Автоматизация"
                    desc="автокоммит git синхронизация push pull стратегия startup запуск stash rebase fast-forward"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>Автоматизация</div>

                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={settings.autoPushSelfEdits !== false}
                          onChange={(e) =>
                            onSettingsChange({ autoPushSelfEdits: e.target.checked })
                          }
                        />
                        <span className={styles.track} aria-hidden="true">
                          <span className={styles.thumb} />
                        </span>
                        <span className={styles.toggleContent}>
                          <span className={styles.title}>Автокоммит самоправок</span>
                          <span className={styles.desc}>
                            После самоулучшения — commit + push в ветку{' '}
                            <code>
                              {settings.selfImproveBranch?.trim() || 'agent/self-improve'}
                            </code>
                            , не в master
                          </span>
                        </span>
                      </label>

                      <div style={{ marginTop: '0.75rem' }}>
                        <div className={styles.sectionLabel}>Ветка самоулучшения</div>
                        <input
                          type="text"
                          className={styles.searchInput}
                          placeholder="agent/self-improve"
                          value={settings.selfImproveBranch ?? ''}
                          onChange={(e) =>
                            onSettingsChange({ selfImproveBranch: e.target.value || undefined })
                          }
                          spellCheck={false}
                        />
                        <div className={styles.hint}>
                          Только <code>agent/*</code> — агент переключится в начале самоулучшения
                        </div>
                      </div>

                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={settings.syncCollectiveMemory !== false}
                          onChange={(e) =>
                            onSettingsChange({ syncCollectiveMemory: e.target.checked })
                          }
                        />
                        <span className={styles.track} aria-hidden="true">
                          <span className={styles.thumb} />
                        </span>
                        <span className={styles.toggleContent}>
                          <span className={styles.title}>Коллективная память на GitHub</span>
                          <span className={styles.desc}>
                            Глобальные знания (🧠 Запомнено) →{' '}
                            <code>docs/collective/ViperMemory.md</code> в ветке{' '}
                            <code>
                              {settings.selfImproveBranch?.trim() || 'agent/self-improve'}
                            </code>
                          </span>
                        </span>
                      </label>

                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={settings.gitSyncOnStartup !== false}
                          onChange={(e) => onSettingsChange({ gitSyncOnStartup: e.target.checked })}
                        />
                        <span className={styles.track} aria-hidden="true">
                          <span className={styles.thumb} />
                        </span>
                        <span className={styles.toggleContent}>
                          <span className={styles.title}>Git-синхронизация при запуске</span>
                          <span className={styles.desc}>
                            При запуске CodeViper автоматически подтягивает обновления с GitHub
                          </span>
                        </span>
                      </label>

                      {settings.gitSyncOnStartup !== false && (
                        <>
                          <label>
                            Стратегия синхронизации
                            <select
                              value={settings.gitSyncStrategy ?? 'stash'}
                              onChange={(e) =>
                                onSettingsChange({
                                  gitSyncStrategy: e.target.value as GitSyncStrategy
                                })
                              }
                            >
                              {GIT_SYNC_STRATEGIES.map((strategy) => (
                                <option key={strategy} value={strategy}>
                                  {GIT_SYNC_STRATEGY_LABELS[strategy]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className={`${styles.hint} ${styles.hintInline}`}>
                            <strong>Stash + reset</strong> — локальные правки прячутся в{' '}
                            <code>git stash</code>, затем <code>reset --hard</code> на версию GitHub
                            (приоритет у GitHub). <strong>Rebase</strong> — локальные коммиты
                            переносятся поверх версии GitHub. <strong>Fast-forward only</strong> —
                            обновление только если нет расхождений; иначе остаётся локальная версия
                            (ничего не теряется).
                            <br />
                            При незакоммиченных изменениях лаунчер покажет предупреждение и спросит
                            подтверждение перед синхронизацией.
                          </div>
                        </>
                      )}
                    </div>
                  </SettingItem>

                  {/* ── Инструменты агента ── */}
                  <SettingItem
                    tab="behavior"
                    label="Инструменты агента"
                    desc="отключить инструменты файлы git github gitlab память команды веб навыки todo индексация зависимости disabled tools"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>Инструменты агента</div>
                      <p className={styles.desc}>
                        Снимите галочку с группы, чтобы скрыть её инструменты от агента. Изменения
                        вступят в силу при следующем сообщении.
                      </p>
                      <div
                        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px' }}
                      >
                        {TOOL_GROUPS.map((group) => {
                          const disabled = settings.disabledTools ?? []
                          const allDisabled = group.tools.every((t) => disabled.includes(t))
                          return (
                            <label key={group.id} className={styles.toggle}>
                              <input
                                type="checkbox"
                                checked={!allDisabled}
                                onChange={(e) => {
                                  const current = new Set(settings.disabledTools ?? [])
                                  if (e.target.checked) {
                                    group.tools.forEach((t) => current.delete(t))
                                  } else {
                                    group.tools.forEach((t) => current.add(t))
                                  }
                                  onSettingsChange({ disabledTools: [...current] })
                                }}
                              />
                              <span className={styles.track} aria-hidden="true">
                                <span className={styles.thumb} />
                              </span>
                              <span className={styles.toggleContent}>
                                <span className={styles.title}>{group.label}</span>
                                <span className={styles.desc}>{group.desc}</span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  </SettingItem>

                  {/* ── Разработка ── */}
                  <SettingItem
                    tab="behavior"
                    label="Разработка"
                    desc="путь исходники codeviper source root override самоулучшение"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>Разработка</div>
                      <label>
                        Путь к исходникам CodeViper
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="F:\\github\\CodeViper\\app"
                            value={settings.sourceRootOverride ?? ''}
                            onChange={(e) =>
                              onSettingsChange({ sourceRootOverride: e.target.value })
                            }
                            style={{ flex: 1 }}
                          />
                          <button
                            onClick={async () => {
                              const path = await window.codeviper.selectFolder()
                              if (path) {
                                onSettingsChange({ sourceRootOverride: path })
                              }
                            }}
                            style={{
                              padding: '6px 12px',
                              cursor: 'pointer',
                              backgroundColor: 'var(--color-bg-secondary)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '4px',
                              fontSize: '14px'
                            }}
                          >
                            Выбрать папку
                          </button>
                        </div>
                      </label>
                      <div className={`${styles.hint} ${styles.hintInline}`}>
                        Абсолютный путь к папке <code>app/</code> исходников CodeViper. Если указан,
                        используется вместо автоматического поиска. Оставьте пусто для
                        автоматического поиска.
                      </div>
                    </div>
                  </SettingItem>
                </>
              )}

              {!isSearching && tab === 'model' && (
                <>
                  {provider === 'ollama' ? (
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
                  ) : provider === 'gemini' && (settings.geminiTier ?? 'free') === 'free' ? null : (
                    <CloudModelSelector
                      provider={provider}
                      model={settings.model}
                      defaultModel={provider === 'deepseek' ? DEEPSEEK_MODEL_DEFAULT : ''}
                      models={models}
                      onChange={(model, contextLength) =>
                        onSettingsChange({
                          model,
                          ...(contextLength ? { modelContextLength: contextLength } : {})
                        })
                      }
                    />
                  )}
                </>
              )}

              {(tab === 'performance' || isSearching) && (
                <>
                  <SettingItem
                    tab="performance"
                    label="Режимы производительности"
                    desc="энергосбережение power save CPU GPU статы PR pull requests ручной manual refresh анимации"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>Режимы</div>

                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={settings.powerSaveMode === true}
                          onChange={(e) => onSettingsChange({ powerSaveMode: e.target.checked })}
                        />
                        <span className={styles.track} aria-hidden="true">
                          <span className={styles.thumb} />
                        </span>
                        <span className={styles.toggleContent}>
                          <span className={styles.title}>Режим энергосбережения</span>
                          <span className={styles.desc}>
                            Батчинг обновлений UI (300 мс), все анимации и переходы отключены
                          </span>
                        </span>
                      </label>

                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={settings.disableSystemStats === true}
                          onChange={(e) =>
                            onSettingsChange({ disableSystemStats: e.target.checked })
                          }
                        />
                        <span className={styles.track} aria-hidden="true">
                          <span className={styles.thumb} />
                        </span>
                        <span className={styles.toggleContent}>
                          <span className={styles.title}>Отключить CPU/GPU-статы</span>
                          <span className={styles.desc}>
                            Останавливает фоновый опрос загрузки процессора и видеокарты во время
                            работы агента
                          </span>
                        </span>
                      </label>

                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={settings.prManualRefresh === true}
                          onChange={(e) => onSettingsChange({ prManualRefresh: e.target.checked })}
                        />
                        <span className={styles.track} aria-hidden="true">
                          <span className={styles.thumb} />
                        </span>
                        <span className={styles.toggleContent}>
                          <span className={styles.title}>Обновлять PR только вручную</span>
                          <span className={styles.desc}>
                            Отключает авто-опрос Pull Requests каждые 5 минут — обновление только по
                            кнопке
                          </span>
                        </span>
                      </label>
                    </div>
                  </SettingItem>

                  <SettingItem
                    tab="performance"
                    label="GPU память Ollama"
                    desc="num_gpu слои слоёв видеокарта gpu layers vram cpu oom"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>GPU / память (Ollama)</div>

                      <div className={styles.row}>
                        <div className={styles.rowContent}>
                          <span className={styles.title}>Слоёв на GPU</span>
                          <span className={styles.desc}>
                            Сколько слоёв модели загружать на GPU. Пусто или -1 — авто (всё на GPU).
                            0 — только CPU (медленно, но без OOM). Дробные значения, например 20,
                            позволяют запустить крупную модель частично: одни слои на GPU, остальные
                            на RAM.
                          </span>
                        </div>
                        <div className={styles.rowRight}>
                          <input
                            type="number"
                            min={0}
                            placeholder="-1"
                            style={{ width: 72 }}
                            value={settings.ollamaNumGpu ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value.trim()
                              onSettingsChange({
                                ollamaNumGpu: raw === '' ? undefined : Number(raw)
                              })
                            }}
                          />
                          <span className={styles.unit}>слоёв</span>
                        </div>
                      </div>
                    </div>
                  </SettingItem>

                  <SettingItem
                    tab="performance"
                    label="Таймаут команд"
                    desc="timeout таймаут командный секунды time seconds max"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>Таймауты</div>

                      <div className={styles.row}>
                        <div className={styles.rowContent}>
                          <span className={styles.title}>Таймаут команд</span>
                          <span className={styles.desc}>
                            Макс. время одной команды агента (по умолч. 120 с, макс.{' '}
                            {COMMAND_TIMEOUT_SEC_MAX} с)
                          </span>
                        </div>
                        <div className={styles.rowRight}>
                          <input
                            type="number"
                            min={COMMAND_TIMEOUT_SEC_MIN}
                            max={COMMAND_TIMEOUT_SEC_MAX}
                            value={settings.commandTimeoutSec ?? DEFAULT_COMMAND_TIMEOUT_SEC}
                            onChange={(e) =>
                              onSettingsChange({
                                commandTimeoutSec:
                                  Number(e.target.value) || DEFAULT_COMMAND_TIMEOUT_SEC
                              })
                            }
                          />
                          <span className={styles.unit}>сек</span>
                        </div>
                      </div>
                    </div>
                  </SettingItem>

                  <SettingItem
                    tab="performance"
                    label="Звуковые уведомления"
                    desc="sound notification звук сигнал завершение задача"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>Уведомления</div>

                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={settings.soundNotifications === true}
                          onChange={(e) =>
                            onSettingsChange({ soundNotifications: e.target.checked })
                          }
                        />
                        <span className={styles.track} aria-hidden="true">
                          <span className={styles.thumb} />
                        </span>
                        <span className={styles.toggleContent}>
                          <span className={styles.title}>Звуковые уведомления</span>
                          <span className={styles.desc}>
                            Короткий сигнал при завершении задачи агента
                          </span>
                        </span>
                      </label>
                    </div>
                  </SettingItem>
                </>
              )}

              {(tab === 'integrations' || isSearching) && (
                <>
                  {/* ── GitHub ── */}
                  <SettingItem
                    tab="integrations"
                    label="GitHub Token"
                    desc="github personal access token gist поделиться ghp_"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>GitHub</div>
                      <label>
                        GitHub Token
                        <input
                          type="password"
                          placeholder="ghp_..."
                          value={settings.githubToken ?? ''}
                          onChange={(e) => onSettingsChange({ githubToken: e.target.value })}
                        />
                      </label>
                      <div className={`${styles.hint} ${styles.hintInline}`}>
                        Personal Access Token с правом <code>gist</code> для кнопки «Поделиться» в
                        Памяти и Навыках. Создать:{' '}
                        <a
                          href="https://github.com/settings/tokens"
                          target="_blank"
                          rel="noreferrer"
                        >
                          github.com/settings/tokens
                        </a>
                      </div>
                    </div>
                  </SettingItem>

                  {/* ── Векторное хранилище (RAG) ── */}
                  <SettingItem
                    tab="integrations"
                    label="Векторное хранилище RAG"
                    desc="qdrant milvus local json embeddings vector store retrieval rag semantic search поиск"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>Векторное хранилище (RAG)</div>
                      <label>
                        Провайдер
                        <select
                          value={settings.ragProvider ?? 'local'}
                          onChange={(e) =>
                            onSettingsChange({
                              ragProvider: e.target.value as 'local' | 'qdrant' | 'milvus'
                            })
                          }
                        >
                          <option value="local">Локальный JSON (встроенный)</option>
                          <option value="qdrant">Qdrant</option>
                          <option value="milvus">Milvus</option>
                        </select>
                      </label>

                      {(settings.ragProvider ?? 'local') === 'qdrant' && (
                        <>
                          <label>
                            URL Qdrant
                            <div className="settings-api-key-row">
                              <input
                                placeholder="http://localhost:6333"
                                value={settings.qdrantUrl ?? ''}
                                onChange={(e) => onSettingsChange({ qdrantUrl: e.target.value })}
                              />
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => void handleQdrantPing()}
                                disabled={
                                  qdrantPingState === 'checking' || !settings.qdrantUrl?.trim()
                                }
                                title="Проверить подключение"
                              >
                                {qdrantPingState === 'checking'
                                  ? '⏳'
                                  : qdrantPingState === 'ok'
                                    ? '✅'
                                    : qdrantPingState === 'fail'
                                      ? '❌'
                                      : '🔌'}
                              </button>
                            </div>
                          </label>
                          <label>
                            API ключ Qdrant
                            <div className="settings-api-key-row">
                              <input
                                type={apiKeyVisible['qdrant'] ? 'text' : 'password'}
                                placeholder="(опционально)"
                                value={settings.qdrantApiKey ?? ''}
                                onChange={(e) => onSettingsChange({ qdrantApiKey: e.target.value })}
                                autoComplete="off"
                              />
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => toggleKeyVisible('qdrant')}
                                title={apiKeyVisible['qdrant'] ? 'Скрыть' : 'Показать'}
                              >
                                {apiKeyVisible['qdrant'] ? '🙈' : '👁'}
                              </button>
                            </div>
                          </label>
                          <div className={`${styles.hint} ${styles.hintInline}`}>
                            API ключ нужен только для защищённых инстансов Qdrant Cloud.
                          </div>
                        </>
                      )}

                      {(settings.ragProvider ?? 'local') === 'milvus' && (
                        <>
                          <label>
                            URL Milvus
                            <div className="settings-api-key-row">
                              <input
                                placeholder="http://localhost:19530"
                                value={settings.milvusUrl ?? ''}
                                onChange={(e) => onSettingsChange({ milvusUrl: e.target.value })}
                              />
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => void handleMilvusPing()}
                                disabled={
                                  milvusPingState === 'checking' || !settings.milvusUrl?.trim()
                                }
                                title="Проверить подключение"
                              >
                                {milvusPingState === 'checking'
                                  ? '⏳'
                                  : milvusPingState === 'ok'
                                    ? '✅'
                                    : milvusPingState === 'fail'
                                      ? '❌'
                                      : '🔌'}
                              </button>
                            </div>
                          </label>
                          <label>
                            API ключ Milvus
                            <div className="settings-api-key-row">
                              <input
                                type={apiKeyVisible['milvus'] ? 'text' : 'password'}
                                placeholder="(опционально)"
                                value={settings.milvusApiKey ?? ''}
                                onChange={(e) => onSettingsChange({ milvusApiKey: e.target.value })}
                                autoComplete="off"
                              />
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => toggleKeyVisible('milvus')}
                                title={apiKeyVisible['milvus'] ? 'Скрыть' : 'Показать'}
                              >
                                {apiKeyVisible['milvus'] ? '🙈' : '👁'}
                              </button>
                            </div>
                          </label>
                          <div className={`${styles.hint} ${styles.hintInline}`}>
                            Требуется Milvus 2.4+ с REST API v2. Токен нужен только для защищённых
                            инстансов (Zilliz Cloud).
                          </div>
                        </>
                      )}

                      {(settings.ragProvider ?? 'local') === 'local' && (
                        <div className={`${styles.hint} ${styles.hintInline}`}>
                          Векторы хранятся в JSON-файле рядом с данными приложения. Подходит для
                          большинства пользователей — внешний сервер не нужен.
                        </div>
                      )}
                    </div>
                  </SettingItem>

                  {/* ── Jira ── */}
                  <SettingItem
                    tab="integrations"
                    label="Jira"
                    desc="jira rest api issue инструмент создание задач"
                  >
                    <div className={styles.section}>
                      <label>
                        URL Jira
                        <input
                          type="text"
                          placeholder="https://your-domain.atlassian.net"
                          value={settings.jiraUrl ?? ''}
                          onChange={(e) => onSettingsChange({ jiraUrl: e.target.value })}
                        />
                      </label>
                      <label>
                        API Token
                        <div className="settings-api-key-row">
                          <input
                            type={apiKeyVisible['jira'] ? 'text' : 'password'}
                            placeholder="(опционально)"
                            value={settings.jiraToken ?? ''}
                            onChange={(e) => onSettingsChange({ jiraToken: e.target.value })}
                            autoComplete="off"
                          />
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => toggleKeyVisible('jira')}
                            title={apiKeyVisible['jira'] ? 'Скрыть' : 'Показать'}
                          >
                            {apiKeyVisible['jira'] ? '🙈' : '👁'}
                          </button>
                        </div>
                      </label>
                      <div className={`${styles.hint} ${styles.hintInline}`}>
                        Создавайте Issue в Jira через инструмент агента. Используйте API Token
                        вместо пароля.
                      </div>
                    </div>
                  </SettingItem>

                  {/* ── MCP-серверы ── */}
                  <SettingItem
                    tab="integrations"
                    label="MCP-серверы"
                    desc="mcp model context protocol инструменты tools well-known интеграция сервер"
                  >
                    <div className={styles.section}>
                      <div className={styles.sectionLabel}>MCP-серверы</div>

                      {(settings.mcpServers ?? []).length > 0 ? (
                        <div className={styles.mcpServerList}>
                          {(settings.mcpServers ?? []).map((server) => (
                            <div key={server.url} className={styles.row}>
                              <div className={styles.rowContent}>
                                <span className={styles.mcpServerUrl}>{server.url}</span>
                                <span className={styles.mcpServerMeta}>
                                  {server.tools.length}{' '}
                                  {server.tools.length === 1 ? 'инструмент' : 'инструментов'}
                                </span>
                              </div>
                              <div className={styles.rowRight}>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  onClick={() => void handleRemoveMcpServer(server.url)}
                                  disabled={mcpBusy}
                                  title="Удалить сервер"
                                >
                                  Удалить
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={`${styles.hint} ${styles.hintInline}`}>
                          Подключённых MCP-серверов нет. Укажите URL и нажмите «+ Добавить» —
                          приложение загрузит инструменты из <code>/.well-known/mcp</code>.
                        </div>
                      )}

                      <label>
                        URL сервера
                        <div className="settings-api-key-row">
                          <input
                            placeholder="https://mcp.example.com"
                            value={mcpUrl}
                            onChange={(e) => {
                              setMcpUrl(e.target.value)
                              if (mcpError) setMcpError(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void handleAddMcpServer()
                              }
                            }}
                            disabled={mcpBusy}
                          />
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => void handleAddMcpServer()}
                            disabled={mcpBusy || !mcpUrl.trim()}
                          >
                            {mcpBusy ? '…' : '+ Добавить'}
                          </button>
                        </div>
                      </label>

                      {mcpError && <div className={styles.mcpError}>{mcpError}</div>}
                    </div>
                  </SettingItem>
                </>
              )}

              {!isSearching && tab === 'memory' && (
                <>
                  <MemoryPanel
                    projectPath={chatProjectPath}
                    selfLearning={settings.selfLearning !== false}
                    onSelfLearningChange={onSelfLearningChange}
                    githubToken={settings.githubToken}
                    refreshKey={memoryRefreshKey}
                  />

                  <SkillsPanel
                    projectPath={chatProjectPath}
                    githubToken={settings.githubToken}
                    refreshKey={skillsRefreshKey}
                  />
                </>
              )}

              {!isSearching && tab === 'plugins' && (
                <SettingItem
                  tab="plugins"
                  label="Плагины"
                  desc="Подключить дополнительные инструменты"
                >
                  <div className={styles.settingSection}>
                    <p>
                      Плагины хранятся в <code>~/.codeviper/plugins</code>. Откройте папку и
                      добавьте файлы <code>.js</code> с инструментами агента.
                    </p>
                    <button
                      className={styles.button}
                      onClick={() =>
                        (window as any).electron?.ipcRenderer.invoke('open-plugins-folder')
                      }
                    >
                      📂 Открыть папку
                    </button>
                  </div>
                </SettingItem>
              )}
            </div>
          </SearchCtx.Provider>
        </div>

        {!ollamaOnline && (
          <div className="hint">
            Ollama не отвечает. Установи с <strong>ollama.com</strong>, запусти приложение Ollama и
            нажми «Обновить Ollama» в верхней панели.
          </div>
        )}

        <div className={styles.about}>
          <span className={styles.aboutVersion}>CodeViper v{__APP_VERSION__}</span>
          <a
            className={styles.aboutLink}
            href="https://github.com/rkfsociety/CodeViper/issues"
            target="_blank"
            rel="noreferrer"
          >
            Сообщить об ошибке
          </a>
          <a
            className={styles.aboutLink}
            href="https://github.com/rkfsociety/CodeViper"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  )
}
