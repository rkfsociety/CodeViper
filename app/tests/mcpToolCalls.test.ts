import { describe, expect, it } from 'vitest'
import { extractEmbeddedToolCalls } from '../shared/toolCalls'
import { buildMcpAgentToolName } from '../electron/main/mcpTools'

describe('extractEmbeddedToolCalls with MCP tools', () => {
  it('распознаёт MCP-инструмент при передаче extraToolNames', () => {
    const toolName = buildMcpAgentToolName('https://mcp.example.com', 'search')
    const raw = JSON.stringify({ name: toolName, arguments: { query: 'test' } })
    const { toolCalls } = extractEmbeddedToolCalls(raw, [toolName])
    expect(toolCalls).toEqual([{ name: toolName, arguments: { query: 'test' } }])
  })
})
