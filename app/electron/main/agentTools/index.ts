import type { McpServerConfig } from '../../../src/types'
import { buildMcpAgentTools } from '../mcpTools'
import { loadPlugins } from '../pluginLoader'
import { FILE_TOOLS, GIT_TOOLS, PACKAGE_TOOLS } from './core'
import {
  GITHUB_TOOLS,
  GITLAB_TOOLS,
  JIRA_TOOLS,
  LINEAR_TOOLS,
  MEMORY_TOOLS,
  SKILLS_TOOLS,
  TODO_TOOLS,
  SECURITY_TOOLS,
  WEB_TOOLS
} from './integrations'
import { INDEXING_TOOLS, SUBAGENT_TOOLS } from './mcp'

export {
  FILE_TOOLS,
  GIT_TOOLS,
  PACKAGE_TOOLS,
  GITHUB_TOOLS,
  GITLAB_TOOLS,
  JIRA_TOOLS,
  LINEAR_TOOLS,
  MEMORY_TOOLS,
  SKILLS_TOOLS,
  TODO_TOOLS,
  SECURITY_TOOLS,
  WEB_TOOLS,
  INDEXING_TOOLS,
  SUBAGENT_TOOLS
}

function getPluginTools() {
  return loadPlugins().flatMap((plugin) => plugin.tools)
}

export const AGENT_TOOLS = [
  ...FILE_TOOLS,
  ...GIT_TOOLS,
  ...GITHUB_TOOLS,
  ...GITLAB_TOOLS,
  ...JIRA_TOOLS,
  ...LINEAR_TOOLS,
  ...MEMORY_TOOLS,
  ...PACKAGE_TOOLS,
  ...SKILLS_TOOLS,
  ...TODO_TOOLS,
  ...SECURITY_TOOLS,
  ...INDEXING_TOOLS,
  ...WEB_TOOLS,
  ...SUBAGENT_TOOLS
] as const

export type ToolName = (typeof AGENT_TOOLS)[number]['function']['name']

const transformedToolsCache = new Map<
  string,
  Array<{ name: string; description: string; input_schema: Record<string, unknown> }>
>()

export function invalidatePluginToolsCache(): void {
  transformedToolsCache.clear()
}

function transformTools(
  tools: Array<{
    function: { name: string; description: string; parameters: Record<string, unknown> }
  }>
) {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters
  }))
}

export function getAgentTools(disabledTools?: string[], mcpServers?: McpServerConfig[]) {
  const disabled = disabledTools?.length ? new Set(disabledTools) : null

  const filtered = AGENT_TOOLS.filter((t) => !disabled || !disabled.has(t.function.name))

  const mcpTools = buildMcpAgentTools(mcpServers).filter(
    (tool) => !disabled || !disabled.has(tool.function.name)
  )
  const pluginTools = getPluginTools()
  const allTools = [...filtered, ...pluginTools, ...mcpTools]

  const disabledKey = disabled ? [...disabled].sort().join(',') : ''
  const mcpKey = mcpServers?.length
    ? mcpServers
        .map(
          (server) =>
            `${server.url}:${server.enabledTools?.slice().sort().join('+') ?? '*'}:${server.tools.map((tool) => tool.name).join(',')}`
        )
        .join('|')
    : ''
  const pluginKey = pluginTools
    .map((tool) => `${tool.function.name}:${tool.function.description}`)
    .sort()
    .join('|')
  const cacheKey = `${disabledKey}_${mcpKey}_${pluginKey}`
  if (!transformedToolsCache.has(cacheKey)) {
    transformedToolsCache.set(cacheKey, transformTools(allTools))
  }

  return transformedToolsCache.get(cacheKey)!
}

export function formatAgentToolsSummary(): string {
  const pluginTools = getPluginTools()
  return [...AGENT_TOOLS, ...pluginTools]
    .map((tool) => `- **${tool.function.name}** — ${tool.function.description}`)
    .join('\n')
}

export interface ToolArgs {
  search_knowledge_base: { query: string; collection?: string; limit?: string }
  list_directory: { path?: string; max_depth?: string }
  grep_files: { query: string; path?: string }
  find_files: { pattern: string; path?: string }
  find_symbol: { name: string; path?: string }
  find_references: { name: string; path?: string }
  find_slow_code: { path?: string }
  find_missing_tests: { path?: string }
  find_rerender_candidates: { path?: string }
  find_import_issues: { path?: string }
  find_unsafe_regex: { path?: string }
  find_magic_numbers: { path?: string }
  find_merge_conflicts: { path?: string }
  find_dead_code: { path?: string }
  find_settings_path_issues: Record<string, never>
  find_type_mismatches: { path?: string }
  find_hotkey_conflicts: { path?: string }
  generate_dependency_diagram: { path?: string; focus?: string }
  generate_class_diagram: { path?: string }
  generate_dataflow_diagram: { path?: string; focus?: string }
  generate_project_metrics: { path?: string }
  search_in_project: { query: string; type: 'content' | 'name'; path?: string }
  read_file: { path: string; offset?: string; limit?: string }
  read_multiple_files: { paths: string[] }
  file_info: { path: string }
  project_stats: { path?: string }
  search_in_file: { path: string; query: string; context_lines?: string }
  show_file_history: { path: string }
  preview_edit: { path: string; content: string }
  preview_patch: { path: string; old_string: string; new_string: string; replace_all?: string }
  write_file: { path: string; content: string }
  create_file: { path: string; content: string }
  edit_file: { path: string; old_string: string; new_string: string; replace_all?: string }
  undo_edit: { path: string }
  append_file: { path: string; content: string }
  delete_file: { path: string }
  move_file: { from: string; to: string }
  copy_file: { from: string; to: string }
  rename_folder: { from: string; to: string }
  copy_folder: { from: string; to: string }
  run_command: { command: string }
  run_script: { interpreter: 'python' | 'powershell' | 'bash'; script: string; cwd?: string }
  review_code: { path: string }
  format_project: { path?: string; formatter?: 'auto' | 'prettier' | 'black' }
  git_status: { path?: string }
  git_diff: { path?: string; staged?: string; commit?: string }
  git_log: { limit?: string; path?: string; oneline?: string }
  find_commit_message_issues: { limit?: string }
  git_commit: { message: string }
  git_push: { remote?: string; branch?: string }
  git_checkout: { branch: string; force?: string }
  git_stash: { message?: string }
  git_stash_pop: Record<string, never>
  create_issue: { title: string; body?: string; labels?: string }
  report_trace_to_github: { note?: string }
  create_pr: { title?: string; body?: string }
  list_issues: Record<string, never>
  list_pull_requests: Record<string, never>
  open_issue: { number: string }
  trigger_github_workflow: { workflow_id: string; ref?: string; fields?: string }
  check_github_auth: Record<string, never>
  list_gitlab_mrs: Record<string, never>
  create_gitlab_mr: {
    source_branch: string
    target_branch: string
    title: string
    description?: string
  }
  get_gitlab_pipeline: { pipeline_id?: string }
  create_jira_issue: {
    summary: string
    description?: string
    issue_type?: string
    project_key: string
  }
  create_linear_issue: {
    title: string
    description?: string
    team_key: string
    priority?: string
  }
  recent_changes: { path?: string; limit?: string }
  remember: { content: string; category: string; tags?: string; scope?: string }
  package_info: { path?: string }
  read_package_lock: { path?: string }
  dependency_summary: { path?: string }
  test_summary: { path?: string }
  find_heavy_dependencies: { path?: string }
  find_aria_issues: { path?: string; files?: string[] }
  find_integration_url_issues: Record<string, never>
  find_cron_issues: Record<string, never>
  search_memory: { query: string }
  forget: { id: string }
  file_search_summary: { query: string; path?: string }
  set_todo_list: {
    items: Array<{ id: string; title?: string; text?: string }> | string
    title?: string
  }
  complete_todo_item: { id: string }
  clear_todo_list: Record<string, never>
  list_skills: Record<string, never>
  read_skill: { id: string }
  create_skill: {
    name: string
    description: string
    instructions: string
    triggers?: string
    id?: string
  }
  update_skill: {
    id: string
    name?: string
    description?: string
    instructions?: string
    triggers?: string
  }
  delete_skill: { id: string }
  read_skill_data: { skill_id: string }
  write_skill_data: { skill_id: string; content: string }
  index_project: Record<string, never>
  web_fetch: {
    url: string
    max_chars?: number
  }
  web_search: {
    query: string
    max_results?: number
  }
  check_cve: {
    cve_id?: string
    keyword?: string
    package?: string
    version?: string
    ecosystem?: string
    max_results?: number
  }
  delegate_to_editor: {
    task: string
    context?: string
  }
  run_tests: {
    command?: string
    path?: string
  }
  find_docker_port_issues: { path?: string }
  find_docker_env_issues: { path?: string }
}

type MissingToolArgs = Exclude<ToolName, keyof ToolArgs>
const _toolArgsComplete: MissingToolArgs extends never ? true : MissingToolArgs = true
void _toolArgsComplete

export type ToolHandlers = {
  [K in ToolName as K extends keyof ToolArgs ? K : never]: (
    args: ToolArgs[K & keyof ToolArgs]
  ) => Promise<string>
}

export function createToolHandlers<T extends Partial<ToolHandlers>>(handlers: T): T {
  return handlers
}
