import { createHash } from 'crypto'
import { MCP_MANIFEST_TIMEOUT_MS } from '../../shared/constants'
import { makeId } from '../../shared/makeId'
import type { McpServerConfig } from '../../src/types'
import { getEnabledMcpTools, normalizeMcpServerUrl } from './mcpRegistry'

export interface McpToolBinding {
  agentToolName: string
  serverUrl: string
  toolName: string
}

export type McpAgentToolDefinition = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

function serverKey(url: string): string {
  return createHash('sha256').update(normalizeMcpServerUrl(url)).digest('hex').slice(0, 10)
}

function sanitizeToolSegment(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '_')
  return cleaned || 'tool'
}

export function buildMcpAgentToolName(serverUrl: string, toolName: string): string {
  return `mcp_${serverKey(serverUrl)}_${sanitizeToolSegment(toolName)}`
}

export function buildMcpToolBindings(mcpServers?: McpServerConfig[]): McpToolBinding[] {
  if (!mcpServers?.length) return []

  const bindings: McpToolBinding[] = []
  for (const server of mcpServers) {
    for (const tool of getEnabledMcpTools(server)) {
      bindings.push({
        agentToolName: buildMcpAgentToolName(server.url, tool.name),
        serverUrl: server.url,
        toolName: tool.name
      })
    }
  }
  return bindings
}

export function getMcpAgentToolNames(mcpServers?: McpServerConfig[]): string[] {
  return buildMcpToolBindings(mcpServers).map((binding) => binding.agentToolName)
}

function normalizeToolParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  if (parameters.type === 'object') return parameters
  if (Object.keys(parameters).length === 0) {
    return { type: 'object', properties: {} }
  }
  return { type: 'object', properties: parameters, additionalProperties: true }
}

export function buildMcpAgentTools(mcpServers?: McpServerConfig[]): McpAgentToolDefinition[] {
  if (!mcpServers?.length) return []

  const tools: McpAgentToolDefinition[] = []
  for (const server of mcpServers) {
    for (const tool of getEnabledMcpTools(server)) {
      tools.push({
        type: 'function',
        function: {
          name: buildMcpAgentToolName(server.url, tool.name),
          description: `[MCP ${server.url}] ${tool.description}`,
          parameters: normalizeToolParameters(tool.parameters)
        }
      })
    }
  }
  return tools
}

export function resolveMcpToolBinding(
  agentToolName: string,
  mcpServers?: McpServerConfig[]
): McpToolBinding | null {
  return (
    buildMcpToolBindings(mcpServers).find((binding) => binding.agentToolName === agentToolName) ??
    null
  )
}

function coerceMcpArguments(args: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(args)) {
    if (key === '_raw') continue
    try {
      out[key] = JSON.parse(value)
    } catch {
      out[key] = value
    }
  }
  return out
}

export async function callMcpTool(
  serverUrl: string,
  toolName: string,
  args: Record<string, string>
): Promise<string> {
  const url = `${normalizeMcpServerUrl(serverUrl)}/tools/call`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MCP_MANIFEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        name: toolName,
        arguments: coerceMcpArguments(args)
      }),
      signal: controller.signal
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `MCP tools/call HTTP ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`
      )
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      const json: unknown = await response.json()
      if (typeof json === 'string') return json
      if (json && typeof json === 'object' && 'result' in (json as Record<string, unknown>)) {
        const result = (json as { result: unknown }).result
        return typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      }
      return JSON.stringify(json, null, 2)
    }

    return await response.text()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Таймаут вызова MCP-инструмента (${MCP_MANIFEST_TIMEOUT_MS / 1000} с)`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function sendMcpToolResult(
  serverUrl: string,
  toolCallId: string,
  result: string
): Promise<void> {
  const url = `${normalizeMcpServerUrl(serverUrl)}/tools/result`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MCP_MANIFEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ toolCallId, result }),
      signal: controller.signal
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `MCP tools/result HTTP ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`
      )
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Таймаут отправки результата MCP (${MCP_MANIFEST_TIMEOUT_MS / 1000} с)`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function notifyMcpToolResult(
  agentToolName: string,
  toolCallId: string | undefined,
  result: string,
  mcpServers?: McpServerConfig[]
): Promise<void> {
  const binding = resolveMcpToolBinding(agentToolName, mcpServers)
  if (!binding) return

  const id = toolCallId?.trim() || makeId()
  await sendMcpToolResult(binding.serverUrl, id, result)
}

export function createMcpToolHandlers(
  mcpServers?: McpServerConfig[]
): Record<string, (args: Record<string, string>) => Promise<string>> {
  const handlers: Record<string, (args: Record<string, string>) => Promise<string>> = {}

  for (const binding of buildMcpToolBindings(mcpServers)) {
    handlers[binding.agentToolName] = async (args) => {
      try {
        return await callMcpTool(binding.serverUrl, binding.toolName, args)
      } catch (error) {
        return `Ошибка: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  return handlers
}
