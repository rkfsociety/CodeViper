import { z } from 'zod'
import { MCP_HEALTH_CHECK_TIMEOUT_MS, MCP_MANIFEST_TIMEOUT_MS } from '../../shared/constants'
import type {
  AgentSettings,
  McpHealthResult,
  McpServerConfig,
  McpToolDefinition
} from '../../src/types'
import type { PersistedSettings } from './settings'
import { saveSettings } from './settings'

const McpToolSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()).default({})
})

const McpManifestSchema = z.object({
  tools: z.array(McpToolSchema).min(1, 'MCP-манифест не содержит инструментов')
})

export function normalizeMcpServerUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('URL MCP-сервера не может быть пустым')
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    throw new Error('Некорректный URL MCP-сервера')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('URL MCP-сервера должен начинаться с http:// или https://')
  }

  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

export function buildMcpManifestUrl(serverUrl: string): string {
  return `${normalizeMcpServerUrl(serverUrl)}/.well-known/mcp`
}

export async function fetchMcpManifest(
  serverUrl: string,
  options?: { timeoutMs?: number }
): Promise<McpServerConfig> {
  const url = normalizeMcpServerUrl(serverUrl)
  const manifestUrl = buildMcpManifestUrl(url)
  const timeoutMs = options?.timeoutMs ?? MCP_MANIFEST_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(manifestUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    })

    if (!response.ok) {
      throw new Error(`MCP-сервер ответил HTTP ${response.status}`)
    }

    const json: unknown = await response.json()
    const parsed = McpManifestSchema.safeParse(json)
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => issue.message).join('; ')
      throw new Error(`Некорректный MCP-манифест: ${details}`)
    }

    return {
      url,
      tools: parsed.data.tools
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Таймаут запроса MCP-манифеста (${timeoutMs / 1000} с)`)
    }
    if (error instanceof Error) throw error
    throw new Error('Не удалось загрузить MCP-манифест')
  } finally {
    clearTimeout(timer)
  }
}

/** undefined = все включены; явный список = только перечисленные; [] = ни одного */
export function isMcpToolEnabled(server: McpServerConfig, toolName: string): boolean {
  if (server.enabledTools === undefined) return true
  return server.enabledTools.includes(toolName)
}

export function getEnabledMcpTools(server: McpServerConfig): McpToolDefinition[] {
  return server.tools.filter((tool) => isMcpToolEnabled(server, tool.name))
}

function hasMcpServer(settings: AgentSettings, serverUrl: string): boolean {
  const normalized = normalizeMcpServerUrl(serverUrl)
  return (settings.mcpServers ?? []).some(
    (entry) => normalizeMcpServerUrl(entry.url) === normalized
  )
}

export async function addMcpServer(
  settings: AgentSettings,
  serverUrl: string
): Promise<PersistedSettings> {
  const manifest = await fetchMcpManifest(serverUrl)

  if (hasMcpServer(settings, manifest.url)) {
    throw new Error('Этот MCP-сервер уже добавлен')
  }

  return saveSettings({
    ...settings,
    mcpServers: [...(settings.mcpServers ?? []), manifest]
  })
}

export async function removeMcpServer(
  settings: AgentSettings,
  serverUrl: string
): Promise<PersistedSettings> {
  const normalized = normalizeMcpServerUrl(serverUrl)
  const nextServers = (settings.mcpServers ?? []).filter(
    (entry) => normalizeMcpServerUrl(entry.url) !== normalized
  )

  if (nextServers.length === (settings.mcpServers ?? []).length) {
    throw new Error('MCP-сервер не найден в настройках')
  }

  return saveSettings({
    ...settings,
    mcpServers: nextServers
  })
}

export async function pingMcpServer(serverUrl: string): Promise<McpHealthResult> {
  const url = normalizeMcpServerUrl(serverUrl)
  try {
    await fetchMcpManifest(url, { timeoutMs: MCP_HEALTH_CHECK_TIMEOUT_MS })
    return { url, ok: true }
  } catch (error) {
    return {
      url,
      ok: false,
      error: error instanceof Error ? error.message : 'Не удалось подключиться к MCP-серверу'
    }
  }
}

export async function healthCheckMcpServers(
  servers: McpServerConfig[]
): Promise<McpHealthResult[]> {
  if (servers.length === 0) return []
  const settled = await Promise.allSettled(servers.map((server) => pingMcpServer(server.url)))
  return settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value
    const url = servers[index]?.url ?? ''
    return {
      url,
      ok: false,
      error: result.reason instanceof Error ? result.reason.message : 'Ошибка проверки MCP'
    }
  })
}

export async function refreshMcpServer(
  settings: AgentSettings,
  serverUrl: string
): Promise<PersistedSettings> {
  const normalized = normalizeMcpServerUrl(serverUrl)
  const manifest = await fetchMcpManifest(normalized)
  const hasServer = (settings.mcpServers ?? []).some(
    (entry) => normalizeMcpServerUrl(entry.url) === normalized
  )

  if (!hasServer) {
    throw new Error('MCP-сервер не найден в настройках')
  }

  const nextServers = (settings.mcpServers ?? []).map((entry) => {
    if (normalizeMcpServerUrl(entry.url) !== normalized) return entry
    const enabledTools = entry.enabledTools?.filter((name) =>
      manifest.tools.some((tool) => tool.name === name)
    )
    return {
      ...manifest,
      ...(entry.enabledTools !== undefined ? { enabledTools } : {})
    }
  })

  return saveSettings({
    ...settings,
    mcpServers: nextServers
  })
}
