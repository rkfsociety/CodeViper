import type {
  AgentSettings,
  AgentStreamPayload,
  ChatMessage,
  MemoryCategory
} from '../../src/types'
import { assertPullableToolModel } from '../../shared/recommendedModels'
import { isBuiltinSkill } from '../../shared/builtinSkills'
import { extractEmbeddedToolCalls, sanitizeAssistantContent } from '../../shared/toolCalls'
import {
  MUTATING_TOOLS,
  shouldRetryForMissingTools,
  taskLikelyNeedsMutation,
  TOOL_VERIFICATION_FAILED_MESSAGE,
  TOOL_VERIFICATION_NUDGE
} from '../../shared/actionVerification'
import { prepareAgentRunContext, formatFileTree, type OllamaMessage } from './agentContext'
import { AGENT_TOOLS } from './agentTools'
import {
  isSelfImprovementTask,
  selfImprovementStepLimit,
  parsePlanItemsJson,
  parsePlanFromAssistantText,
  syncPlanFromChecklist,
  formatPlanSummary,
  CREATE_SELF_IMPROVEMENT_PLAN_NUDGE,
  SELF_IMPROVE_PLAN_STUCK_MESSAGE,
  START_SELF_IMPROVEMENT_EXPLORATION_NUDGE,
  buildSelfImprovementContinueNudge,
  type SelfImprovementItem
} from '../../shared/selfImprovement'
import {
  resetSelfImprovementPlan,
  setSelfImprovementPlan,
  adoptSelfImprovementPlan,
  completeSelfImprovementItem,
  getSelfImprovementPlan,
  hasSelfImprovementPlan,
  hasPendingSelfImprovementItems,
  isSelfImprovementPlanComplete
} from './selfImprovementStore'
import {
  getCodeViperSourceRoot,
  readCodeViperFile,
  createCodeViperFile,
  editCodeViperFile,
  appendCodeViperFile,
  deleteCodeViperFile,
  moveCodeViperFile,
  runCodeViperCommand,
  writeCodeViperFile,
  isAllowedSelfPath
} from './codeviperSource'
import { parseToolBool } from '../../shared/fileEdit'
import { toolRequiresConfirm } from '../../shared/permissions'
import { getModelPlacement } from './ollamaRuntime'
import { isThinkingModel } from '../../shared/reasoning'
import { commitAndPushSelfEdits } from './selfCommit'
import {
  safeReadFile,
  safeWriteFile,
  safeCreateFile,
  safeEditFile,
  safeAppendFile,
  safeDeleteFile,
  safeMoveFile,
  runCommand,
  buildFileTree,
  isInsideProject
} from './services'
import {
  findFilesInTree,
  formatFindResults,
  formatGrepResults,
  grepInTree
} from './fileSearch'
import { buildModelfile, parseTrainingData, prepareModelFromTrainingFile } from './ollamaModels'
import { compressContextMessages } from './contextSummarizer'
import { readNdjsonLines } from './ndjson'
import {
  addMemory,
  deleteMemory,
  parseReflectionLearnings,
  searchMemories
} from './memory'
import {
  createSkill,
  deleteSkill,
  getSkill,
  listSkills,
  readSkillData,
  touchSkill,
  updateSkill,
  writeSkillData
} from './skills'

interface ToolCall {
  function: {
    name: string
    arguments: Record<string, string> | string
  }
}

interface OllamaChatChunk {
  message?: {
    content?: string
    tool_calls?: ToolCall[]
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function parseToolArgs(args: Record<string, string> | string): Record<string, string> {
  if (typeof args === 'string') {
    return JSON.parse(args) as Record<string, string>
  }
  return args
}

function parseTreeDepth(value: string | undefined): number {
  const depth = Number(value)
  if (!Number.isFinite(depth)) return 3
  return Math.min(5, Math.max(1, Math.round(depth)))
}

function formatCommandResult(result: {
  exitCode: number | null
  stdout: string
  stderr: string
}): string {
  return [
    `exit: ${result.exitCode}`,
    result.stdout ? `stdout:\n${result.stdout}` : '',
    result.stderr ? `stderr:\n${result.stderr}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

// Держим модель «тёплой» в видеопамяти между сообщениями — быстрее ответы.
const OLLAMA_KEEP_ALIVE = '30m'

// Инструменты, меняющие исходники самого CodeViper (для автокоммита самоправок).
const SELF_EDIT_FILE_TOOLS = new Set([
  'write_codeviper_file',
  'create_codeviper_file',
  'edit_codeviper_file',
  'append_codeviper_file',
  'delete_codeviper_file',
  'move_codeviper_file'
])

const REFLECTION_PROMPT = `Проанализируй выполненную задачу. Если есть полезные уроки для будущих задач (ошибки, паттерны проекта, предпочтения пользователя, навыки работы), верни JSON-массив до 2 элементов:
[{"content": "краткий урок", "category": "pattern|mistake|preference|project|skill", "tags": ["тег"]}]
Если уроков нет — верни [].
Только JSON, без пояснений.`

export class AgentRunner {
  constructor(
    private settings: AgentSettings,
    private projectPath: string,
    private emit: (event: AgentStreamPayload) => void,
    private signal?: AbortSignal,
    private confirm?: (toolName: string, toolInput: string) => Promise<boolean>
  ) {}

  private throwIfAborted(): void {
    if (this.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
  }

  private handleAbort(): void {
    this.emit({ type: 'error', content: 'Остановлено пользователем' })
    this.emit({ type: 'done' })
  }

  private emitSelfImprovementPlan(plan: SelfImprovementItem[]): void {
    this.emit({
      type: 'self_improve_plan',
      content: formatPlanSummary(plan),
      planItems: plan
    })
  }

  private adoptPlanFromAssistantText(assistantText: string): boolean {
    if (!hasSelfImprovementPlan()) {
      const parsed = parsePlanFromAssistantText(assistantText)
      if (parsed) {
        adoptSelfImprovementPlan(parsed)
        this.emitSelfImprovementPlan(parsed)
        return true
      }
      return false
    }

    const plan = getSelfImprovementPlan()
    if (plan) {
      syncPlanFromChecklist(assistantText, plan)
    }
    return false
  }

  async run(history: ChatMessage[], userMessage: string): Promise<void> {
    this.throwIfAborted()

    const autonomousSelfImprove = isSelfImprovementTask(userMessage)
    const stepLimit = autonomousSelfImprove
      ? selfImprovementStepLimit(this.settings.maxSteps)
      : this.settings.maxSteps

    if (autonomousSelfImprove) {
      resetSelfImprovementPlan()
    }

    const prepared = await prepareAgentRunContext(
      this.projectPath,
      history,
      userMessage,
      this.settings.model,
      autonomousSelfImprove,
      {
        ollamaUrl: this.settings.ollamaUrl,
        signal: this.signal,
        clarifyMode: this.settings.clarifyMode,
        deepReasoning: this.settings.deepReasoning
      }
    )
    this.throwIfAborted()

    this.emit({ type: 'context', contextPreview: prepared.preview })
    if (prepared.preview.historySummarized) {
      this.emit({
        type: 'context',
        content: `📋 Контекст ~${prepared.preview.contextUsagePercent}% — предыдущая история суммаризирована`
      })
    }

    if (autonomousSelfImprove) {
      this.emit({
        type: 'self_improve_plan',
        content:
          '🔄 Режим автономного самоулучшения: изучу код и буду работать, пока все пункты плана не выполнены.'
      })
    }

    const messages: OllamaMessage[] = prepared.messages

    let usedTools = false
    let gpuChecked = false
    let selfEdited = false
    const mutatingToolsUsed = new Set<string>()
    let verificationRetries = 0
    let verificationNoticeSent = false
    let requireToolNext = false
    const MAX_VERIFICATION_RETRIES = 1
    let selfImprovePlanNudges = 0
    const MAX_SELF_IMPROVE_PLAN_NUDGES = 6

    try {
      for (let step = 0; step < stepLimit; step++) {
        this.throwIfAborted()

        let response
        try {
          response = await this.chat(messages, { requireTool: requireToolNext })
        } catch (error) {
          if (isAbortError(error)) {
            this.handleAbort()
            return
          }
          throw error
        }
        requireToolNext = false

        if (!gpuChecked) {
          gpuChecked = true
          await this.warnIfCpu()
        }

        const assistantText = sanitizeAssistantContent(response.message?.content ?? '')
        const toolCalls: ToolCall[] = response.message?.tool_calls ?? []

        if (assistantText) {
          messages.push({ role: 'assistant', content: assistantText })
        }

        if (!toolCalls.length) {
          if (autonomousSelfImprove) {
            const adoptedPlan = assistantText
              ? this.adoptPlanFromAssistantText(assistantText)
              : false

            const plan = getSelfImprovementPlan()

            if (isSelfImprovementPlanComplete()) {
              if (assistantText && !adoptedPlan) {
                this.emit({ type: 'assistant', content: assistantText })
              }
              if (plan) this.emitSelfImprovementPlan(plan)
              if (this.settings.selfLearning !== false) {
                await this.reflectAndLearn(messages, userMessage, usedTools)
              }
              this.emit({ type: 'done' })
              return
            }

            if (plan && hasPendingSelfImprovementItems()) {
              selfImprovePlanNudges = 0
              if (assistantText && !adoptedPlan) {
                this.emit({ type: 'assistant', content: assistantText })
              }
              this.emitSelfImprovementPlan(plan)
              messages.push({ role: 'user', content: buildSelfImprovementContinueNudge(plan) })
              requireToolNext = true
              continue
            }

            if (!plan && usedTools) {
              selfImprovePlanNudges += 1
              if (selfImprovePlanNudges >= MAX_SELF_IMPROVE_PLAN_NUDGES) {
                if (assistantText) {
                  messages.pop()
                }
                this.emit({ type: 'clear_draft' })
                this.emit({ type: 'error', content: SELF_IMPROVE_PLAN_STUCK_MESSAGE })
                this.emit({ type: 'done' })
                return
              }
              if (assistantText && !adoptedPlan && !parsePlanFromAssistantText(assistantText)) {
                this.emit({ type: 'assistant', content: assistantText })
              }
              messages.push({ role: 'user', content: CREATE_SELF_IMPROVEMENT_PLAN_NUDGE })
              requireToolNext = true
              continue
            }

            if (!plan && !usedTools) {
              if (assistantText) {
                messages.pop()
              }
              this.emit({ type: 'clear_draft' })
              messages.push({ role: 'user', content: START_SELF_IMPROVEMENT_EXPLORATION_NUDGE })
              requireToolNext = true
              continue
            }
          }

          const mutationTask = taskLikelyNeedsMutation(userMessage)
          const noMutatingToolsYet = mutatingToolsUsed.size === 0
          const shouldRetryWithTools =
            shouldRetryForMissingTools(
              userMessage,
              assistantText,
              mutatingToolsUsed,
              usedTools
            ) &&
            verificationRetries < MAX_VERIFICATION_RETRIES

          if (shouldRetryWithTools) {
            verificationRetries += 1
            if (assistantText) {
              messages.pop()
            }
            this.emit({ type: 'clear_draft' })
            if (!verificationNoticeSent) {
              verificationNoticeSent = true
              this.emit({
                type: 'error',
                content:
                  '⚠️ Модель ответила текстом без инструментов — повторяю с обязательным tool call…'
              })
            }
            messages.push({ role: 'user', content: TOOL_VERIFICATION_NUDGE })
            requireToolNext = true
            continue
          }

          if (mutationTask && noMutatingToolsYet && verificationRetries >= MAX_VERIFICATION_RETRIES) {
            if (assistantText) {
              messages.pop()
            }
            this.emit({ type: 'clear_draft' })
            this.emit({ type: 'error', content: TOOL_VERIFICATION_FAILED_MESSAGE })
            this.emit({ type: 'done' })
            return
          }

          if (assistantText) {
            this.emit({ type: 'assistant', content: assistantText })
          }
          if (this.settings.selfLearning !== false) {
            await this.reflectAndLearn(messages, userMessage, mutatingToolsUsed.size > 0)
          }
          this.emit({ type: 'done' })
          return
        }

        usedTools = true

        for (const call of toolCalls) {
          this.throwIfAborted()

          const name = call.function.name
          const args = parseToolArgs(call.function.arguments ?? {})
          const toolInput = JSON.stringify(args, null, 2)
          this.emit({
            type: 'tool_start',
            toolName: name,
            toolInput
          })

          // Подтверждение мутирующих действий согласно режиму доступа.
          if (this.confirm && toolRequiresConfirm(this.settings.permissionMode ?? 'bypass', name)) {
            const approved = await this.confirm(name, toolInput)
            this.throwIfAborted()
            if (!approved) {
              const output = '⛔ Действие отклонено пользователем'
              this.emit({ type: 'tool_end', toolName: name, toolOutput: output })
              messages.push({ role: 'tool', content: `Инструмент ${name}:\n${output}` })
              continue
            }
          }

          let output = ''
          try {
            output = await this.executeTool(name, args)
          } catch (error) {
            output = `Ошибка: ${error instanceof Error ? error.message : String(error)}`
          }

          if (MUTATING_TOOLS.has(name)) {
            mutatingToolsUsed.add(name)
          }

          if (SELF_EDIT_FILE_TOOLS.has(name) && !output.startsWith('Ошибка:')) {
            selfEdited = true
          }

          this.emit({
            type: 'tool_end',
            toolName: name,
            toolOutput: output
          })

          messages.push({
            role: 'tool',
            content: `Инструмент ${name}:\n${output}`
          })
        }
      }

      const pendingPlan = getSelfImprovementPlan()
      const pendingNote =
        autonomousSelfImprove && pendingPlan && hasPendingSelfImprovementItems()
          ? `\nНевыполнено пунктов: ${pendingPlan.filter((item) => !item.done).length}.`
          : ''

      this.emit({
        type: 'error',
        content: `Достигнут лимит шагов агента (${stepLimit}).${pendingNote} Уточните задачу или увеличьте лимит в настройках.`
      })
      this.emit({ type: 'done' })
    } catch (error) {
      if (isAbortError(error)) {
        this.handleAbort()
        return
      }
      throw error
    } finally {
      if (selfEdited && this.settings.autoPushSelfEdits !== false) {
        await this.autoCommitSelfEdits(userMessage)
      }
    }
  }

  private async autoCommitSelfEdits(userMessage: string): Promise<void> {
    try {
      const result = await commitAndPushSelfEdits(userMessage)
      this.emit({
        type: 'context',
        content: result.ok ? `🔁 Самоправки: ${result.message}` : `⚠️ Автокоммит: ${result.message}`
      })
    } catch {
      // автокоммит необязателен — не критично для задачи
    }
  }

  private async chat(messages: OllamaMessage[], options?: { requireTool?: boolean }) {
    this.throwIfAborted()

    const compression = await compressContextMessages({
      messages,
      model: this.settings.model,
      toolsJsonChars: JSON.stringify(AGENT_TOOLS).length,
      ollamaUrl: this.settings.ollamaUrl,
      signal: this.signal
    })

    if (compression.summarized || compression.droppedMessageCount > 0) {
      messages.splice(0, messages.length, ...compression.messages)
      if (compression.summarized) {
        this.emit({
          type: 'context',
          content: `📋 Контекст ~${compression.usagePercent}% — суммаризация в ходе задачи`
        })
      }
    }

    const res = await fetch(`${this.settings.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.settings.model,
        messages,
        tools: AGENT_TOOLS,
        stream: true,
        keep_alive: OLLAMA_KEEP_ALIVE,
        ...(this.settings.deepReasoning && isThinkingModel(this.settings.model)
          ? { think: true }
          : {}),
        ...(options?.requireTool ? { tool_choice: 'required' as const } : {})
      }),
      signal: this.signal
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Ollama: ${res.status} ${text}`)
    }

    if (!res.body) {
      throw new Error('Ollama: пустой ответ (нет body)')
    }

    let content = ''
    const toolCalls: ToolCall[] = []

    for await (const chunk of readNdjsonLines(res.body, this.signal)) {
      const message = chunk.message as OllamaChatChunk['message'] | undefined
      const piece = message?.content
      if (piece) {
        content += piece
        const visible = sanitizeAssistantContent(content)
        const embedded = extractEmbeddedToolCalls(content)
        const isPureToolCall = embedded.toolCalls.length > 0 && !embedded.content.trim()
        if (!isPureToolCall && visible) {
          this.emit({ type: 'token', content: piece })
        }
      }

      if (message?.tool_calls?.length) {
        toolCalls.push(...message.tool_calls)
      }
    }

    const embedded = extractEmbeddedToolCalls(content)
    content = sanitizeAssistantContent(embedded.content)
    for (const call of embedded.toolCalls) {
      toolCalls.push({
        function: {
          name: call.name,
          arguments: call.arguments as Record<string, string>
        }
      })
    }

    return {
      message: {
        content: content.trim() || undefined,
        tool_calls: toolCalls.length ? toolCalls : undefined
      }
    }
  }

  private toolHandlers?: Record<string, (args: Record<string, string>) => Promise<string>>

  private getToolHandlers(): Record<string, (args: Record<string, string>) => Promise<string>> {
    if (this.toolHandlers) return this.toolHandlers

    this.toolHandlers = {
      list_directory: async (args) => {
        const target = args.path?.trim() || this.projectPath
        if (!isInsideProject(this.projectPath, target)) {
          throw new Error('Доступ запрещён: папка вне проекта')
        }
        const tree = await buildFileTree(target, 0, parseTreeDepth(args.max_depth))
        return formatFileTree(tree) || '(пусто)'
      },
      grep_files: async (args) => {
        const subpath = args.path?.trim()
        if (subpath && !isInsideProject(this.projectPath, subpath)) {
          throw new Error('Доступ запрещён: path вне проекта')
        }
        const result = await grepInTree(this.projectPath, args.query, { subpath })
        return formatGrepResults(this.projectPath, args.query, result)
      },
      find_files: async (args) => {
        const subpath = args.path?.trim()
        if (subpath && !isInsideProject(this.projectPath, subpath)) {
          throw new Error('Доступ запрещён: path вне проекта')
        }
        const result = await findFilesInTree(this.projectPath, args.pattern, { subpath })
        return formatFindResults(this.projectPath, args.pattern, result)
      },
      read_file: async (args) => safeReadFile(this.projectPath, args.path),
      write_file: async (args) => {
        await safeWriteFile(this.projectPath, args.path, args.content)
        return `Файл записан: ${args.path}`
      },
      create_file: async (args) => {
        await safeCreateFile(this.projectPath, args.path, args.content)
        return `Файл создан: ${args.path}`
      },
      edit_file: async (args) => {
        const count = await safeEditFile(
          this.projectPath,
          args.path,
          args.old_string,
          args.new_string,
          parseToolBool(args.replace_all)
        )
        return `Файл изменён: ${args.path} (замен: ${count})`
      },
      append_file: async (args) => {
        await safeAppendFile(this.projectPath, args.path, args.content)
        return `Добавлено в конец: ${args.path}`
      },
      delete_file: async (args) => {
        await safeDeleteFile(this.projectPath, args.path)
        return `Файл удалён: ${args.path}`
      },
      move_file: async (args) => {
        await safeMoveFile(this.projectPath, args.from, args.to)
        return `Файл перемещён: ${args.from} → ${args.to}`
      },
      run_command: async (args) => {
        const result = await runCommand(this.projectPath, args.command)
        return formatCommandResult(result)
      },
      remember: async (args) => {
        const entry = await addMemory(this.projectPath, {
          content: args.content,
          category: args.category as MemoryCategory,
          tags: args.tags,
          source: args.source,
          scope: args.scope === 'project' || args.scope === 'global' ? args.scope : undefined
        })
        this.emit({ type: 'learning_saved', content: entry.content, memoryId: entry.id })
        return `Запомнено [${entry.category}/${entry.scope}]: ${entry.content} (id: ${entry.id})`
      },
      search_memory: async (args) => {
        const results = await searchMemories(this.projectPath, args.query, 10)
        return JSON.stringify(results, null, 2)
      },
      forget: async (args) => {
        const removed = await deleteMemory(this.projectPath, args.id)
        return removed ? `Забыто: ${args.id}` : `Запись не найдена: ${args.id}`
      },
      list_skills: async () => {
        const skills = await listSkills(this.projectPath)
        return JSON.stringify(skills, null, 2)
      },
      read_skill: async (args) => {
        const skill = await getSkill(this.projectPath, args.id)
        if (!skill) return `Навык не найден: ${args.id}`
        await touchSkill(this.projectPath, skill.id)
        return JSON.stringify(skill, null, 2)
      },
      create_skill: async (args) => {
        const skill = await createSkill(this.projectPath, {
          name: args.name,
          description: args.description,
          instructions: args.instructions,
          triggers: args.triggers,
          id: args.id
        })
        this.emit({ type: 'skill_saved', content: skill.name, skillId: skill.id })
        return `Навык агента создан (global): ${skill.name} (id: ${skill.id}) → ViperSkills.md`
      },
      update_skill: async (args) => {
        const skill = await updateSkill(this.projectPath, args.id, {
          name: args.name,
          description: args.description,
          instructions: args.instructions,
          triggers: args.triggers
        })
        if (!skill) return `Навык не найден: ${args.id}`
        this.emit({ type: 'skill_saved', content: skill.name, skillId: skill.id })
        return `Навык обновлён: ${skill.name} (id: ${skill.id})`
      },
      delete_skill: async (args) => {
        if (isBuiltinSkill(args.id)) {
          return `Нельзя удалить встроенный навык: ${args.id}`
        }
        const removed = await deleteSkill(this.projectPath, args.id)
        return removed ? `Навык удалён: ${args.id}` : `Навык не найден: ${args.id}`
      },
      read_skill_data: async (args) => {
        const data = await readSkillData(this.projectPath, args.skill_id)
        if (!data) return `Навык не найден: ${args.skill_id}`
        return data.content
      },
      write_skill_data: async (args) => {
        const ok = await writeSkillData(this.projectPath, args.skill_id, args.content)
        return ok ? `Данные навыка записаны: ${args.skill_id}` : `Навык не найден: ${args.skill_id}`
      },
      set_self_improvement_plan: async (args) => {
        const plan = setSelfImprovementPlan(parsePlanItemsJson(args.items))
        this.emitSelfImprovementPlan(plan)
        return `${formatPlanSummary(plan)}\n\nНачни выполнение пункта 1 через инструменты.`
      },
      complete_self_improvement_item: async (args) => {
        const plan = completeSelfImprovementItem(args.id)
        this.emitSelfImprovementPlan(plan)
        const pending = plan.filter((item) => !item.done)
        if (!pending.length) {
          return `Пункт ${args.id} выполнен. Все пункты плана завершены.`
        }
        return `Пункт ${args.id} выполнен. Следующий: «${pending[0].title}» (id: ${pending[0].id})`
      },
      get_self_improvement_plan: async () => {
        const plan = getSelfImprovementPlan()
        if (!plan) return 'План не задан. Вызовите set_self_improvement_plan после изучения кода.'
        return formatPlanSummary(plan)
      },
      list_codeviper_directory: async (args) => {
        const root = getCodeViperSourceRoot()
        const target = args.path?.trim() || root
        if (!isAllowedSelfPath(root, target)) {
          throw new Error('Доступ запрещён: путь вне исходников CodeViper')
        }
        const tree = await buildFileTree(target, 0, parseTreeDepth(args.max_depth))
        return formatFileTree(tree) || '(пусто)'
      },
      grep_codeviper_files: async (args) => {
        const root = getCodeViperSourceRoot()
        const subpath = args.path?.trim()
        if (subpath && !isAllowedSelfPath(root, subpath)) {
          throw new Error('Доступ запрещён: path вне исходников CodeViper')
        }
        const result = await grepInTree(root, args.query, { subpath })
        return formatGrepResults(root, args.query, result)
      },
      find_codeviper_files: async (args) => {
        const root = getCodeViperSourceRoot()
        const subpath = args.path?.trim()
        if (subpath && !isAllowedSelfPath(root, subpath)) {
          throw new Error('Доступ запрещён: path вне исходников CodeViper')
        }
        const result = await findFilesInTree(root, args.pattern, { subpath })
        return formatFindResults(root, args.pattern, result)
      },
      read_codeviper_file: async (args) => readCodeViperFile(args.path),
      write_codeviper_file: async (args) => {
        await writeCodeViperFile(args.path, args.content)
        return `Файл CodeViper записан: ${args.path}`
      },
      create_codeviper_file: async (args) => {
        await createCodeViperFile(args.path, args.content)
        return `Файл CodeViper создан: ${args.path}`
      },
      edit_codeviper_file: async (args) => {
        const count = await editCodeViperFile(
          args.path,
          args.old_string,
          args.new_string,
          parseToolBool(args.replace_all)
        )
        return `Файл CodeViper изменён: ${args.path} (замен: ${count})`
      },
      append_codeviper_file: async (args) => {
        await appendCodeViperFile(args.path, args.content)
        return `Добавлено в конец CodeViper: ${args.path}`
      },
      delete_codeviper_file: async (args) => {
        await deleteCodeViperFile(args.path)
        return `Файл CodeViper удалён: ${args.path}`
      },
      move_codeviper_file: async (args) => {
        await moveCodeViperFile(args.from, args.to)
        return `Файл CodeViper перемещён: ${args.from} → ${args.to}`
      },
      run_codeviper_command: async (args) => {
        const result = await runCodeViperCommand(args.command)
        return formatCommandResult(result)
      },
      preview_ollama_modelfile: async (args) => {
        const raw = await safeReadFile(this.projectPath, args.data_path)
        const examples = parseTrainingData(raw)
        if (!examples.length) {
          return 'Ошибка: в файле нет примеров {user, assistant} (JSON или JSONL).'
        }
        const modelfile = buildModelfile({
          baseModel: args.base_model,
          system: args.system,
          examples,
          temperature: args.temperature ? Number(args.temperature) : undefined
        })
        return `Примеров: ${examples.length}\n\n${modelfile}`
      },
      create_ollama_model: async (args) => {
        const raw = await safeReadFile(this.projectPath, args.data_path)
        const temperature = args.temperature ? Number(args.temperature) : undefined
        const result = await prepareModelFromTrainingFile({
          baseUrl: this.settings.ollamaUrl,
          baseModel: args.base_model,
          modelName: args.model_name,
          trainingRaw: raw,
          system: args.system,
          temperature: Number.isFinite(temperature) ? temperature : undefined,
          signal: this.signal
        })
        return [
          `Модель создана: ${args.model_name}`,
          `Статус Ollama: ${result.status}`,
          `Примеров в Modelfile: ${result.exampleCount}`,
          'Выберите модель в настройках CodeViper или укажите в следующем запросе.',
          '',
          'Modelfile:',
          result.modelfile
        ].join('\n')
      }
    }

    return this.toolHandlers
  }

  private async executeTool(name: string, args: Record<string, string>): Promise<string> {
    const handler = this.getToolHandlers()[name]
    if (!handler) return `Неизвестный инструмент: ${name}`
    return handler(args)
  }

  private async warnIfCpu(): Promise<void> {
    const placement = await getModelPlacement(this.settings.ollamaUrl, this.settings.model)
    if (placement === 'cpu') {
      this.emit({
        type: 'context',
        content:
          '🐢 Модель загружена в RAM (CPU), не в видеопамять — ответы будут медленнее. Проверьте, что Ollama видит GPU (драйверы CUDA/ROCm) или выберите модель меньшего размера.'
      })
    } else if (placement === 'partial') {
      this.emit({
        type: 'context',
        content: '⚙️ Модель размещена частично в GPU и RAM — для скорости можно выбрать модель меньшего размера.'
      })
    }
  }

  private async reflectAndLearn(
    messages: OllamaMessage[],
    userMessage: string,
    hadMutations: boolean
  ): Promise<void> {
    // Рефлексия (доп. запрос к модели) имеет смысл только после реальных изменений,
    // а не после чисто исследовательских задач (read_file/grep/...).
    if (!hadMutations) return

    try {
      const res = await fetch(`${this.settings.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.settings.model,
          messages: [...messages, { role: 'user', content: REFLECTION_PROMPT }],
          stream: false,
          keep_alive: OLLAMA_KEEP_ALIVE
        }),
        signal: this.signal
      })

      if (!res.ok) return

      const data = (await res.json()) as { message?: { content?: string } }
      const learnings = parseReflectionLearnings(data.message?.content ?? '')

      for (const learning of learnings) {
        const entry = await addMemory(this.projectPath, {
          ...learning,
          source: userMessage.slice(0, 120)
        })
        this.emit({
          type: 'learning_saved',
          content: entry.content,
          memoryId: entry.id
        })
      }
    } catch {
      // рефлексия необязательна
    }
  }
}

export async function fetchOllamaModels(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error('Ollama недоступна')
  const data = (await res.json()) as {
    models?: Array<{ name: string; size: number; modified_at: string }>
  }
  return (data.models ?? []).map((m) => ({
    name: m.name,
    size: m.size,
    modifiedAt: m.modified_at
  }))
}

export async function pingOllama(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) })
    return res.ok
  } catch {
    return false
  }
}

export interface OllamaPullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
}

export async function pullOllamaModel(
  baseUrl: string,
  model: string,
  onProgress: (progress: OllamaPullProgress) => void
): Promise<void> {
  assertPullableToolModel(model)

  const res = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama pull: ${res.status} ${text}`)
  }

  if (!res.body) {
    throw new Error('Ollama: пустой ответ при скачивании')
  }

  for await (const chunk of readNdjsonLines(res.body)) {
    onProgress({
      status: String(chunk.status ?? ''),
      digest: chunk.digest as string | undefined,
      total: chunk.total as number | undefined,
      completed: chunk.completed as number | undefined
    })
  }
}

export async function deleteOllamaModel(baseUrl: string, model: string): Promise<void> {
  const trimmed = model.trim()
  if (!trimmed) throw new Error('Укажите имя модели для удаления')

  const url = baseUrl.replace(/\/$/, '')
  const res = await fetch(`${url}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: trimmed }),
    signal: AbortSignal.timeout(15_000)
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama delete: ${res.status} ${text}`)
  }
}
