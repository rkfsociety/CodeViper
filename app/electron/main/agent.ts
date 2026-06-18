import type { AgentSettings, AgentStreamPayload, ChatMessage } from '../../src/types'
import { assertPullableToolModel } from '../../shared/recommendedModels'
import { escalateModel } from '../../shared/modelRouter'
import {
  extractEmbeddedToolCalls,
  sanitizeAssistantContent,
  isRefusalResponse
} from '../../shared/toolCalls'
import {
  MUTATING_TOOLS,
  shouldRetryForMissingTools,
  taskLikelyNeedsMutation,
  taskLikelyNeedsTools,
  TOOL_VERIFICATION_FAILED_MESSAGE,
  TOOL_VERIFICATION_NUDGE
} from '../../shared/actionVerification'
import { prepareAgentRunContext, type OllamaMessage } from './agentContext'
import { AGENT_TOOLS, type ToolHandlers, type ToolName } from './agentTools'
import {
  isSelfImprovementTask,
  selfImprovementStepLimit,
  parsePlanFromAssistantText,
  syncPlanFromChecklist,
  formatPlanSummary,
  CREATE_SELF_IMPROVEMENT_PLAN_NUDGE,
  SELF_IMPROVE_PLAN_STUCK_MESSAGE,
  START_SELF_IMPROVEMENT_EXPLORATION_NUDGE,
  buildSelfImprovementContinueNudge,
  incrementAttempt,
  type SelfImprovementItem
} from '../../shared/selfImprovement'
import { SelfImprovementPlanStore } from './selfImprovementStore'
import { toolRequiresConfirm } from '../../shared/permissions'
import { ModelRuntime } from './modelRuntime'
import type { ProviderConfig } from '../../shared/modelProvider'
import { commitAndPushSelfEdits } from './selfCommit'
import { agentLogger } from './agentLogger'
import { compressContextMessages } from './contextSummarizer'
import { parseOllamaGenerationMetrics } from '../../shared/generationMetrics'
import { DEEPSEEK_API_BASE_URL, DEEPSEEK_MODEL_DEFAULT } from '../../shared/constants'
import { readNdjsonLines } from './ndjson'
import { parseReflectionLearnings, addMemory } from './memory'
import { createProjectToolHandlers } from './agentHandlersProject'
import { createCodeViperToolHandlers } from './agentHandlersCodeViper'
import { createMemoryToolHandlers } from './agentHandlersMemory'
import { createSkillsToolHandlers } from './agentHandlersSkills'
import { createSelfImprovementToolHandlers } from './agentHandlersSelfImprovement'
import { createModelToolHandlers } from './agentHandlersModels'

interface ToolCall {
  function: {
    name: string
    arguments: Record<string, string> | string
  }
  /** ID для нативного tool calling (cloud-провайдеры). */
  id?: string
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function parseToolArgs(args: Record<string, string> | string): Record<string, string> {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as Record<string, string>
    } catch {
      // Модель иногда возвращает строку-аргумент вместо JSON-объекта.
      // Передаём как есть, чтобы обработчик мог вернуть внятную ошибку.
      return { _raw: args }
    }
  }
  return args
}

// Держим модель «тёплой» в видеопамяти между сообщениями — быстрее ответы.
const OLLAMA_KEEP_ALIVE = '30m'

// Read-only инструменты — безопасно запускать параллельно (Promise.all).
const PARALLEL_SAFE_TOOLS = new Set([
  'read_file',
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
  'search_memory',
  'list_skills',
  'read_skill',
  'read_skill_data',
  'get_self_improvement_plan',
  'preview_ollama_modelfile'
])

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
  private selfImprovementPlan = new SelfImprovementPlanStore()
  private modelRuntime: ModelRuntime
  private providerConfig: ProviderConfig
  private sessionTokens = 0

  constructor(
    private settings: AgentSettings,
    private projectPath: string,
    private emit: (event: AgentStreamPayload) => void,
    private signal?: AbortSignal,
    private confirm?: (toolName: string, toolInput: string) => Promise<boolean>,
    private summarizeModel?: string
  ) {
    const providerType = this.settings.modelProvider || 'ollama'
    const providerBaseUrl =
      providerType === 'deepseek' ? DEEPSEEK_API_BASE_URL : this.settings.ollamaUrl
    // Если провайдер — DeepSeek, но модель выглядит как Ollama-модель — подставляем дефолт
    const providerModel =
      providerType === 'deepseek' && !/^deepseek/i.test(this.settings.model || '')
        ? DEEPSEEK_MODEL_DEFAULT
        : this.settings.model
    this.providerConfig = {
      type: providerType,
      baseUrl: providerBaseUrl,
      apiKey: this.settings.providerApiKey,
      model: providerModel
    }
    this.modelRuntime = new ModelRuntime(this.providerConfig)
  }

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
    if (!this.selfImprovementPlan.has()) {
      const parsed = parsePlanFromAssistantText(assistantText)
      if (parsed) {
        this.selfImprovementPlan.adopt(parsed)
        this.emitSelfImprovementPlan(parsed)
        return true
      }
      return false
    }

    const plan = this.selfImprovementPlan.get()
    if (plan) {
      syncPlanFromChecklist(assistantText, plan)
    }
    return false
  }

  async run(history: ChatMessage[], userMessage: string): Promise<void> {
    this.throwIfAborted()

    const runStartMs = Date.now()
    void agentLogger.write({
      event: 'run_start',
      model: this.settings.model,
      message: userMessage.slice(0, 200)
    })

    const autonomousSelfImprove = isSelfImprovementTask(userMessage)
    const stepLimit = autonomousSelfImprove
      ? selfImprovementStepLimit(this.settings.maxSteps)
      : this.settings.maxSteps

    if (autonomousSelfImprove) {
      this.selfImprovementPlan.reset()
    }

    const prepared = await prepareAgentRunContext(
      this.projectPath,
      history,
      userMessage,
      this.settings.model,
      autonomousSelfImprove,
      {
        ollamaUrl: this.settings.ollamaUrl,
        providerConfig: this.providerConfig,
        signal: this.signal,
        clarifyMode: this.settings.clarifyMode,
        deepReasoning: this.settings.deepReasoning,
        summarizeModel: this.summarizeModel
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
    let escalated = false
    const MAX_VERIFICATION_RETRIES = 1
    let selfImprovePlanNudges = 0
    let currentPlanItemId: string | null = null
    const MAX_SELF_IMPROVE_PLAN_NUDGES = 20

    try {
      for (let step = 0; step < stepLimit; step++) {
        this.throwIfAborted()

        const stepStartMs = Date.now()
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
        void agentLogger.write({
          event: 'llm_response',
          step,
          model: this.settings.model,
          duration_ms: Date.now() - stepStartMs,
          tokens: response.metrics?.evalCount,
          toks_per_sec:
            response.metrics?.tokensPerSec != null
              ? Math.round(response.metrics.tokensPerSec * 10) / 10
              : undefined,
          has_tools: (response.message?.tool_calls?.length ?? 0) > 0,
          has_thinking: !!response.message?.thinking
        })

        if (!gpuChecked) {
          gpuChecked = true
          await this.warnIfCpu()
        }

        const assistantText = sanitizeAssistantContent(response.message?.content ?? '')
        const assistantThinking = response.message?.thinking
        const toolCalls: ToolCall[] = response.message?.tool_calls ?? []

        const isCloudProviderRun = this.providerConfig.type !== 'ollama'
        const hasNativeToolCalls = isCloudProviderRun && toolCalls.some((tc) => tc.id)

        if (assistantText) {
          const assistantMsg: OllamaMessage = { role: 'assistant', content: assistantText }
          // Cloud: если были нативные tool calls, добавляем их к assistant-сообщению
          if (hasNativeToolCalls) {
            assistantMsg.tool_calls = toolCalls
              .filter((tc) => tc.id)
              .map((tc) => ({
                id: tc.id!,
                type: 'function' as const,
                function: {
                  name: tc.function.name,
                  arguments:
                    typeof tc.function.arguments === 'string'
                      ? tc.function.arguments
                      : JSON.stringify(tc.function.arguments)
                }
              }))
          }
          messages.push(assistantMsg)
        } else if (hasNativeToolCalls) {
          // Cloud: пустой текст, только tool_calls — всё равно нужен assistant-чанк в истории
          messages.push({
            role: 'assistant',
            content: '',
            tool_calls: toolCalls
              .filter((tc) => tc.id)
              .map((tc) => ({
                id: tc.id!,
                type: 'function' as const,
                function: {
                  name: tc.function.name,
                  arguments:
                    typeof tc.function.arguments === 'string'
                      ? tc.function.arguments
                      : JSON.stringify(tc.function.arguments)
                }
              }))
          })
        }

        if (!toolCalls.length) {
          if (autonomousSelfImprove) {
            const adoptedPlan = assistantText
              ? this.adoptPlanFromAssistantText(assistantText)
              : false

            const plan = this.selfImprovementPlan.get()

            if (this.selfImprovementPlan.isComplete()) {
              if (assistantText && !adoptedPlan) {
                this.emit({
                  type: 'assistant',
                  content: assistantText,
                  thinking: assistantThinking
                })
              }
              if (plan) this.emitSelfImprovementPlan(plan)
              if (this.settings.selfLearning !== false) {
                await this.reflectAndLearn(messages, userMessage, usedTools)
              }
              this.emit({ type: 'done' })
              return
            }

            if (plan && this.selfImprovementPlan.hasPending()) {
              selfImprovePlanNudges = 0

              // Если не удалось завершить текущий пункт — инкрементируем попытку
              if (currentPlanItemId && !assistantText?.includes('complete_self_improvement_item')) {
                const currentItem = plan.find((item) => item.id === currentPlanItemId)
                if (currentItem && !currentItem.done) {
                  const attemptNum = incrementAttempt(currentItem)
                  if (currentItem.blocked) {
                    this.emit({
                      type: 'context',
                      content: `🚫 Пункт «${currentItem.title}» заблокирован после ${attemptNum} попыток`
                    })
                  }
                }
              }

              if (assistantText && !adoptedPlan) {
                this.emit({
                  type: 'assistant',
                  content: assistantText,
                  thinking: assistantThinking
                })
              }
              this.emitSelfImprovementPlan(plan)
              const nextItem = plan.find((item) => !item.done && !item.blocked)
              if (nextItem) {
                currentPlanItemId = nextItem.id
              }
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
                this.emit({
                  type: 'assistant',
                  content: assistantText,
                  thinking: assistantThinking
                })
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

          // Явный рефьюзал («я не могу», «напрямую из чата» и т.п.) → сразу эскалируем модель
          if (
            !escalated &&
            assistantText &&
            isRefusalResponse(assistantText) &&
            this.settings.autoModel !== false
          ) {
            const models = await fetchOllamaModels(this.settings.ollamaUrl).catch(() => [])
            const nextModel = escalateModel(this.settings.model, models)
            if (nextModel) {
              escalated = true
              messages.pop()
              this.emit({ type: 'clear_draft' })
              this.emit({
                type: 'context',
                content: `🔄 Модель **${this.settings.model}** отказалась от задачи — переключаюсь на **${nextModel}**…`
              })
              this.settings = { ...this.settings, model: nextModel }
              requireToolNext = true
              continue
            }
          }

          const mutationTask = taskLikelyNeedsMutation(userMessage)
          const noMutatingToolsYet = mutatingToolsUsed.size === 0
          const shouldRetryWithTools =
            shouldRetryForMissingTools(userMessage, assistantText, mutatingToolsUsed, usedTools) &&
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

          // Задача требовала инструментов, но после всех повторов модель так и не
          // вызвала ни одного (касается и мутаций, и read-обзоров) — сообщаем явно.
          const toolTaskUnfulfilled =
            taskLikelyNeedsTools(userMessage) && (mutationTask ? noMutatingToolsYet : !usedTools)
          if (toolTaskUnfulfilled && verificationRetries >= MAX_VERIFICATION_RETRIES) {
            if (assistantText) {
              messages.pop()
            }
            this.emit({ type: 'clear_draft' })
            this.emit({ type: 'error', content: TOOL_VERIFICATION_FAILED_MESSAGE })
            this.emit({ type: 'done' })
            return
          }

          if (assistantText) {
            this.emit({ type: 'assistant', content: assistantText, thinking: assistantThinking })
          } else if (!autonomousSelfImprove) {
            // Модель вернула пустой ответ и не вызвала инструменты — не молчим.
            this.emit({
              type: 'error',
              content:
                'Модель вернула пустой ответ и не вызвала инструменты. Выбери модель с поддержкой function calling (например deepseek-chat или qwen2.5-coder) или переформулируй задачу.'
            })
          }
          if (this.settings.selfLearning !== false) {
            await this.reflectAndLearn(messages, userMessage, mutatingToolsUsed.size > 0)
          }
          this.emit({ type: 'done' })
          return
        }

        usedTools = true

        // Все вызовы read-only и не требуют подтверждения → запускаем параллельно.
        const allParallelSafe =
          toolCalls.length > 1 &&
          toolCalls.every((call) => {
            const n = call.function.name
            return (
              PARALLEL_SAFE_TOOLS.has(n) &&
              !toolRequiresConfirm(this.settings.permissionMode ?? 'bypass', n)
            )
          })

        if (allParallelSafe) {
          const parsedCalls = toolCalls.map((call) => ({
            id: call.id,
            name: call.function.name,
            args: parseToolArgs(call.function.arguments ?? {})
          }))

          for (const { name, args } of parsedCalls) {
            this.emit({
              type: 'tool_start',
              toolName: name,
              toolInput: JSON.stringify(args, null, 2)
            })
          }

          const results = await Promise.all(
            parsedCalls.map(async ({ id, name, args }) => {
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
            })
          )

          for (const { id, name, output } of results) {
            this.emit({ type: 'tool_end', toolName: name, toolOutput: output })
            const toolMsg: OllamaMessage = {
              role: 'tool',
              content: `Инструмент ${name}:\n${output}`
            }
            if (id) toolMsg.tool_call_id = id
            messages.push(toolMsg)
          }
        } else {
          for (const call of toolCalls) {
            this.throwIfAborted()

            const name = call.function.name
            const args = parseToolArgs(call.function.arguments ?? {})
            const toolInput = JSON.stringify(args, null, 2)
            this.emit({ type: 'tool_start', toolName: name, toolInput })

            // Подтверждение мутирующих действий согласно режиму доступа.
            if (
              this.confirm &&
              toolRequiresConfirm(this.settings.permissionMode ?? 'bypass', name)
            ) {
              const approved = await this.confirm(name, toolInput)
              this.throwIfAborted()
              if (!approved) {
                const output = '⛔ Действие отклонено пользователем'
                this.emit({ type: 'tool_end', toolName: name, toolOutput: output })
                const rejMsg: OllamaMessage = {
                  role: 'tool',
                  content: `Инструмент ${name}:\n${output}`
                }
                if (call.id) rejMsg.tool_call_id = call.id
                messages.push(rejMsg)
                continue
              }
            }

            void agentLogger.write({ event: 'tool_call', step, tool: name, args: args })
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

            if (MUTATING_TOOLS.has(name)) {
              mutatingToolsUsed.add(name)
            }

            if (SELF_EDIT_FILE_TOOLS.has(name) && !output.startsWith('Ошибка:')) {
              selfEdited = true
            }

            this.emit({ type: 'tool_end', toolName: name, toolOutput: output })
            const seqMsg: OllamaMessage = {
              role: 'tool',
              content: `Инструмент ${name}:\n${output}`
            }
            if (call.id) seqMsg.tool_call_id = call.id
            messages.push(seqMsg)
          }
        }
      }

      const pendingPlan = this.selfImprovementPlan.get()
      const pendingNote =
        autonomousSelfImprove && pendingPlan && this.selfImprovementPlan.hasPending()
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
      void agentLogger.write({
        event: 'run_end',
        model: this.settings.model,
        total_ms: Date.now() - runStartMs
      })
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

    let compressionNotified = false
    const compression = await compressContextMessages({
      messages,
      model: this.settings.model,
      summarizeModel: this.summarizeModel,
      toolsJsonChars: JSON.stringify(AGENT_TOOLS).length,
      providerConfig: this.providerConfig,
      signal: this.signal,
      onCompressStart: () => {
        compressionNotified = true
        this.emit({ type: 'context', summarizing: true })
      }
    })

    if (compressionNotified) {
      this.emit({ type: 'context', summarizing: false })
    }

    if (compression.summarized || compression.droppedMessageCount > 0) {
      messages.splice(0, messages.length, ...compression.messages)
      if (compression.summarized) {
        this.emit({
          type: 'context',
          content: `📋 Контекст ~${compression.usagePercent}% — суммаризация в ходе задачи`
        })
      }
    }

    let content = ''
    let thinking = ''
    const toolCalls: ToolCall[] = []
    let evalCount: number | undefined
    let evalDurationNs: number | undefined
    let nativeToolCalls: ToolCall[] | undefined

    const isCloudProvider = this.providerConfig.type !== 'ollama'

    // Строим массив сообщений для провайдера.
    // Для Ollama: фильтруем ВСЕ role:tool (Ollama использует embedded JSON).
    // Для cloud: включаем tool-результаты только из текущего прогона (с tool_call_id);
    // история tool-сообщений без tool_call_id вызывает 400 в DeepSeek/OpenAI.
    // Дополнительно: assistant-сообщения с tool_calls без следующего tool-результата
    // тоже нарушают протокол → убираем их через look-ahead.
    let filteredMessages = messages
    if (isCloudProvider) {
      // Проход 1: убираем tool-сообщения без tool_call_id и orphan assistant+tool_calls
      // (тех, чьи ID не покрыты ни одним tool-результатом в messages).
      const coveredIds = new Set(messages.filter((m) => m.tool_call_id).map((m) => m.tool_call_id!))
      const pass1 = messages.filter((msg) => {
        if (msg.role === 'tool') return !!msg.tool_call_id
        if (msg.role === 'assistant' && msg.tool_calls?.length) {
          return msg.tool_calls.every((tc) => coveredIds.has(tc.id))
        }
        return true
      })
      // Проход 2: убираем tool-сообщения, чей tool_call_id не присутствует ни в одном
      // assistant-сообщении из pass1. Это возможно после суммаризации контекста, когда
      // assistant+tool_calls попадает в сжатую часть, а tool-результат — в «recent».
      const assistantCallIds = new Set<string>()
      for (const msg of pass1) {
        if (msg.role === 'assistant' && msg.tool_calls?.length) {
          for (const tc of msg.tool_calls) assistantCallIds.add(tc.id)
        }
      }
      filteredMessages = pass1.filter(
        (msg) =>
          !(msg.role === 'tool' && msg.tool_call_id && !assistantCallIds.has(msg.tool_call_id))
      )
    } else {
      filteredMessages = messages.filter((msg) => msg.role !== 'tool')
    }

    const chatMessages = filteredMessages.map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
      content: msg.content,
      ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
      ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {})
    }))

    // Трансформируем AGENT_TOOLS в формат провайдеров (name + description + input_schema)
    const toolsForProvider = AGENT_TOOLS.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters
    }))

    // Используем ModelRuntime для универсальной поддержки разных провайдеров
    const chatOptions = {
      model: this.settings.model,
      messages: chatMessages,
      tools: toolsForProvider,
      stream: true,
      keep_alive: OLLAMA_KEEP_ALIVE as string | number,
      signal: this.signal,
      ...(isCloudProvider ? { max_tokens: 4096, temperature: 0.1 } : {}),
      ...(options?.requireTool ? { tool_choice: 'required' as const } : {})
    }

    for await (const chunk of this.modelRuntime.chat(chatOptions)) {
      if (chunk.eval_count != null) evalCount = chunk.eval_count
      if (chunk.eval_duration != null) evalDurationNs = chunk.eval_duration

      const thinkingPiece = chunk.thinking
      if (thinkingPiece) {
        thinking += thinkingPiece
        this.emit({ type: 'thinking', content: thinkingPiece })
      }

      // Нативные tool calls от cloud-провайдера (DeepSeek, OpenAI)
      if (chunk.tool_calls?.length) {
        nativeToolCalls = chunk.tool_calls.map((tc) => ({
          id: tc.id,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments as Record<string, string> | string
          }
        }))
      }

      const piece = chunk.content
      if (piece) {
        content += piece
        const visible = sanitizeAssistantContent(content)
        const embedded = extractEmbeddedToolCalls(content)
        const isPureToolCall = embedded.toolCalls.length > 0 && !embedded.content.trim()
        if (!isPureToolCall && visible) {
          this.emit({ type: 'token', content: piece })
        }
      }

      if (chunk.total_tokens != null) {
        this.sessionTokens += chunk.total_tokens
      }
    }

    const ollamaMetrics = parseOllamaGenerationMetrics(evalCount, evalDurationNs)

    if (ollamaMetrics) {
      this.emit({ type: 'generation_metrics', generationMetrics: ollamaMetrics })
    } else if (isCloudProvider && this.sessionTokens > 0) {
      this.emit({
        type: 'generation_metrics',
        generationMetrics: {
          evalCount: 0,
          evalDurationSec: 0,
          tokensPerSec: 0,
          sessionTokens: this.sessionTokens
        }
      })
    }

    // Cloud-провайдеры: используем нативные tool calls если есть
    if (nativeToolCalls?.length) {
      for (const tc of nativeToolCalls) {
        toolCalls.push(tc)
      }
    } else {
      // Ollama: извлекаем tool calls из embedded JSON в тексте
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
    }

    return {
      message: {
        content: content.trim() || undefined,
        thinking: thinking.trim() || undefined,
        tool_calls: toolCalls.length ? toolCalls : undefined
      },
      metrics: parseOllamaGenerationMetrics(evalCount, evalDurationNs)
    }
  }

  private toolHandlers?: ToolHandlers

  private getToolHandlers(): ToolHandlers {
    if (this.toolHandlers) return this.toolHandlers

    this.toolHandlers = {
      ...createProjectToolHandlers(
        this.projectPath,
        this.settings.commandTimeoutSec != null
          ? this.settings.commandTimeoutSec * 1000
          : undefined,
        { readonlyMode: this.settings.readonlyMode }
      ),
      ...createCodeViperToolHandlers(),
      ...createMemoryToolHandlers(this.projectPath, this.emit, this.settings.ollamaUrl),
      ...createSkillsToolHandlers(this.projectPath, this.emit),
      ...createSelfImprovementToolHandlers(this.selfImprovementPlan, (items) =>
        this.emitSelfImprovementPlan(items)
      ),
      ...createModelToolHandlers(this.projectPath, this.settings, this.signal)
    } as ToolHandlers

    return this.toolHandlers
  }

  private async executeTool(name: string, args: Record<string, string>): Promise<string> {
    const handler = this.getToolHandlers()[name as ToolName] as
      | ((args: Record<string, string>) => Promise<string>)
      | undefined
    if (!handler) return `Неизвестный инструмент: ${name}`
    return handler(args)
  }

  private async warnIfCpu(): Promise<void> {
    const placement = await this.modelRuntime.getModelPlacement(this.settings.model)
    if (placement === 'cpu') {
      this.emit({
        type: 'context',
        content:
          '🐢 Модель загружена в RAM (CPU), не в видеопамять — ответы будут медленнее. Проверьте, что Ollama видит GPU (драйверы CUDA/ROCm) или выберите модель меньшего размера.'
      })
    } else if (placement === 'partial') {
      this.emit({
        type: 'context',
        content:
          '⚙️ Модель размещена частично в GPU и RAM — для скорости можно выбрать модель меньшего размера.'
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
      let reflectionContent = ''

      // Конвертируем OllamaMessage в ChatMessage для рефлексии
      const reflectionMessages = messages
        .filter((msg) => msg.role !== 'tool')
        .map((msg) => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content
        }))

      for await (const chunk of this.modelRuntime.chat({
        model: this.settings.model,
        messages: [...reflectionMessages, { role: 'user', content: REFLECTION_PROMPT }],
        keep_alive: OLLAMA_KEEP_ALIVE as string | number,
        signal: this.signal
      })) {
        reflectionContent += chunk.content
      }

      const learnings = parseReflectionLearnings(reflectionContent)

      for (const learning of learnings) {
        const entry = await addMemory(
          this.projectPath,
          { ...learning, source: userMessage.slice(0, 120) },
          this.settings.ollamaUrl
        )
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
