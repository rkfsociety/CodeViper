/** JSON-конфиг stdio MCP-сервера (формат Cursor / Claude Desktop mcp.json). */
export interface McpStdioServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

export type McpStdioTemplateId = 'filesystem' | 'fetch'

export const MCP_STDIO_TEMPLATE_IDS: McpStdioTemplateId[] = ['filesystem', 'fetch']

export function buildMcpStdioTemplate(
  id: McpStdioTemplateId,
  options?: { projectPath?: string }
): McpStdioServerConfig {
  switch (id) {
    case 'filesystem':
      return {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', options?.projectPath?.trim() || '.']
      }
    case 'fetch':
      return {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-fetch']
      }
  }
}

export function addMcpStdioTemplate(
  current: Record<string, McpStdioServerConfig> | undefined,
  id: McpStdioTemplateId,
  options?: { projectPath?: string }
): Record<string, McpStdioServerConfig> {
  if (current?.[id]) {
    throw new Error(`Шаблон «${id}» уже добавлен`)
  }
  return {
    ...(current ?? {}),
    [id]: buildMcpStdioTemplate(id, options)
  }
}

export function removeMcpStdioTemplate(
  current: Record<string, McpStdioServerConfig> | undefined,
  id: string
): Record<string, McpStdioServerConfig> | undefined {
  if (!current?.[id]) return current
  const next = { ...current }
  delete next[id]
  return Object.keys(next).length > 0 ? next : undefined
}
