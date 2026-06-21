import type { AgentSettings, AgentStreamPayload } from '../../src/types'
import { getAgentTools, type ToolHandlers, type ToolName } from './agentTools'
import { createProjectToolHandlers } from './agentHandlersProject'
import { createGitHubToolHandlers } from './agentHandlersGitHub'
import { createCodeViperToolHandlers } from './agentHandlersCodeViper'
import { createMemoryToolHandlers } from './agentHandlersMemory'
import { createSkillsToolHandlers } from './agentHandlersSkills'
import { createSelfImprovementToolHandlers } from './agentHandlersSelfImprovement'
import { createModelToolHandlers } from './agentHandlersModels'
import { createTodoToolHandlers } from './agentHandlersTodo'
import { createWebToolHandlers } from './agentHandlersWeb'
import type { SelfImprovementPlanStore } from './selfImprovementStore'
import type { SelfImprovementItem } from '../../shared/selfImprovement'
import { toolRequiresConfirm } from '../../shared/permissions'
import { agentLogger } from './agentLogger'
import { createUnifiedDiff } from './diffUtil'
import type { OllamaMessage } from './agentContext'
import type { LoopGuard } from './agentLoopGuard'

// Read-only инструменты — безопасно запускать параллельно (Promise.all).
export const PARALLEL_SAFE_TOOLS = new Set([
  'read_file',
  'file_info',
  'project_stats',
  'file_search_summary',
  'grep_files',
  'find_files',
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
  'web_search'
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
}

export class ToolExecutor {
  private toolHandlers?: ToolHandlers
  clearEditSnapshots?: () => void

  constructor(
    private readonly projectPath: string,
    private readonly settings: AgentSettings,
    private readonly emit: (event: AgentStreamPayload) => void,
    private readonly signal?: AbortSignal,
    private readonly confirm?: (toolName: string, toolInput: string) => Promise<boolean>,
    private readonly previewFn?: (previewId: string) => Promise<boolean>,
    private readonly selfImprovementPlan?: SelfImprovementPlanStore,
    private readonly onEmitPlan?: (items: SelfImprovementItem[]) => void
  ) {}

  private getToolHandlers(): ToolHandlers {
    if (this.toolHandlers) return this.toolHandlers
    const projectResult = createProjectToolHandlers(
      this.projectPath,
      this.settings.commandTimeoutSec != null ? this.settings.commandTimeoutSec * 1000 : undefined,
      {
        readonlyMode: this.settings.readonlyMode,
        ollamaUrl: this.settings.ollamaUrl,
        qdrantUrl: this.settings.qdrantUrl,
        qdrantApiKey: this.settings.qdrantApiKey,
        commandBlocklist: this.settings.commandBlocklist
      }
    )
    this.clearEditSnapshots = projectResult.clearEditSnapshots
    this.toolHandlers = {
      ...projectResult.handlers,
      ...createGitHubToolHandlers(),
      ...createCodeViperToolHandlers(),
      ...createMemoryToolHandlers(this.projectPath, this.emit, this.settings.ollamaUrl),
      ...createSkillsToolHandlers(this.projectPath, this.emit),
      ...(this.selfImprovementPlan && this.onEmitPlan
        ? createSelfImprovementToolHandlers(this.selfImprovementPlan, this.onEmitPlan)
        : {}),
      ...createTodoToolHandlers(this.emit),
      ...createModelToolHandlers(this.projectPath, this.settings, this.signal),
      ...createWebToolHandlers()
      // Эти два обработчика регистрируются в AgentRunner через overrideHandlers().
    } as ToolHandlers
    return this.toolHandlers
  }

  /** Позволяет AgentRunner добавить preview_edit и preview_patch после создания. */
  overrideHandlers(extra: Partial<ToolHandlers>): void {
    const base = this.getToolHandlers()
    this.toolHandlers = { ...base, ...extra } as ToolHandlers
  }

  async executeTool(name: string, args: Record<string, string>): Promise<string> {
    const handler = this.getToolHandlers()[name as ToolName] as
      | ((args: Record<string, string>) => Promise<string>)
      | undefined
    if (!handler) return `Неизвестный инструмент: ${name}`
    return handler(args)
  }

  private async runOneTool(
    step: number,
    name: string,
    args: Record<string, string>,
    id?: string
  ): Promise<ToolInvocationResult> {
    void agentLogger.write({ event: 'tool_call', step, tool: name, args })
    const toolStartMs = Date.now()
    let output = ''
    try {
      output = await this.executeTool(name, args)
      void agentLogger.write({
        event: 'tool_result',
        step,
        tool: name,
        ok: true,
        duration_ms: Date.now() - toolStartMs,
        output_len: output.length
      })
    } catch (error) {
      output = `Ошибка: ${error instanceof Error ? error.message : String(error)}`
      void agentLogger.write({
        event: 'tool_result',
        step,
        tool: name,
        ok: false,
        duration_ms: Date.now() - toolStartMs,
        error: output
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

    for (const { call, name, output } of rawResults) {
      const toolSignature = `${name}:${JSON.stringify(call.function.arguments)}`
      const loopNudge =
        loopGuard.checkConsecutive(toolSignature, name) ?? loopGuard.checkTotal(name)
      if (loopNudge) {
        toolMessages.push({ role: 'user', content: loopNudge })
        breakLoop = true
        breakMessage = loopNudge
        break
      }

      if (getAgentTools(false).some((t) => t.name === name && SELF_EDIT_FILE_TOOLS.has(name))) {
        /* handled below */
      }
      if (SELF_EDIT_FILE_TOOLS.has(name) && !output.startsWith('Ошибка:')) selfEdited = true
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

    return { toolMessages, selfEdited, mutatingToolNames, breakLoop, breakMessage }
  }

  async handlePreviewEdit(args: Record<string, string>): Promise<string> {
    const { path: filePath, content: newContent } = args
    if (!filePath || newContent === undefined) return 'preview_edit: нужны path и content'
    const { safeReadFilePartial, safeWriteFile, isInsideProject } = await import('./services')
    if (!isInsideProject(this.projectPath, filePath))
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
    await safeWriteFile(this.projectPath, filePath, newContent)
    return `✅ Правки применены: ${filePath}`
  }

  async handlePreviewPatch(args: Record<string, string>): Promise<string> {
    const { path: filePath, old_string: oldStr, new_string: newStr, replace_all: replaceAll } = args
    if (!filePath || oldStr === undefined || newStr === undefined) {
      return 'preview_patch: нужны path, old_string и new_string'
    }
    const { safeReadFilePartial, safeWriteFile, isInsideProject } = await import('./services')
    if (!isInsideProject(this.projectPath, filePath))
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
    await safeWriteFile(this.projectPath, filePath, newContent)
    return `✅ Правки применены: ${filePath}`
  }
}
