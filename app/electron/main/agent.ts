import type {
  AgentSettings,
  AgentStreamPayload,
  ChatMessage
} from '../../src/types'
import { assertPullableToolModel } from '../../shared/recommendedModels'
import { extractEmbeddedToolCalls, sanitizeAssistantContent } from '../../shared/toolCalls'
import {
  MUTATING_TOOLS,
  shouldRetryForMissingTools,
  taskLikelyNeedsMutation,
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
  type SelfImprovementItem
} from '../../shared/selfImprovement'
import { SelfImprovementPlanStore } from './selfImprovementStore'
import { toolRequiresConfirm } from '../../shared/permissions'
import { getModelPlacement } from './ollamaRuntime'
import { isThinkingModel } from '../../shared/reasoning'
import { commitAndPushSelfEdits } from './selfCommit'
import { agentLogger } from './agentLogger'
import { compressContextMessages } from './contextSummarizer'
import { parseOllamaGenerationMetrics } from '../../shared/generationMetrics'
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
}

interface OllamaChatChunk {
  message?: {
    content?: string
    thinking?: string
    tool_calls?: ToolCall[]
  }
  done?: boolean
  eval_count?: number
  eval_duration?: number
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
  private selfImprovementPlan = new SelfImprovementPlanStore()

  constructor(
    private settings: AgentSettings,
    private projectPath: string,
    private emit: (event: AgentStreamPayload) => void,
    private signal?: AbortSignal,
    private confirm?: (toolName: string, toolInput: string) => Promise<boolean>,
    private summarizeModel?: string
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
    const MAX_VERIFICATION_RETRIES = 1
    let selfImprovePlanNudges = 0
    const MAX_SELF_IMPROVE_PLAN_NUDGES = 6

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
          toks_per_sec: response.metrics?.tokensPerSec != null
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

        if (assistantText) {
          messages.push({ role: 'assistant', content: assistantText })
        }

        if (!toolCalls.length) {
          if (autonomousSelfImprove) {
            const adoptedPlan = assistantText
              ? this.adoptPlanFromAssistantText(assistantText)
              : false

            const plan = this.selfImprovementPlan.get()

            if (this.selfImprovementPlan.isComplete()) {
              if (assistantText && !adoptedPlan) {
                this.emit({ type: 'assistant', content: assistantText, thinking: assistantThinking })
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
              if (assistantText && !adoptedPlan) {
                this.emit({ type: 'assistant', content: assistantText, thinking: assistantThinking })
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
                this.emit({ type: 'assistant', content: assistantText, thinking: assistantThinking })
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
            this.emit({ type: 'assistant', content: assistantText, thinking: assistantThinking })
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
      ollamaUrl: this.settings.ollamaUrl,
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
    let thinking = ''
    const toolCalls: ToolCall[] = []
    let evalCount: number | undefined
    let evalDurationNs: number | undefined

    for await (const chunk of readNdjsonLines(res.body, this.signal)) {
      const ollamaChunk = chunk as OllamaChatChunk
      if (ollamaChunk.done || ollamaChunk.eval_count != null || ollamaChunk.eval_duration != null) {
        if (typeof ollamaChunk.eval_count === 'number') evalCount = ollamaChunk.eval_count
        if (typeof ollamaChunk.eval_duration === 'number') evalDurationNs = ollamaChunk.eval_duration
      }

      const message = ollamaChunk.message

      const thinkingPiece = message?.thinking
      if (thinkingPiece) {
        thinking += thinkingPiece
        this.emit({ type: 'thinking', content: thinkingPiece })
      }

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

    const generationMetrics = parseOllamaGenerationMetrics(evalCount, evalDurationNs)
    if (generationMetrics) {
      this.emit({ type: 'generation_metrics', generationMetrics })
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
      ...createProjectToolHandlers(this.projectPath),
      ...createCodeViperToolHandlers(),
      ...createMemoryToolHandlers(this.projectPath, this.emit),
      ...createSkillsToolHandlers(this.projectPath, this.emit),
      ...createSelfImprovementToolHandlers(
        this.selfImprovementPlan,
        (items) => this.emitSelfImprovementPlan(items)
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
