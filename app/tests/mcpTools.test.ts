import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAgentTools, invalidatePluginToolsCache } from '../electron/main/agentTools'
import {
  buildMcpAgentToolName,
  buildMcpAgentTools,
  callMcpTool,
  getMcpAgentToolNames,
  notifyMcpToolResult,
  resolveMcpToolBinding,
  sendMcpToolResult
} from '../electron/main/mcpTools'
import { isMcpToolEnabled } from '../electron/main/mcpRegistry'

describe('mcpTools', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const servers = [
    {
      url: 'https://mcp.example.com',
      tools: [
        {
          name: 'search',
          description: 'Search docs',
          parameters: { type: 'object', properties: { query: { type: 'string' } } }
        }
      ]
    }
  ]

  it('buildMcpAgentToolName стабилен для одного сервера', () => {
    const a = buildMcpAgentToolName('https://mcp.example.com', 'search')
    const b = buildMcpAgentToolName('https://mcp.example.com/', 'search')
    expect(a).toBe(b)
    expect(a.startsWith('mcp_')).toBe(true)
  })

  it('buildMcpAgentTools добавляет префикс MCP в описание', () => {
    const tools = buildMcpAgentTools(servers)
    expect(tools).toHaveLength(1)
    expect(tools[0].function.description).toContain('[MCP https://mcp.example.com]')
    expect(tools[0].function.name).toBe(buildMcpAgentToolName('https://mcp.example.com', 'search'))
  })

  it('resolveMcpToolBinding находит привязку по agent tool name', () => {
    const name = buildMcpAgentToolName('https://mcp.example.com', 'search')
    expect(resolveMcpToolBinding(name, servers)).toEqual({
      agentToolName: name,
      serverUrl: 'https://mcp.example.com',
      toolName: 'search'
    })
  })

  it('getMcpAgentToolNames возвращает имена для Ollama text parsing', () => {
    expect(getMcpAgentToolNames(servers)).toEqual([
      buildMcpAgentToolName('https://mcp.example.com', 'search')
    ])
  })

  it('callMcpTool POST на /tools/call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ result: 'ok' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await callMcpTool('https://mcp.example.com', 'search', { query: 'hello' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://mcp.example.com/tools/call',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'search', arguments: { query: 'hello' } })
      })
    )
    expect(result).toBe('ok')
  })

  it('sendMcpToolResult POST на /tools/result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await sendMcpToolResult('https://mcp.example.com', 'call-123', 'done')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://mcp.example.com/tools/result',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ toolCallId: 'call-123', result: 'done' })
      })
    )
  })

  it('notifyMcpToolResult использует makeId если toolCallId отсутствует', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const toolName = buildMcpAgentToolName('https://mcp.example.com', 'search')
    await notifyMcpToolResult(toolName, undefined, 'ok', servers)

    expect(fetchMock).toHaveBeenCalledOnce()
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      toolCallId: string
      result: string
    }
    expect(body.result).toBe('ok')
    expect(body.toolCallId).toBeTruthy()
  })

  it('enabledTools фильтрует инструменты сервера', () => {
    const multiToolServers = [
      {
        url: 'https://mcp.example.com',
        enabledTools: ['toolA'],
        tools: [
          { name: 'toolA', description: 'A', parameters: {} },
          { name: 'toolB', description: 'B', parameters: {} }
        ]
      }
    ]

    expect(isMcpToolEnabled(multiToolServers[0], 'toolA')).toBe(true)
    expect(isMcpToolEnabled(multiToolServers[0], 'toolB')).toBe(false)

    const tools = buildMcpAgentTools(multiToolServers)
    expect(tools).toHaveLength(1)
    expect(tools[0].function.name).toBe(buildMcpAgentToolName('https://mcp.example.com', 'toolA'))
    expect(getMcpAgentToolNames(multiToolServers)).toHaveLength(1)
  })

  it('getAgentTools включает только enabledTools MCP-сервера', () => {
    invalidatePluginToolsCache()
    const mcpServers = [
      {
        url: 'https://mcp.example.com',
        enabledTools: ['toolA'],
        tools: [
          { name: 'toolA', description: 'A', parameters: {} },
          { name: 'toolB', description: 'B', parameters: {} }
        ]
      }
    ]

    const toolNames = getAgentTools(false, undefined, mcpServers).map((tool) => tool.name)
    const toolA = buildMcpAgentToolName('https://mcp.example.com', 'toolA')
    const toolB = buildMcpAgentToolName('https://mcp.example.com', 'toolB')

    expect(toolNames).toContain(toolA)
    expect(toolNames).not.toContain(toolB)
  })

  it('без enabledTools все MCP-инструменты включены', () => {
    const multiToolServers = [
      {
        url: 'https://mcp.example.com',
        tools: [
          { name: 'toolA', description: 'A', parameters: {} },
          { name: 'toolB', description: 'B', parameters: {} }
        ]
      }
    ]

    expect(buildMcpAgentTools(multiToolServers)).toHaveLength(2)
  })
})
