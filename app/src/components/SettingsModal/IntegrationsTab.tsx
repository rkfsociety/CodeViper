import { useState, useEffect } from 'react'
import styles from './SettingsModal.module.css'
import type { AgentSettings, McpHealthResult, McpServerConfig } from '../../types'
import { SettingItem } from './shared'
import { P2PConsentModal } from '../P2PConsentModal'

interface Props {
  isActive: boolean
  isSearching: boolean
  settings: AgentSettings
  onSettingsChange: (patch: Partial<AgentSettings>) => void
}

export function IntegrationsTab({ isActive, isSearching, settings, onSettingsChange }: Props) {
  const [apiKeyVisible, setApiKeyVisible] = useState<Record<string, boolean>>({})
  const [qdrantPingState, setQdrantPingState] = useState<'idle' | 'checking' | 'ok' | 'fail'>(
    'idle'
  )
  const [milvusPingState, setMilvusPingState] = useState<'idle' | 'checking' | 'ok' | 'fail'>(
    'idle'
  )
  const [mcpUrl, setMcpUrl] = useState('')
  const [mcpBusy, setMcpBusy] = useState(false)
  const [mcpError, setMcpError] = useState<string | null>(null)
  const [mcpHealth, setMcpHealth] = useState<Record<string, McpHealthResult>>({})
  const [p2pRegistering, setP2pRegistering] = useState(false)
  const [p2pStatus, setP2pStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [p2pConsentOpen, setP2pConsentOpen] = useState(false)

  useEffect(() => {
    return window.codeviper.onMcpHealthStatus(({ results }) => {
      setMcpHealth((prev) => {
        const next = { ...prev }
        for (const result of results) {
          next[result.url] = result
        }
        return next
      })
    })
  }, [])

  useEffect(() => {
    if (!isActive) return
    const servers = settings.mcpServers ?? []
    if (servers.length === 0) {
      setMcpHealth({})
      return
    }
    let active = true
    void window.codeviper.checkMcpHealth(settings).then(({ results }) => {
      if (!active) return
      setMcpHealth((prev) => {
        const next = { ...prev }
        for (const result of results) {
          next[result.url] = result
        }
        return next
      })
    })
    return () => {
      active = false
    }
  }, [isActive, settings])

  if (!isActive && !isSearching) return null

  function toggleKeyVisible(key: string) {
    setApiKeyVisible((prev) => ({ ...prev, [key]: !prev[key] }))
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

  function isMcpToolEnabled(server: McpServerConfig, toolName: string): boolean {
    if (server.enabledTools === undefined) return true
    return server.enabledTools.includes(toolName)
  }

  function handleToggleMcpTool(serverUrl: string, toolName: string, enabled: boolean) {
    const nextServers = (settings.mcpServers ?? []).map((server) => {
      if (server.url !== serverUrl) return server

      const allNames = server.tools.map((tool) => tool.name)
      const enabledSet = new Set(server.enabledTools === undefined ? allNames : server.enabledTools)

      if (enabled) {
        enabledSet.add(toolName)
      } else {
        enabledSet.delete(toolName)
      }

      const enabledTools = [...enabledSet]
      if (enabledTools.length === allNames.length) {
        return { ...server, enabledTools: undefined }
      }
      return { ...server, enabledTools }
    })

    onSettingsChange({ mcpServers: nextServers })
  }

  async function handleRegisterP2p() {
    if (p2pRegistering) return
    setP2pRegistering(true)
    setP2pStatus(null)
    try {
      const result = await window.codeviper.registerP2pNode(settings)
      if (result.ok && result.nodeKeys) {
        onSettingsChange({
          p2pNodePrivateKey: result.nodeKeys.privateKey,
          p2pNodePublicKey: result.nodeKeys.publicKey
        })
      }
      setP2pStatus({ ok: result.ok, message: result.message })
    } catch (e) {
      setP2pStatus({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setP2pRegistering(false)
    }
  }

  const qdrantIcon =
    qdrantPingState === 'checking'
      ? '⏳'
      : qdrantPingState === 'ok'
        ? '✅'
        : qdrantPingState === 'fail'
          ? '❌'
          : '🔌'

  const milvusIcon =
    milvusPingState === 'checking'
      ? '⏳'
      : milvusPingState === 'ok'
        ? '✅'
        : milvusPingState === 'fail'
          ? '❌'
          : '🔌'

  function mcpHealthBadge(url: string): { icon: string; title?: string } {
    const health = mcpHealth[url]
    if (!health) return { icon: '⏳', title: 'Проверка подключения…' }
    if (health.ok) return { icon: '✅', title: 'Сервер доступен' }
    return { icon: '⚠️', title: health.error ?? 'Сервер недоступен' }
  }

  return (
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
            Personal Access Token с правами <code>repo</code> (синхронизация знаний на GitHub) и{' '}
            <code>gist</code> (кнопка «Поделиться»). Создать:{' '}
            <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer">
              github.com/settings/tokens
            </a>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                const r = await window.codeviper.checkGitHubAuth()
                window.alert(r.formatted)
              } catch (e) {
                window.alert(e instanceof Error ? e.message : String(e))
              }
            }}
            style={{
              marginTop: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              fontSize: '14px'
            }}
          >
            Проверить GitHub / git
          </button>
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
                    disabled={qdrantPingState === 'checking' || !settings.qdrantUrl?.trim()}
                    title="Проверить подключение"
                  >
                    {qdrantIcon}
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
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={settings.autoIndexOnOpen === true}
                  onChange={(e) =>
                    onSettingsChange({ autoIndexOnOpen: e.target.checked || undefined })
                  }
                />
                <span className={styles.track} aria-hidden="true">
                  <span className={styles.thumb} />
                </span>
                <span className={styles.toggleContent}>
                  <span className={styles.title}>Автоиндексация при открытии проекта</span>
                  <span className={styles.desc}>
                    При смене проекта файлы индексируются в Qdrant в фоне. Прогресс отображается в
                    статусбаре.
                  </span>
                </span>
              </label>
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
                    disabled={milvusPingState === 'checking' || !settings.milvusUrl?.trim()}
                    title="Проверить подключение"
                  >
                    {milvusIcon}
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
                Требуется Milvus 2.4+ с REST API v2. Токен нужен только для защищённых инстансов
                (Zilliz Cloud).
              </div>
            </>
          )}

          {(settings.ragProvider ?? 'local') === 'local' && (
            <div className={`${styles.hint} ${styles.hintInline}`}>
              Векторы хранятся в JSON-файле рядом с данными приложения. Подходит для большинства
              пользователей — внешний сервер не нужен.
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
            Создавайте Issue в Jira через инструмент агента. Используйте API Token вместо пароля.
          </div>
        </div>
      </SettingItem>

      {/* ── Linear ── */}
      <SettingItem
        tab="integrations"
        label="Linear"
        desc="linear graphql api issue инструмент создание задач"
      >
        <div className={styles.section}>
          <label>
            API Key
            <div className="settings-api-key-row">
              <input
                type={apiKeyVisible['linear'] ? 'text' : 'password'}
                placeholder="(опционально)"
                value={settings.linearApiKey ?? ''}
                onChange={(e) => onSettingsChange({ linearApiKey: e.target.value })}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => toggleKeyVisible('linear')}
                title={apiKeyVisible['linear'] ? 'Скрыть' : 'Показать'}
              >
                {apiKeyVisible['linear'] ? '🙈' : '👁'}
              </button>
            </div>
          </label>
          <div className={`${styles.hint} ${styles.hintInline}`}>
            Создавайте Issue в Linear через инструмент агента. Получите API Key на{' '}
            <a href="https://linear.app/settings/api" target="_blank" rel="noreferrer">
              linear.app/settings/api
            </a>
          </div>
        </div>
      </SettingItem>

      {/* ── P2P: поделиться мощностью ── */}
      <SettingItem
        tab="integrations"
        label="P2P: поделиться мощностью"
        desc="p2p share compute node сеть мощность ресурсы поделиться узел"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Поделиться мощностью (P2P)</div>
          <label className={styles.toggleRow}>
            <span>Регистрировать этот узел в P2P-сети</span>
            <input
              type="checkbox"
              checked={settings.shareCompute ?? false}
              onChange={(e) => {
                if (e.target.checked && !settings.p2pConsentGiven) {
                  setP2pConsentOpen(true)
                } else {
                  onSettingsChange({ shareCompute: e.target.checked })
                }
              }}
            />
          </label>
          <div className={`${styles.hint} ${styles.hintInline}`}>
            Ваша модель и эндпоинт Ollama будут доступны другим участникам сети.
            {!settings.p2pConsentGiven && <> При первом включении потребуется подтверждение.</>}
          </div>
          <label>
            URL сигнального сервера
            <input
              className={styles.input}
              placeholder="http://localhost:4242"
              value={settings.p2pServerUrl ?? ''}
              onChange={(e) => onSettingsChange({ p2pServerUrl: e.target.value })}
            />
          </label>
          <label>
            Bearer-токен
            <input
              className={styles.input}
              type="password"
              placeholder="Токен из /auth/login"
              value={settings.p2pAuthToken ?? ''}
              onChange={(e) => onSettingsChange({ p2pAuthToken: e.target.value })}
            />
          </label>
          <div className={styles.row} style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void handleRegisterP2p()}
              disabled={p2pRegistering || !settings.p2pServerUrl || !settings.p2pAuthToken}
            >
              {p2pRegistering ? 'Регистрация…' : 'Зарегистрировать узел'}
            </button>
          </div>
          {p2pStatus && (
            <div
              className={`${styles.hint} ${styles.hintInline}`}
              style={{ color: p2pStatus.ok ? 'var(--color-success)' : 'var(--color-error)' }}
            >
              {p2pStatus.ok ? '✓ ' : '✗ '}
              {p2pStatus.message}
            </div>
          )}
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
              {(settings.mcpServers ?? []).map((server) => {
                const healthBadge = mcpHealthBadge(server.url)
                return (
                  <div key={server.url} className={styles.mcpServerBlock}>
                    <div className={styles.row}>
                      <div className={styles.rowContent}>
                        <span
                          className={styles.mcpHealthBadge}
                          title={healthBadge.title}
                          aria-label={healthBadge.title}
                        >
                          {healthBadge.icon}
                        </span>
                        <span className={styles.mcpServerUrl}>{server.url}</span>
                        <span className={styles.mcpServerMeta}>
                          {
                            server.tools.filter((tool) => isMcpToolEnabled(server, tool.name))
                              .length
                          }
                          /{server.tools.length}{' '}
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
                    {server.tools.length > 0 && (
                      <div className={styles.mcpToolList}>
                        {server.tools.map((tool) => (
                          <label key={tool.name} className={styles.mcpToolRow}>
                            <input
                              type="checkbox"
                              checked={isMcpToolEnabled(server, tool.name)}
                              disabled={mcpBusy}
                              onChange={(e) =>
                                handleToggleMcpTool(server.url, tool.name, e.target.checked)
                              }
                            />
                            <span className={styles.mcpToolName} title={tool.description}>
                              {tool.name}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className={`${styles.hint} ${styles.hintInline}`}>
              Подключённых MCP-серверов нет. Укажите URL и нажмите «+ Добавить» — приложение
              загрузит инструменты из <code>/.well-known/mcp</code>.
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

      <P2PConsentModal
        open={p2pConsentOpen}
        onAccept={() => {
          setP2pConsentOpen(false)
          onSettingsChange({ p2pConsentGiven: true, shareCompute: true })
        }}
        onDecline={() => {
          setP2pConsentOpen(false)
          onSettingsChange({ shareCompute: false })
        }}
      />
    </>
  )
}
