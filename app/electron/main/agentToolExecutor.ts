import type { AgentSettings, AgentStreamPayload } from '../../src/types'
import { FILE_SIZE_LIMIT_BYTES } from '../../shared/constants'
import type { ToolHandlers } from './agentTools'
import { notifyMcpToolResult } from './mcpTools'
import { runSubagent } from './subagentRunner'
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
import { resolveAgentHandlerFactories } from './runtimeBootstrap'
import type { OllamaMessage } from './ollamaMessage'
import type { LoopGuard } from './agentLoopGuard'
import { normalizeToolLoopSignature } from '../../shared/toolLoopGuard'

const EDIT_OLD_STRING_NOT_FOUND_HINT =
  'Скопируй old_string из read_file — точное совпадение пробелов и переносов.'
const EDIT_WRONG_ARGS_HINT = 'edit_file требует path, old_string и new_string (точечная замена).'
const CREATE_MISSING_CONTENT_HINT =
  'create_file / write_file требуют path и content (полное содержимое).'
const READ_FILE_ALREADY_IN_RUN_HINT =
  'Этот файл уже читался в этом прогоне. Используй данные выше или offset/limit для другого фрагмента.'

export const PARALLEL_SAFE_TOOLS = new Set([
  'read_file',
  'file_info',
  'project_stats',
  'file_search_summary',
  'grep_files',
  'find_files',
  'find_symbol',
  'find_references',
  'find_slow_code',
  'find_unsafe_regex',
  'find_magic_numbers',
  'find_dead_code',
  'find_type_mismatches',
  'generate_project_metrics',
  'list_directory',
  'git_status',
  'git_diff',
  'git_log',
  'recent_changes',
  'package_info',
  'read_package_lock',
  'dependency_summary',
  'find_heavy_dependencies',
  'find_aria_issues',
  'find_integration_url_issues',
  'find_cron_issues',
  'test_summary',
  'search_memory',
  'list_skills',
  'read_skill',
  'read_skill_data',
  'web_fetch',
  'web_search',
  'check_cve',
  'run_tests',
  'list_gitlab_mrs',
  'get_gitlab_pipeline'
])

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
  mutatingToolNames: string[]
  breakLoop: boolean
  breakMessage?: string
  invocations: Array<{ name: string; output: string; args: Record<string, string> }>
}

export class ToolExecutor {
  private toolHandlers?: ToolHandlers
  clearEditSnapshots?: () => void
  private readonly readPathsThisRun = new Set<string>()

  beginRun(): void {
    this.readPathsThisRun.clear()
  }

  private enrichToolOutput(name: string, args: Record<string, string>, output: string): string {
    let result = output

    if (name === 'edit_file' && /old_string не найден/i.test(result)) {
      result += `\n\n${EDIT_OLD_STRING_NOT_FOUND_HINT}`
    }

    if (
      name === 'edit_file' &&
      (/edit_\* требует path, old_string/i.test(result) ||
        /Cannot read properties of undefined \(reading '(?:trim|replace)'\)/i.test(result))
    ) {
      result += `\n\n${EDIT_WRONG_ARGS_HINT}`
    }

    if (
      (name === 'create_file' || name === 'write_file') &&
      (/Не указан параметр content/i.test(result) ||
        /Cannot read properties of undefined \(reading 'trim'\)/i.test(result))
    ) {
      result += `\n\n${CREATE_MISSING_CONTENT_HINT}`
    }

    if (name === 'read_file') {
      const key = (args.path ?? '').trim()
      const hasOffset = Boolean(String(args.offset ?? '').trim())
      if (!/ENOENT|no such file|Ошибка:/i.test(result) && key && !hasOffset) {
        if (this.readPathsThisRun.has(key)) {
          result += `\n\n${READ_FILE_ALREADY_IN_RUN_HINT}`
        } else {
          this.readPathsThisRun.add(key)
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
      ...factories.createMemoryToolHandlers(this.projectPath, this.emit, this.settings.ollamaUrl, {
        syncCollectiveMemory: this.settings.syncCollectiveMemory
      }),
      ...factories.createSkillsToolHandlers(this.projectPath, this.emit),
      ...factories.createTodoToolHandlers(this.emit),
      ...factories.createWebToolHandlers(),
      ...factories.createMcpToolHandlers(this.settings.mcpServers),
      ...this.createSubagentToolHandlers()
    } as ToolHandlers
    return this.toolHandlers
  }

  private createSubagentToolHandlers(): Partial<ToolHandlers> {
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
    const debug = this.settings.debugAgent === true
    void agentLogger.write(buildToolCallLogEntry(debug, step, name, args))
    const callTrace = buildToolCallTraceData(step, name, args)
    emitAgentTrace(this.emit, 'tool_call', callTrace.label, callTrace.data)
    if (debug) {
      console.warn(`[CodeViper:agent] ▶ ${name}`, args)
    }

    const toolStartMs = Date.now()
    let output = ''
    let threw = false
    try {
      output = await this.executeTool(name, args)
    } catch (error) {
      threw = true
      output = `Ошибка: ${error instanceof Error ? error.message : String(error)}`
    }

    output = this.enrichToolOutput(name, args, output)
    const durationMs = Date.now() - toolStartMs
    const toolOk = isToolResultOk(threw, output)

    void agentLogger.write(buildToolResultLogEntry(debug, step, name, toolOk, durationMs, output))
    const resultTrace = buildToolResultTraceData(step, name, output, threw, durationMs)
    emitAgentTrace(this.emit, 'tool_result', resultTrace.label, resultTrace.data)
    if (debug) {
      console.warn(`[CodeViper:agent] ◀ ${name} (${durationMs}ms)`, output)
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

  async executeSequential(
    toolCalls: ToolCallInput[],
    step: number,
    isCloudProvider: boolean,
    loopGuard: LoopGuard
  ): Promise<SequentialBatchResult> {
    const toolMessages: OllamaMessage[] = []
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
      const output = rawOutput
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

    return { toolMessages, mutatingToolNames, breakLoop, breakMessage, invocations }
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
