import { useState, useEffect } from 'react'
import styles from './SettingsModal.module.css'
import type { AgentSettings, McpHealthResult, McpServerConfig } from '../../types'
import {
  addMcpStdioTemplate,
  MCP_STDIO_TEMPLATE_IDS,
  removeMcpStdioTemplate,
  type McpStdioTemplateId
} from '../../../shared/mcpServerTemplates'
import { SettingItem } from './shared'

interface Props {
  isActive: boolean
  isSearching: boolean
  settings: AgentSettings
  chatProjectPath?: string
  onSettingsChange: (patch: Partial<AgentSettings>) => void
}

export function McpTab({
  isActive,
  isSearching,
  settings,
  chatProjectPath,
  onSettingsChange
}: Props) {
  const [mcpUrl, setMcpUrl] = useState('')
  const [mcpBusy, setMcpBusy] = useState(false)
  const [mcpError, setMcpError] = useState<string | null>(null)
  const [mcpTemplateError, setMcpTemplateError] = useState<string | null>(null)
  const [mcpHealth, setMcpHealth] = useState<Record<string, McpHealthResult>>({})

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

  function handleAddMcpTemplate(id: McpStdioTemplateId) {
    setMcpTemplateError(null)
    try {
      const next = addMcpStdioTemplate(settings.mcpStdioServers, id, {
        projectPath: chatProjectPath
      })
      onSettingsChange({ mcpStdioServers: next })
    } catch (error) {
      setMcpTemplateError(error instanceof Error ? error.message : 'Не удалось добавить шаблон')
    }
  }

  function handleRemoveMcpTemplate(id: string) {
    setMcpTemplateError(null)
    onSettingsChange({ mcpStdioServers: removeMcpStdioTemplate(settings.mcpStdioServers, id) })
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

  function mcpHealthBadge(url: string): { icon: string; title?: string } {
    const health = mcpHealth[url]
    if (!health) return { icon: '⏳', title: 'Проверка подключения…' }
    if (health.ok) return { icon: '✅', title: 'Сервер доступен' }
    return { icon: '⚠️', title: health.error ?? 'Сервер недоступен' }
  }

  return (
    <SettingItem
      tab="mcp"
      label="MCP-серверы"
      desc="mcp model context protocol инструменты tools well-known интеграция сервер stdio"
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
                        {server.tools.filter((tool) => isMcpToolEnabled(server, tool.name)).length}/
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
            Подключённых MCP-серверов нет. Укажите URL и нажмите «+ Добавить» — приложение загрузит
            инструменты из <code>/.well-known/mcp</code>.
          </div>
        )}

        <div className={styles.mcpTemplateSection}>
          <div className={styles.sectionLabel}>Шаблоны stdio</div>
          <div className={`${styles.hint} ${styles.hintInline}`}>
            Готовый JSON как в Cursor <code>mcp.json</code> — сохраняется в настройках. Запуск
            stdio-серверов — в следующих версиях; HTTP-серверы выше работают сразу.
          </div>
          <div className={styles.mcpTemplateButtons}>
            {MCP_STDIO_TEMPLATE_IDS.map((id) => {
              const added = Boolean(settings.mcpStdioServers?.[id])
              return (
                <button
                  key={id}
                  type="button"
                  className="btn btn-sm"
                  disabled={added}
                  title={
                    added
                      ? `Шаблон «${id}» уже в настройках`
                      : `Добавить шаблон «${id}» в settings.json`
                  }
                  onClick={() => handleAddMcpTemplate(id)}
                >
                  {added ? `✓ ${id}` : `+ ${id}`}
                </button>
              )
            })}
          </div>

          {Object.keys(settings.mcpStdioServers ?? {}).length > 0 && (
            <div className={styles.mcpServerList}>
              {Object.entries(settings.mcpStdioServers ?? {}).map(([id, config]) => (
                <div key={id} className={styles.mcpServerBlock}>
                  <div className={styles.row}>
                    <div className={styles.rowContent}>
                      <span className={styles.mcpServerUrl}>{id}</span>
                      <span className={styles.mcpServerMeta}>stdio · JSON</span>
                    </div>
                    <div className={styles.rowRight}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleRemoveMcpTemplate(id)}
                        title="Удалить шаблон"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                  <pre className={styles.mcpTemplateJson}>{JSON.stringify(config, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}

          {mcpTemplateError && <div className={styles.mcpError}>{mcpTemplateError}</div>}
        </div>

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
  )
}
