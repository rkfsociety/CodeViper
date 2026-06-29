import type { AgentSettings, AgentStreamPayload } from '../../src/types'
import { FILE_SIZE_LIMIT_BYTES } from '../../shared/constants'
import { getAgentTools, type ToolHandlers } from './agentTools'
import { notifyMcpToolResult } from './mcpTools'
import { runSubagent } from './subagentRunner'
import type { SelfImprovementPlanStore } from './selfImprovementStore'
import type { SelfImprovementItem } from '../../shared/selfImprovement'
import { toolRequiresConfirm } from '../../shared/permissions'
import { agentLogger, type AgentLogEntry } from './agentLogger'
import {
  buildToolCallTraceData,
  buildToolResultTraceData,
  emitAgentTrace,
  isToolResultOk
} from './agentTrace'
import { createUnifiedDiff } from './diffUtil'
import { applySelectedHunks } from '../../shared/diffPreview'
import { runCodeViperCommand } from './codeviperSource'
import { resolveAgentHandlerFactories, getActiveAgentSourceRootPath } from './runtimeBootstrap'
import { resolveToolPathArg } from './agentHandlersUtils'
import type { OllamaMessage } from './agentContext'
import type { LoopGuard } from './agentLoopGuard'
import { normalizeToolLoopSignature } from '../../shared/toolLoopGuard'
import { parseReadMultiplePaths } from '../../shared/readMultiplePaths'
import {
  isCodeViperSourceRelativePath,
  isReadOutputTruncated,
  isNewUiComponentPath,
  hasReadCodeViperUiReference,
  mapSelfImproveProjectTool,
  validateSelfImproveMutatingContent,
  validateSelfImproveEditArgs,
  EDIT_OLD_STRING_NOT_FOUND_HINT,
  EDIT_WRONG_ARGS_HINT,
  CREATE_MISSING_CONTENT_HINT,
  TYPECHECK_FAILED_REVERT_HINT,
  MISSING_PING_SCRIPT_HINT,
  READ_FILE_ENOENT_CREATE_HINT,
  READ_FILE_ALREADY_IN_RUN_HINT,
  READ_FILE_TRUNCATED_HINT,
  SELF_IMPROVE_WRONG_PROJECT_TOOL_HINT,
  SELF_IMPROVE_UI_REFERENCE_REQUIRED_HINT,
  SELF_IMPROVE_GREP_WRONG_TOOL_HINT
} from '../../shared/selfImprovement'

// Read-only инструменты — безопасно запускать параллельно (Promise.all).
export const PARALLEL_SAFE_TOOLS = new Set([
  'read_file',
  'file_info',
  'project_stats',
  'file_search_summary',
  'grep_files',
  'find_files',
  'find_symbol',
  'find_references',
  'list_directory',
  'read_codeviper_file',
  'grep_codeviper_files',
  'find_codeviper_files',
  'list_codeviper_directory',
  'git_status',
  'git_diff',
  'git_log',
  'recent_changes',
  'package_info',
  'read_package_lock',
  'dependency_summary',
  'test_summary',
  'search_memory',
  'list_skills',
  'read_skill',
  'read_skill_data',
  'get_self_improvement_plan',
  'preview_ollama_modelfile',
  'web_fetch',
  'web_search',
  'run_tests',
  'list_gitlab_mrs',
  'get_gitlab_pipeline'
])

// Инструменты, меняющие исходники самого CodeViper.
export const SELF_EDIT_FILE_TOOLS = new Set([
  'write_codeviper_file',
  'create_codeviper_file',
  'edit_codeviper_file',
  'append_codeviper_file',
  'delete_codeviper_file',
  'move_codeviper_file'
])

export function toolTouchesRoadmapDocs(name: string, args: Record<string, string>): boolean {
  if (!SELF_EDIT_FILE_TOOLS.has(name) && name !== 'write_codeviper_file') return false
  const p = (args.path ?? args.from ?? '').replace(/\\/g, '/')
  return /ROADMAP(_DONE)?\.md/i.test(p) || /README\.md/i.test(p)
}

export function truncateDebugAgentOutput(output: string): string {
  if (output.length <= FILE_SIZE_LIMIT_BYTES) return output
  const omitted = output.length - FILE_SIZE_LIMIT_BYTES
  return `${output.slice(0, FILE_SIZE_LIMIT_BYTES)}\n… [truncated ${omitted} chars]`
}

export function buildToolCallLogEntry(
  debugAgent: boolean,
  step: number,
  tool: string,
  args: Record<string, string>
): AgentLogEntry {
  return {
    event: 'tool_call',
    step,
    tool,
    args,
    ...(debugAgent ? { debug: true } : {})
  }
}

export function buildToolResultLogEntry(
  debugAgent: boolean,
  step: number,
  tool: string,
  ok: boolean,
  durationMs: number,
  output: string
): AgentLogEntry {
  const entry: AgentLogEntry = {
    event: 'tool_result',
    step,
    tool,
    ok,
    duration_ms: durationMs
  }
  if (debugAgent) {
    entry.debug = true
    entry.output = truncateDebugAgentOutput(output)
  } else if (ok) {
    entry.output_len = output.length
  } else {
    entry.error = output
  }
  return entry
}

export function parseToolArgs(args: Record<string, string> | string): Record<string, string> {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as Record<string, string>
    } catch {
      return { _raw: args }
    }
  }
  return args
}

interface ToolCallInput {
  id?: string
  function: { name: string; arguments: Record<string, string> | string }
}

export interface ToolInvocationResult {
  id?: string
  name: string
  output: string
}

export interface SequentialBatchResult {
  toolMessages: OllamaMessage[]
  selfEdited: boolean
  mutatingToolNames: string[]
  breakLoop: boolean
  breakMessage?: string
  invocations: Array<{ name: string; output: string; args: Record<string, string> }>
}

export class ToolExecutor {
  private toolHandlers?: ToolHandlers
  clearEditSnapshots?: () => void
  private selfImproveMode = false
  private readonly readPathsThisRun = new Map<string, { truncated: boolean }>()

  /** Сброс состояния в начале прогона агента. */
  beginRun(selfImproveMode: boolean): void {
    this.selfImproveMode = selfImproveMode
    this.readPathsThisRun.clear()
  }

  private enrichToolOutput(name: string, args: Record<string, string>, output: string): string {
    let result = output

    if (/ENOENT|no such file or directory/i.test(result)) {
      if (name === 'read_codeviper_file' || name === 'read_file') {
        result += `\n\n${READ_FILE_ENOENT_CREATE_HINT}`
      }
    }

    if (this.selfImproveMode) {
      const projectFileTools = new Set([
        'read_file',
        'write_file',
        'create_file',
        'edit_file',
        'list_directory',
        'read_multiple_files'
      ])
      if (projectFileTools.has(name)) {
        const pathArg =
          name === 'read_multiple_files'
            ? parseReadMultiplePaths(args.paths).join(', ')
            : String(args.path ?? args.paths ?? '').trim()
        if (
          isCodeViperSourceRelativePath(pathArg) ||
          /Program Files[\\/]CodeViper/i.test(pathArg) ||
          /Program Files[\\/]CodeViper/i.test(result)
        ) {
          result += `\n\n${SELF_IMPROVE_WRONG_PROJECT_TOOL_HINT}`
        }
      }
      if (name === 'grep_files' && /просмотрено файлов: 0/i.test(result)) {
        result += `\n\n${SELF_IMPROVE_GREP_WRONG_TOOL_HINT}`
      }
    }

    if (
      (name === 'edit_file' || name === 'edit_codeviper_file') &&
      /old_string не найден/i.test(result)
    ) {
      result += `\n\n${EDIT_OLD_STRING_NOT_FOUND_HINT}`
    }

    if (
      (name === 'edit_file' || name === 'edit_codeviper_file') &&
      (/edit_\* требует path, old_string/i.test(result) ||
        /Cannot read properties of undefined \(reading '(?:trim|replace)'\)/i.test(result))
    ) {
      result += `\n\n${EDIT_WRONG_ARGS_HINT}`
    }

    if (
      (name === 'create_codeviper_file' ||
        name === 'write_codeviper_file' ||
        name === 'create_file' ||
        name === 'write_file') &&
      (/Не указан параметр content/i.test(result) ||
        /Cannot read properties of undefined \(reading 'trim'\)/i.test(result))
    ) {
      result += `\n\n${CREATE_MISSING_CONTENT_HINT}`
    }

    if (name === 'run_codeviper_command') {
      if (/exit:\s*[12]/i.test(result) && /error TS\d+:/i.test(result)) {
        result += `\n\n${TYPECHECK_FAILED_REVERT_HINT}`
      }
      if (/Missing script:\s*"ping"/i.test(result)) {
        result += `\n\n${MISSING_PING_SCRIPT_HINT}`
      }
    }

    if (name === 'read_file' || name === 'read_codeviper_file') {
      const key = `${name}:${(args.path ?? '').trim()}`
      const hasOffset = Boolean(String(args.offset ?? '').trim())
      const truncated = isReadOutputTruncated(result)
      if (!/ENOENT|no such file|Ошибка:/i.test(result)) {
        const prev = this.readPathsThisRun.get(key)
        if (prev && !hasOffset) {
          result += `\n\n${prev.truncated ? READ_FILE_TRUNCATED_HINT : READ_FILE_ALREADY_IN_RUN_HINT}`
        }
        if (!prev || hasOffset) {
          this.readPathsThisRun.set(key, {
            truncated: prev?.truncated === true || truncated
          })
        } else if (truncated) {
          this.readPathsThisRun.set(key, { truncated: true })
        }
      }
    }

    return result
  }

  constructor(
    private readonly projectPath: string,
    private readonly settings: AgentSettings,
    private readonly emit: (event: AgentStreamPayload) => void,
    private readonly signal?: AbortSignal,
    private readonly confirm?: (toolName: string, toolInput: string) => Promise<boolean>,
    private readonly previewFn?: (previewId: string) => Promise<boolean>,
    private readonly hunkSelectionFn?: (previewId: string) => number[] | undefined,
    private readonly selfImprovementPlan?: SelfImprovementPlanStore,
    private readonly onEmitPlan?: (items: SelfImprovementItem[]) => void,
    private readonly chatId?: string
  ) {}

  private getToolHandlers(): ToolHandlers {
    if (this.toolHandlers) return this.toolHandlers
    const factories = resolveAgentHandlerFactories()
    const projectResult = factories.createProjectToolHandlers(
      this.projectPath,
      this.settings.commandTimeoutSec != null ? this.settings.commandTimeoutSec * 1000 : undefined,
      {
        readonlyMode: this.settings.readonlyMode,
        ollamaUrl: this.settings.ollamaUrl,
        qdrantUrl: this.settings.qdrantUrl,
        qdrantApiKey: this.settings.qdrantApiKey,
        commandBlocklist: this.settings.commandBlocklist,
        commandAllowlist: this.settings.commandAllowlist,
        sandboxEnabled: this.settings.scriptSandboxEnabled === true
      }
    )
    this.clearEditSnapshots = projectResult.clearEditSnapshots
    this.toolHandlers = {
      ...projectResult.handlers,
      ...factories.createGitHubToolHandlers({
        projectPath: this.projectPath,
        chatId: this.chatId,
        emit: this.emit
      }),
      ...factories.createGitLabToolHandlers(this.projectPath, this.settings),
      ...factories.createJiraToolHandlers(this.settings),
      ...factories.createLinearToolHandlers(this.settings),
      ...factories.createCodeViperToolHandlers(),
      ...factories.createMemoryToolHandlers(this.projectPath, this.emit, this.settings.ollamaUrl, {
        syncCollectiveMemory: this.settings.syncCollectiveMemory
      }),
      ...factories.createSkillsToolHandlers(this.projectPath, this.emit),
      ...(this.selfImprovementPlan && this.onEmitPlan
        ? factories.createSelfImprovementToolHandlers(this.selfImprovementPlan, this.onEmitPlan)
        : {}),
      ...factories.createTodoToolHandlers(this.emit),
      ...factories.createModelToolHandlers(this.projectPath, this.settings, this.signal),
      ...factories.createWebToolHandlers(),
      ...factories.createMcpToolHandlers(this.settings.mcpServers),
      ...this.createSubagentToolHandlers()
      // Эти два обработчика регистрируются в AgentRunner через overrideHandlers().
    } as ToolHandlers
    return this.toolHandlers
  }

  /** Хендлеры для субагент-инструментов (delegate_to_editor). */
  private createSubagentToolHandlers(): Partial<ToolHandlers> {
    // Защита от делегирования одинаковой задачи дважды подряд
    const recentTasks = new Set<string>()
    return {
      delegate_to_editor: async ({ task, context }) => {
        if (!this.projectPath) return 'Ошибка: путь к проекту не задан'
        const taskKey = task.slice(0, 200)
        if (recentTasks.has(taskKey)) {
          return '[delegate_to_editor] Задача уже была делегирована и выполнена. Используй результат из предыдущего вызова.'
        }
        this.emit({ type: 'editing', editing: true })
        try {
          const fullTask = context ? `${task}\n\nКонтекст: ${context}` : task
          const result = await runSubagent(this.settings, {
            role: 'editor',
            task: fullTask,
            projectPath: this.projectPath,
            signal: this.signal
          })
          recentTasks.add(taskKey)
          // Очищаем старые задачи чтобы не накапливать бесконечно
          if (recentTasks.size > 20) {
            const first = recentTasks.values().next().value
            if (first !== undefined) recentTasks.delete(first)
          }
          const status = result.completed ? 'завершена' : 'прервана по лимиту шагов'
          return `[Редактор: ${status}, шагов: ${result.steps}, инструменты: ${result.toolsUsed.join(', ') || 'нет'}]\n\n${result.output}`
        } finally {
          this.emit({ type: 'editing', editing: false })
        }
      }
    }
  }

  /** Позволяет AgentRunner добавить preview_edit и preview_patch после создания. */
  overrideHandlers(extra: Partial<ToolHandlers>): void {
    const base = this.getToolHandlers()
    this.toolHandlers = { ...base, ...extra } as ToolHandlers
  }

  async executeTool(name: string, args: Record<string, string>): Promise<string> {
    const handlers = this.getToolHandlers() as unknown as Record<
      string,
      (args: Record<string, string>) => Promise<string>
    >
    const handler = handlers[name]
    if (!handler) return `Неизвестный инструмент: ${name}`
    return handler(args)
  }

  private async runOneTool(
    step: number,
    name: string,
    args: Record<string, string>,
    id?: string
  ): Promise<ToolInvocationResult> {
    let toolName = name
    let toolArgs = args
    if (this.selfImproveMode) {
      const mapped = mapSelfImproveProjectTool(toolName, toolArgs)
      toolName = mapped.toolName
      toolArgs = mapped.args
    }

    const debug = this.settings.debugAgent === true
    void agentLogger.write(buildToolCallLogEntry(debug, step, name, args))
    const callTrace = buildToolCallTraceData(step, name, args)
    emitAgentTrace(this.emit, 'tool_call', callTrace.label, callTrace.data)
    if (debug) {
      console.log(`[CodeViper:agent] ▶ ${name}`, args)
    }

    const preflight = this.preflightSelfImproveTool(toolName, toolArgs)
    const toolStartMs = Date.now()
    let output = ''
    let threw = false
    if (preflight) {
      output = preflight
    } else {
      try {
        output = await this.executeTool(toolName, toolArgs)
      } catch (error) {
        threw = true
        output = `Ошибка: ${error instanceof Error ? error.message : String(error)}`
      }
    }

    output = this.enrichToolOutput(name, toolArgs, output)
    const durationMs = Date.now() - toolStartMs
    const toolOk = isToolResultOk(threw, output)

    void agentLogger.write(buildToolResultLogEntry(debug, step, name, toolOk, durationMs, output))
    const resultTrace = buildToolResultTraceData(step, name, output, threw, durationMs)
    emitAgentTrace(this.emit, 'tool_result', resultTrace.label, resultTrace.data)
    if (debug) {
      console.log(`[CodeViper:agent] ◀ ${name} (${durationMs}ms)`, output)
    }

    try {
      await notifyMcpToolResult(name, id, output, this.settings.mcpServers)
    } catch (error) {
      void agentLogger.write({
        event: 'mcp_tool_result_error',
        step,
        tool: name,
        tool_call_id: id,
        error: error instanceof Error ? error.message : String(error)
      })
    }

    return { id, name, output }
  }

  /** Блокировка/валидация до вызова handler в режиме самоулучшения. */
  private preflightSelfImproveTool(toolName: string, args: Record<string, string>): string | null {
    if (!this.selfImproveMode) return null

    if (
      toolName === 'set_todo_list' ||
      toolName === 'complete_todo_item' ||
      toolName === 'clear_todo_list'
    ) {
      return 'В режиме самоулучшения используй set_self_improvement_plan и complete_self_improvement_item — не set_todo_list.'
    }

    if (toolName === 'create_codeviper_file' || toolName === 'write_codeviper_file') {
      const contentErr = validateSelfImproveMutatingContent(args.path ?? '', args.content ?? '')
      if (contentErr) return contentErr
      if (
        toolName === 'create_codeviper_file' &&
        isNewUiComponentPath(args.path ?? '') &&
        !hasReadCodeViperUiReference(this.readPathsThisRun.keys())
      ) {
        return SELF_IMPROVE_UI_REFERENCE_REQUIRED_HINT
      }
    }

    if (toolName === 'edit_codeviper_file') {
      const path = resolveToolPathArg(args as Record<string, unknown>) ?? ''
      const oldString = String(args.old_string ?? args.oldString ?? '')
      const newString = String(args.new_string ?? args.newString ?? '')
      const editErr = validateSelfImproveEditArgs(oldString, newString)
      if (editErr) return editErr
      const contentErr = validateSelfImproveMutatingContent(path, newString)
      if (contentErr) return contentErr
    }

    return null
  }

  async executeParallel(toolCalls: ToolCallInput[], step: number): Promise<ToolInvocationResult[]> {
    const parsed = toolCalls.map((call) => ({
      id: call.id,
      name: call.function.name,
      args: parseToolArgs(call.function.arguments ?? {})
    }))
    for (const { name, args } of parsed) {
      this.emit({ type: 'tool_start', toolName: name, toolInput: JSON.stringify(args, null, 2) })
    }
    return Promise.all(parsed.map(({ id, name, args }) => this.runOneTool(step, name, args, id)))
  }

  private async runAutoVerify(): Promise<string> {
    const root = getActiveAgentSourceRootPath()
    const { readFile } = await import('fs/promises')
    const { join } = await import('path')
    let scripts: Record<string, string> = {}
    try {
      const raw = await readFile(join(root, 'package.json'), 'utf-8')
      scripts = (JSON.parse(raw) as { scripts?: Record<string, string> }).scripts ?? {}
    } catch {
      return ''
    }

    const parts: string[] = []
    if ('typecheck' in scripts) {
      const r = await runCodeViperCommand('npm run typecheck')
      const out = (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim()
      parts.push(`[typecheck]\n${out || '(нет вывода)'}`)
    }
    if ('test' in scripts) {
      const r = await runCodeViperCommand('npm test')
      const out = (r.stdout + (r.stderr ? '\n' + r.stderr : '')).trim()
      parts.push(`[test]\n${out || '(нет вывода)'}`)
    }

    if (!parts.length) return ''
    return '\n\n--- Автопроверка ---\n' + parts.join('\n\n')
  }

  async executeSequential(
    toolCalls: ToolCallInput[],
    step: number,
    isCloudProvider: boolean,
    loopGuard: LoopGuard
  ): Promise<SequentialBatchResult> {
    const toolMessages: OllamaMessage[] = []
    let selfEdited = false
    const mutatingToolNames: string[] = []
    let breakLoop = false
    let breakMessage: string | undefined

    const rawResults = await Promise.all(
      toolCalls.map(async (call) => {
        if (this.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        const name = call.function.name
        const args = parseToolArgs(call.function.arguments ?? {})
        const toolInput = JSON.stringify(args, null, 2)
        this.emit({ type: 'tool_start', toolName: name, toolInput })

        if (this.confirm && toolRequiresConfirm(this.settings.permissionMode ?? 'bypass', name)) {
          const approved = await this.confirm(name, toolInput)
          if (this.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
          if (!approved) {
            const output = '⛔ Действие отклонено пользователем'
            const callTrace = buildToolCallTraceData(step, name, args)
            emitAgentTrace(this.emit, 'tool_call', callTrace.label, callTrace.data)
            const resultTrace = buildToolResultTraceData(step, name, output, true, 0)
            emitAgentTrace(this.emit, 'tool_result', resultTrace.label, resultTrace.data)
            this.emit({ type: 'tool_end', toolName: name, toolOutput: output })
            return { call, name, output }
          }
        }

        const result = await this.runOneTool(step, name, args, call.id)
        this.emit({ type: 'tool_end', toolName: name, toolOutput: result.output })
        return { call, name, output: result.output }
      })
    )

    const MAX_CLOUD_RESULT_CHARS = 2000

    const invocations: Array<{ name: string; output: string; args: Record<string, string> }> = []

    for (const { call, name, output: rawOutput } of rawResults) {
      let output = rawOutput
      invocations.push({
        name,
        output,
        args: parseToolArgs(call.function.arguments ?? {})
      })
      const toolSignature = normalizeToolLoopSignature(
        name,
        parseToolArgs(call.function.arguments ?? {})
      )
      const loopNudge =
        loopGuard.checkConsecutive(toolSignature, name) ?? loopGuard.checkTotal(name)
      if (loopNudge) {
        toolMessages.push({ role: 'user', content: loopNudge })
        breakLoop = true
        breakMessage = loopNudge
        break
      }

      if (
        getAgentTools(false, this.settings.disabledTools, this.settings.mcpServers).some(
          (t) => t.name === name && SELF_EDIT_FILE_TOOLS.has(name)
        )
      ) {
        /* handled below */
      }
      if (SELF_EDIT_FILE_TOOLS.has(name) && !output.startsWith('Ошибка:')) {
        selfEdited = true
        if (this.settings.autoVerifyAfterEdit) {
          const verifyOut = await this.runAutoVerify()
          if (verifyOut) output += verifyOut
        }
      }
      // MUTATING_TOOLS check done by caller via mutatingToolNames
      mutatingToolNames.push(name)

      let trimmedOutput = output
      if (isCloudProvider && output.length > MAX_CLOUD_RESULT_CHARS) {
        const lines = output.split('\n')
        const truncatedLines = lines.slice(0, 50)
        const chars = truncatedLines.join('\n')
        trimmedOutput =
          chars.length > MAX_CLOUD_RESULT_CHARS
            ? chars.slice(0, MAX_CLOUD_RESULT_CHARS) +
              `\n... (выходные данные обрезаны, всего ${lines.length} строк)`
            : chars +
              (lines.length > 50 ? `\n... (показано первых 50 из ${lines.length} строк)` : '')
      }

      const msg: OllamaMessage = { role: 'tool', content: `Инструмент ${name}:\n${trimmedOutput}` }
      if (call.id) msg.tool_call_id = call.id
      toolMessages.push(msg)
    }

    return { toolMessages, selfEdited, mutatingToolNames, breakLoop, breakMessage, invocations }
  }

  async handlePreviewEdit(args: Record<string, string>): Promise<string> {
    const { path: filePath, content: newContent } = args
    if (!filePath || newContent === undefined) return 'preview_edit: нужны path и content'
    const { safeReadFilePartial, safeWriteFile, isInsideProject } = await import('./services')
    const { resolve } = await import('path')
    if (!isInsideProject(this.projectPath, resolve(this.projectPath, filePath)))
      return `preview_edit: путь вне проекта — ${filePath}`
    let oldContent = ''
    try {
      const raw = await safeReadFilePartial(this.projectPath, filePath, 0, 10000)
      oldContent = typeof raw === 'string' ? raw : ''
    } catch {
      /* новый файл */
    }
    if (oldContent.length > 500 && newContent.length < oldContent.length * 0.5) {
      return (
        `❌ preview_edit отклонён: новый контент (${newContent.length} симв.) значительно короче оригинала (${oldContent.length} симв.). ` +
        `Это защита от случайного удаления кода. ` +
        `Для точечных правок используй preview_patch (old_string → new_string). ` +
        `Если действительно нужна полная перезапись — передай ВСЕ содержимое файла.`
      )
    }
    const diff = createUnifiedDiff(oldContent, newContent, filePath)
    if (!diff) return 'Нет изменений — содержимое файла уже совпадает с предложенным.'
    if (!this.previewFn || (this.settings.permissionMode ?? 'bypass') === 'bypass') {
      await safeWriteFile(this.projectPath, filePath, newContent)
      return `✅ Файл записан: ${filePath}`
    }
    const { makeId: mkId } = await import('../../shared/makeId')
    const previewId = mkId()
    this.emit({ type: 'preview', previewId, previewPath: filePath, previewDiff: diff })
    const apply = await this.previewFn(previewId)
    if (!apply) return `❌ Правки отменены пользователем: ${filePath}`
    const selectedHunks = this.hunkSelectionFn?.(previewId)
    const contentToWrite =
      selectedHunks != null ? applySelectedHunks(oldContent, diff, selectedHunks) : newContent
    await safeWriteFile(this.projectPath, filePath, contentToWrite)
    return `✅ Правки применены: ${filePath}`
  }

  async handlePreviewPatch(args: Record<string, string>): Promise<string> {
    const { path: filePath, old_string: oldStr, new_string: newStr, replace_all: replaceAll } = args
    if (!filePath || oldStr === undefined || newStr === undefined) {
      return 'preview_patch: нужны path, old_string и new_string'
    }
    const { safeReadFilePartial, safeWriteFile, isInsideProject } = await import('./services')
    const { resolve } = await import('path')
    if (!isInsideProject(this.projectPath, resolve(this.projectPath, filePath)))
      return `preview_patch: путь вне проекта — ${filePath}`
    let oldContent = ''
    try {
      const raw = await safeReadFilePartial(this.projectPath, filePath, 0, 200000)
      oldContent = typeof raw === 'string' ? raw : ''
    } catch {
      return `preview_patch: не удалось прочитать файл — ${filePath}`
    }
    if (!oldContent.includes(oldStr)) {
      return `preview_patch: old_string не найден в файле. Прочитай файл заново и скопируй точный фрагмент.`
    }
    const newContent =
      replaceAll === 'true'
        ? oldContent.split(oldStr).join(newStr)
        : oldContent.replace(oldStr, newStr)
    const diff = createUnifiedDiff(oldContent, newContent, filePath)
    if (!diff) return 'Нет изменений — old_string и new_string идентичны.'
    if (!this.previewFn || (this.settings.permissionMode ?? 'bypass') === 'bypass') {
      await safeWriteFile(this.projectPath, filePath, newContent)
      return `✅ Правка применена: ${filePath}`
    }
    const { makeId: mkId } = await import('../../shared/makeId')
    const previewId = mkId()
    this.emit({ type: 'preview', previewId, previewPath: filePath, previewDiff: diff })
    const apply = await this.previewFn(previewId)
    if (!apply) return `❌ Правки отменены пользователем: ${filePath}`
    const selectedHunks = this.hunkSelectionFn?.(previewId)
    const contentToWrite =
      selectedHunks != null ? applySelectedHunks(oldContent, diff, selectedHunks) : newContent
    await safeWriteFile(this.projectPath, filePath, contentToWrite)
    return `✅ Правки применены: ${filePath}`
  }
}
