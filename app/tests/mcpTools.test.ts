import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildMcpAgentToolName,
  buildMcpAgentTools,
  callMcpTool,
  getMcpAgentToolNames,
  resolveMcpToolBinding
} from '../electron/main/mcpTools'

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
})
