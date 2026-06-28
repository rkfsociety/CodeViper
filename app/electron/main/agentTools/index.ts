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
  WEB_TOOLS
} from './integrations'
import { CODEVIPER_TOOLS, INDEXING_TOOLS, OLLAMA_TOOLS, SUBAGENT_TOOLS } from './mcp'

// ── Реэкспорт групп для обратной совместимости ────────────────────────────────
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
  WEB_TOOLS,
  CODEVIPER_TOOLS,
  INDEXING_TOOLS,
  OLLAMA_TOOLS,
  SUBAGENT_TOOLS
}

// ── Plugin tools ──────────────────────────────────────────────────────────────

function getPluginTools() {
  return loadPlugins().flatMap((plugin) => plugin.tools)
}

// ── Общий список инструментов ─────────────────────────────────────────────────

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
  ...CODEVIPER_TOOLS,
  ...OLLAMA_TOOLS,
  ...INDEXING_TOOLS,
  ...WEB_TOOLS,
  ...SUBAGENT_TOOLS
] as const

// ── Кэш преобразованных схем для провайдеров ─────────────────────────────────

const transformedToolsCache = new Map<
  string,
  Array<{ name: string; description: string; input_schema: Record<string, unknown> }>
>()

/** Сбросить кэш схем инструментов (например, после правки .js-плагина). */
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

/**
 * Получить инструменты с кэшированием преобразованных схем.
 * Экономит ~35% токенов в режиме самоулучшения, ~60% в обычном режиме.
 */
export function getAgentTools(
  selfImproveMode: boolean,
  disabledTools?: string[],
  mcpServers?: McpServerConfig[]
) {
  const disabled = disabledTools?.length ? new Set(disabledTools) : null

  // В обычном режиме исключаем codeviper + ollama + явно отключённые инструменты
  const filtered = AGENT_TOOLS.filter(
    (t) =>
      (selfImproveMode ||
        (!CODEVIPER_TOOLS.some((ct) => ct.function.name === t.function.name) &&
          !OLLAMA_TOOLS.some((ot) => ot.function.name === t.function.name))) &&
      (!disabled || !disabled.has(t.function.name))
  )

  const mcpTools = buildMcpAgentTools(mcpServers).filter(
    (tool) => !disabled || !disabled.has(tool.function.name)
  )
  const pluginTools = getPluginTools()
  const allTools = [...filtered, ...pluginTools, ...mcpTools]

  // Кэш по режиму, отключённым инструментам, MCP и содержимому плагинов
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
  const cacheKey = `${selfImproveMode}_${disabledKey}_${mcpKey}_${pluginKey}`
  if (!transformedToolsCache.has(cacheKey)) {
    transformedToolsCache.set(cacheKey, transformTools(allTools))
  }

  return transformedToolsCache.get(cacheKey)!
}

/** Инструменты, нужные только в режиме самоулучшения */
const SELF_IMPROVE_ONLY_TOOLS = new Set<string>([
  ...CODEVIPER_TOOLS.map((t) => t.function.name),
  ...OLLAMA_TOOLS.map((t) => t.function.name)
])

export function formatAgentToolsSummary(selfImproveMode = true): string {
  const pluginTools = getPluginTools()
  const tools = selfImproveMode
    ? [...AGENT_TOOLS, ...pluginTools]
    : [...AGENT_TOOLS, ...pluginTools].filter((t) => !SELF_IMPROVE_ONLY_TOOLS.has(t.function.name))
  return tools
    .map((tool) => `- **${tool.function.name}** — ${tool.function.description}`)
    .join('\n')
}

// ── Типы ──────────────────────────────────────────────────────────────────────

/** Имя любого инструмента */
export type ToolName = (typeof AGENT_TOOLS)[number]['function']['name']

/** Типы аргументов каждого инструмента */
export interface ToolArgs {
  search_knowledge_base: { query: string; collection?: string; limit?: string }
  list_directory: { path?: string; max_depth?: string }
  grep_files: { query: string; path?: string }
  find_files: { pattern: string; path?: string }
  find_symbol: { name: string; path?: string }
  find_references: { name: string; path?: string }
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
  git_status: { path?: string }
  git_diff: { path?: string; staged?: string; commit?: string }
  git_log: { limit?: string; path?: string; oneline?: string }
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
  search_memory: { query: string }
  forget: { id: string }
  file_search_summary: { query: string; path?: string }
  set_todo_list: { items: Array<{ id: string; title: string }> | string; title?: string }
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
  list_roadmap: Record<string, never>
  read_roadmap_item: { number: string }
  set_self_improvement_plan: { items: string }
  complete_self_improvement_item: { id: string | number }
  get_self_improvement_plan: Record<string, never>
  list_codeviper_directory: { path?: string; max_depth?: string }
  grep_codeviper_files: { query: string; path?: string }
  find_codeviper_files: { pattern: string; path?: string }
  read_codeviper_file: { path: string; offset?: string; limit?: string }
  write_codeviper_file: { path: string; content: string }
  create_codeviper_file: { path: string; content: string }
  edit_codeviper_file: {
    path: string
    old_string: string
    new_string: string
    replace_all?: string
  }
  append_codeviper_file: { path: string; content: string }
  delete_codeviper_file: { path: string }
  move_codeviper_file: { from: string; to: string }
  run_codeviper_command: { command: string }
  create_codeviper_branch: { name: string }
  push_codeviper_branch: Record<string, never>
  create_codeviper_pr: { title?: string; body?: string }
  index_project: Record<string, never>
  preview_ollama_modelfile: {
    data_path: string
    base_model: string
    system?: string
    temperature?: string
  }
  create_ollama_model: {
    model_name: string
    data_path: string
    base_model: string
    system?: string
    temperature?: string
  }
  web_fetch: {
    url: string
    max_chars?: number
  }
  web_search: {
    query: string
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
}

// Гарантия на этапе компиляции: все инструменты имеют типы аргументов
type MissingToolArgs = Exclude<ToolName, keyof ToolArgs>
const _toolArgsComplete: MissingToolArgs extends never ? true : MissingToolArgs = true
void _toolArgsComplete

/** Реестр обработчиков инструментов */
export type ToolHandlers = {
  [K in ToolName as K extends keyof ToolArgs ? K : never]: (
    args: ToolArgs[K & keyof ToolArgs]
  ) => Promise<string>
}

/** Helper для типизации обработчиков инструментов */
export function createToolHandlers<T extends Partial<ToolHandlers>>(handlers: T): T {
  return handlers
}
