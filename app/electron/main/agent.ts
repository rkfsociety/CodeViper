import type { AgentSettings, AgentStreamPayload, ChatMessage } from '../../src/types'
import { sanitizeAssistantContent } from '../../shared/toolCalls'
import {
  MUTATING_TOOLS,
  TOOL_VERIFICATION_FAILED_MESSAGE,
  TOOL_VERIFICATION_NUDGE
} from '../../shared/actionVerification'
import { prepareAgentRunContext, maybeAppendRagSearchHintAfterEmptyGrep } from './agentContext'
import { buildVectorStoreConfig } from './vectorStore'
import { SelfImprovementPlanStore } from './selfImprovementStore'
import { agentLogger } from './agentLogger'
import { TaskPlanner } from './taskPlanner'
import { CircuitBreakerOpenError } from './modelRuntime'
import { ensureSelfImproveBranch } from './selfCommit'
import { resolveSelfImproveBranch } from '../../shared/selfImprovement'
import { flushCollectiveMemoryToGit, getPendingCollectiveMemoryCount } from './collectiveMemorySync'
import { notifyWebhook } from './webhookNotify'
import { analyze } from './orchestratorModel'
import { runSubagent } from './subagentRunner'

import { ResponseEmitter } from './agentResponseEmitter'
import { LoopGuard } from './agentLoopGuard'
import { ContextManager } from './agentContextManager'
import { ToolExecutor, PARALLEL_SAFE_TOOLS, parseToolArgs } from './agentToolExecutor'
import { SelfImprovementOrchestrator } from './agentSelfImprovementOrchestrator'
import { toolRequiresConfirm } from '../../shared/permissions'
import { clearRunCheckpoint, ensureRunCheckpoint } from './runCheckpoint'
import {
  reserveIncomingP2pTask,
  releaseP2pTaskSlot,
  resolveP2pTaskPrompt,
  type P2pAcceptResult,
  type P2pIncomingTask
} from './p2pClient'

export { parseToolArgs } from './agentToolExecutor'
export {
  fetchOllamaModels,
  fetchOllamaModelsWithDetails,
  pingOllama,
  pullOllamaModel,
  deleteOllamaModel,
  type OllamaPullProgress
} from './agentOllamaApi'

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * Принять и выполнить входящую P2P-задачу.
 * Перед запуском проверяет нагрузку CPU/GPU; при превышении лимитов — пауза.
 */
export async function runIncomingP2pTask(
  settings: AgentSettings,
  projectPath: string,
  task: P2pIncomingTask,
  emit: (event: AgentStreamPayload) => void,
  signal?: AbortSignal
): Promise<P2pAcceptResult> {
  const accept = await reserveIncomingP2pTask(settings, task)
  if (!accept.accepted) return accept

  const prompt = resolveP2pTaskPrompt(task, settings)
  if (!prompt.trim()) {
    releaseP2pTaskSlot()
    return { accepted: false, paused: false, message: 'пустой промпт P2P-задачи' }
  }

  try {
    const runner = new AgentRunner(
      settings,
      projectPath,
      emit,
      signal,
      undefined,
      undefined,
      undefined,
      `p2p-${task.id}`
    )
    await runner.run([], prompt)
    return { accepted: true, paused: false, message: 'задача выполнена' }
  } finally {
    releaseP2pTaskSlot()
  }
}

export class AgentRunner {
  private readonly selfImprovementPlan = new SelfImprovementPlanStore()
  private settings: AgentSettings

  private readonly emitter: ResponseEmitter
  private readonly ctx: ContextManager
  private readonly toolExecutor: ToolExecutor
  private readonly selfImproveOrchestrator: SelfImprovementOrchestrator

  constructor(
    settings: AgentSettings,
    private readonly projectPath: string,
    emit: (event: AgentStreamPayload) => void,
    signal?: AbortSignal,
    confirm?: (toolName: string, toolInput: string) => Promise<boolean>,
    _summarizeModel?: string,
    previewFn?: (previewId: string) => Promise<boolean>,
    private readonly chatId?: string
  ) {
    this.settings = settings
    this.emitter = new ResponseEmitter(emit, signal)
    this.ctx = new ContextManager(settings, this.emitter, signal)

    this.toolExecutor = new ToolExecutor(
      projectPath,
      settings,
      emit,
      signal,
      confirm,
      previewFn,
      this.selfImprovementPlan,
      (items) => this.selfImproveOrchestrator.emitPlan(items)
    )

    // Нужно зарегистрировать preview_edit/preview_patch через ссылку на методы ToolExecutor.
    this.toolExecutor.overrideHandlers({
      preview_edit: (args: any) => this.toolExecutor.handlePreviewEdit(args),
      preview_patch: (args: any) => this.toolExecutor.handlePreviewPatch(args)
    })

    this.selfImproveOrchestrator = new SelfImprovementOrchestrator(
      this.selfImprovementPlan,
      emit,
      this.ctx.modelRuntime,
      settings,
      projectPath,
      signal
    )
  }

  async run(history: ChatMessage[], userMessage: string): Promise<void> {
    this.emitter.throwIfAborted()
    this.toolExecutor.clearEditSnapshots?.()
    if (this.chatId) clearRunCheckpoint(this.chatId)

    let runCheckpointEmitted = false

    const runStartMs = Date.now()
    void agentLogger.write({
      event: 'run_start',
      model: this.settings.model,
      message: userMessage.slice(0, 200)
    })
    this.emitter.trace(
      'run_start',
      `▶ Старт — модель: ${this.settings.model} (${this.ctx.providerConfig.type})`,
      {
        model: this.settings.model,
        provider: this.ctx.providerConfig.type,
        message: userMessage
      }
    )

    const taskMode = TaskPlanner.detectMode(userMessage)
    if (taskMode === 'self-improve') {
      this.selfImprovementPlan.reset()
      if (this.settings.autoPushSelfEdits !== false) {
        const branchResult = await ensureSelfImproveBranch(this.settings.selfImproveBranch)
        const branchName =
          branchResult.branch ?? resolveSelfImproveBranch(this.settings.selfImproveBranch)
        if (branchResult.ok) {
          this.emitter.emit({
            type: 'context',
            content: `🌿 Ветка самоулучшения: ${branchName}`
          })
        } else {
          this.emitter.emit({
            type: 'context',
            content: `⚠️ Ветка самоулучшения: ${branchResult.message}`
          })
        }
      }
    }

    let effectiveMessage = userMessage
    let orchestratorPlanHint = ''
    let orchestratorIsComplex = false

    const minLen = this.settings.orchestratorMinMessageLength ?? 30
    if (
      this.settings.orchestratorEnabled &&
      this.settings.orchestratorModelPath &&
      userMessage.length >= minLen
    ) {
      this.emitter.emit({ type: 'orchestrating', orchestrating: true })
      try {
        const result = await analyze(userMessage, this.settings.orchestratorModelPath)
        orchestratorIsComplex = result.isComplex
        if (result.isComplex && result.rephrased) {
          effectiveMessage = result.rephrased
        }
        if (result.plan) {
          orchestratorPlanHint = result.plan
        }
        this.emitter.emit({
          type: 'orchestrating',
          orchestrating: false,
          content: result.plan || undefined
        })
      } catch {
        // оркестратор не критичен — продолжаем без плана
        this.emitter.emit({ type: 'orchestrating', orchestrating: false })
      }
    }

    // ── Explorer субагент: разведка проекта перед сложными задачами ──────────
    let explorerSummary = ''
    if (
      this.settings.explorerEnabled &&
      this.projectPath &&
      taskMode !== 'self-improve' &&
      this.settings.chatMode !== true
    ) {
      // Сложность: либо оркестратор сказал isComplex, либо эвристика
      const complexByHeuristic =
        !this.settings.orchestratorEnabled &&
        userMessage.length > 120 &&
        /\b(найди|рефактор|перепиши|исправ|добав|удал|переимену|архитектур|зависимост|модул|всех|все файл)\b/i.test(
          userMessage
        )
      const shouldExplore = orchestratorIsComplex || complexByHeuristic

      if (shouldExplore) {
        this.emitter.emit({ type: 'exploring', exploring: true })
        try {
          const explorerResult = await runSubagent(this.settings, {
            role: 'explorer',
            task: `Изучи структуру проекта применительно к задаче:\n\n${userMessage}\n\nВерни краткую сводку: какие файлы релевантны, какие модули задействованы, ключевые зависимости.`,
            projectPath: this.projectPath,
            maxSteps: 8,
            signal: this.emitter.abortSignal
          })
          if (explorerResult.output && !explorerResult.output.startsWith('[Субагент достиг')) {
            explorerSummary = explorerResult.output
            this.emitter.emit({
              type: 'exploring',
              exploring: false,
              explorerSummary,
              content: `🔍 Разведка завершена (${explorerResult.steps} шагов, инструменты: ${explorerResult.toolsUsed.join(', ') || 'нет'})`
            })
          } else {
            this.emitter.emit({ type: 'exploring', exploring: false })
          }
        } catch {
          // explorer не критичен — продолжаем без сводки
          this.emitter.emit({ type: 'exploring', exploring: false })
        }
      }
    }

    const baseSystemPrompt = this.settings.customSystemPrompt ?? ''
    const hintParts: string[] = []
    if (orchestratorPlanHint) hintParts.push(`## План оркестратора\n${orchestratorPlanHint}`)
    if (explorerSummary)
      hintParts.push(`## Разведка проекта (субагент-explorer)\n${explorerSummary}`)
    const customSystemPrompt = hintParts.length
      ? `${baseSystemPrompt}\n\n${hintParts.join('\n\n')}`.trim()
      : baseSystemPrompt

    const prepared = await prepareAgentRunContext(
      this.projectPath,
      history,
      effectiveMessage,
      this.settings.model,
      taskMode === 'self-improve',
      {
        ollamaUrl: this.settings.ollamaUrl,
        providerConfig: this.ctx.summarizeProviderConfig,
        signal: this.ctx.modelRuntime ? undefined : undefined,
        clarifyMode: this.settings.clarifyMode,
        deepReasoning: this.settings.deepReasoning,
        summarizeModel: this.ctx.summarizeModelResolved,
        excludeThinkingFromHistory: this.settings.excludeThinkingFromHistory !== false,
        modelContextLength: this.settings.modelContextLength,
        summarizeThresholdPercent: this.ctx.resolveSummarizeThreshold(),
        chatMode: this.settings.chatMode === true,
        chatId: this.chatId,
        enableRAG: true,
        ragStoreConfig: buildVectorStoreConfig(this.settings, this.projectPath),
        customSystemPrompt,
        disabledTools: this.settings.disabledTools,
        mcpServers: this.settings.mcpServers
      }
    )
    this.emitter.throwIfAborted()
    this.emitter.emit({ type: 'context', contextPreview: prepared.preview })
    if (prepared.preview.historySummarized) {
      this.emitter.emit({
        type: 'context',
        content: `📋 Контекст ~${prepared.preview.contextUsagePercent}% — предыдущая история суммаризирована`
      })
    }
    if (taskMode === 'self-improve') {
      this.emitter.emit({
        type: 'self_improve_plan',
        content:
          '🔄 Режим автономного самоулучшения: изучу код и буду работать, пока все пункты плана не выполнены.'
      })
    }

    const messages = prepared.messages
    let usedTools = false
    let selfEdited = false
    const mutatingToolsUsed = new Set<string>()
    let requireToolNext = false

    const loopGuard = new LoopGuard(this.settings, this.ctx.modelRuntime)
    let ragGrepNudged = false
    const taskPlanner = new TaskPlanner(
      taskMode,
      userMessage,
      this.selfImproveOrchestrator,
      loopGuard
    )

    try {
      let step = 0
      while (true) {
        this.emitter.throwIfAborted()
        step++

        const stepStartMs = Date.now()
        const ctxChars = messages.reduce(
          (s, m) => s + (typeof m.content === 'string' ? m.content.length : 0),
          0
        )
        this.emitter.trace(
          'llm_request',
          `→ Запрос к модели (шаг ${step}, ${messages.length} сообщ., ~${Math.round(ctxChars / 4)} токенов)`,
          {
            step,
            messageCount: messages.length,
            contextChars: ctxChars,
            messages: messages.map((m) => ({
              role: m.role,
              chars: typeof m.content === 'string' ? m.content.length : 0,
              preview: typeof m.content === 'string' ? m.content.slice(0, 300) : ''
            }))
          }
        )
        this.emitter.emit({ type: 'orchestrating', orchestrating: true })

        let response
        try {
          response = await this.ctx.chat(messages, this.settings.model, taskPlanner.isSelfImprove, {
            requireTool: requireToolNext
          })
        } catch (error) {
          if (isAbortError(error)) {
            this.emitter.handleAbort()
            return
          }
          if (error instanceof CircuitBreakerOpenError) {
            const secsLeft = Math.ceil((error.openUntilMs - Date.now()) / 1000)
            // Повторно эмитим состояние open — контекст мог быть сброшен в RESET при старте прогона
            this.emitter.emit({
              type: 'circuit_breaker',
              circuitBreakerState: 'open',
              circuitBreakerOpenUntilMs: error.openUntilMs
            })
            this.emitter.emit({
              type: 'error',
              content: `⚡ Слишком много ошибок подряд — запросы к провайдеру заблокированы. Подождите ~${secsLeft} с и попробуйте снова.`
            })
            this.emitter.emit({ type: 'done' })
            return
          }
          throw error
        }
        requireToolNext = false

        const durationMs = Date.now() - stepStartMs
        void agentLogger.write({
          event: 'llm_response',
          step,
          model: this.settings.model,
          duration_ms: durationMs,
          tokens: response.metrics?.evalCount,
          has_tools: (response.message?.tool_calls?.length ?? 0) > 0,
          has_thinking: !!response.message?.thinking
        })

        const assistantText = sanitizeAssistantContent(response.message?.content ?? '')
        const assistantThinking = response.message?.thinking
        const toolCalls = response.message?.tool_calls ?? []

        {
          const toolNames = toolCalls.map((tc) => tc.function.name)
          const tokens = response.metrics?.evalCount
          const tps =
            response.metrics?.tokensPerSec != null
              ? Math.round(response.metrics.tokensPerSec * 10) / 10
              : undefined
          const label = toolNames.length
            ? `← Ответ (шаг ${step}, ${durationMs}ms${tokens ? `, ${tokens}tok` : ''}) → инструменты: ${toolNames.join(', ')}`
            : `← Ответ (шаг ${step}, ${durationMs}ms${tokens ? `, ${tokens}tok` : ''}) → текст (${assistantText.length} симв.)`
          this.emitter.trace('llm_response', label, {
            step,
            durationMs,
            tokens,
            toksPerSec: tps,
            textLength: assistantText.length,
            text: assistantText.slice(0, 500),
            thinking: assistantThinking?.slice(0, 300),
            toolCalls: toolNames
          })
        }

        const isCloud = this.ctx.providerConfig.type !== 'ollama'
        const hasNativeToolCalls = isCloud && toolCalls.some((tc) => tc.id)

        // Добавляем assistant-сообщение в историю
        if (assistantText || hasNativeToolCalls) {
          const assistantMsg = {
            role: 'assistant' as const,
            content: assistantText,
            ...(hasNativeToolCalls
              ? {
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
                }
              : {})
          }
          messages.push(assistantMsg)
        }

        if (!toolCalls.length) {
          const planAction = await taskPlanner.decide({
            assistantText,
            assistantThinking,
            usedTools,
            mutatingToolsUsed
          })

          if (planAction.kind === 'done') {
            if (assistantText)
              this.emitter.emit({
                type: 'assistant',
                content: assistantText,
                thinking: assistantThinking
              })
            await taskPlanner.finalize(messages, userMessage, usedTools, this.settings)
            this.emitter.emit({ type: 'done' })
            return
          }
          if (planAction.kind === 'error') {
            if (assistantText) messages.pop()
            this.emitter.emit({ type: 'clear_draft' })
            this.emitter.emit({ type: 'error', content: planAction.content })
            this.emitter.emit({ type: 'done' })
            return
          }
          if (planAction.kind === 'continue') {
            if (planAction.clearDraft && assistantText) messages.pop()
            if (planAction.clearDraft) this.emitter.emit({ type: 'clear_draft' })
            if (planAction.emitAssistant)
              this.emitter.emit({
                type: 'assistant',
                content: planAction.emitAssistant.text,
                thinking: planAction.emitAssistant.thinking
              })
            messages.push({ role: 'user', content: planAction.nudgeMessage })
            requireToolNext = planAction.requireTool
            continue
          }
          if (planAction.kind === 'escalate') {
            messages.pop()
            this.emitter.emit({ type: 'clear_draft' })
            this.emitter.emit({
              type: 'context',
              content: `🔄 Модель **${this.settings.model}** отказалась от задачи — переключаюсь на **${planAction.toModel}**…`
            })
            this.settings = { ...this.settings, model: planAction.toModel }
            requireToolNext = true
            continue
          }
          if (planAction.kind === 'retry') {
            if (assistantText) messages.pop()
            this.emitter.emit({ type: 'clear_draft' })
            this.emitter.emit({
              type: 'error',
              content:
                '⚠️ Модель ответила текстом без инструментов — повторяю с обязательным tool call…'
            })
            messages.push({ role: 'user', content: TOOL_VERIFICATION_NUDGE })
            requireToolNext = true
            continue
          }
          if (planAction.kind === 'failed') {
            if (assistantText) messages.pop()
            this.emitter.emit({ type: 'clear_draft' })
            this.emitter.emit({ type: 'error', content: TOOL_VERIFICATION_FAILED_MESSAGE })
            this.emitter.emit({ type: 'done' })
            return
          }

          // passthrough — обычный конец
          if (assistantText) {
            this.emitter.emit({
              type: 'assistant',
              content: assistantText,
              thinking: assistantThinking
            })
          } else if (!taskPlanner.isSelfImprove) {
            const ctxTokensNow = Math.round(ctxChars / 4)
            const smallModelHint =
              ctxTokensNow > 2000
                ? ` Системный промпт занимает ~${ctxTokensNow} токенов — это много для маленьких моделей (3b–7b). Попробуй модель покрупнее (qwen2.5-coder:7b, llama3.1:8b) или облачный провайдер.`
                : ''
            this.emitter.emit({
              type: 'error',
              content: `Модель не ответила и не вызвала инструменты.${smallModelHint} Попробуй выбрать другую модель или переформулировать задачу.`
            })
          }
          await taskPlanner.finalize(
            messages,
            userMessage,
            mutatingToolsUsed.size > 0,
            this.settings
          )
          this.emitter.trace(
            'run_end',
            `■ Завершено за ${Date.now() - runStartMs}ms, шагов: ${step}, токенов: ${this.ctx.sessionTokens}`,
            {
              durationMs: Date.now() - runStartMs,
              steps: step,
              sessionTokens: this.ctx.sessionTokens
            }
          )
          this.emitter.emit({ type: 'done' })
          return
        }

        usedTools = true
        if (toolCalls.some((call) => call.function.name === 'set_self_improvement_plan')) {
          requireToolNext = true
        }

        const willMutate = toolCalls.some((call) => MUTATING_TOOLS.has(call.function.name))
        if (willMutate && this.chatId) {
          const checkpointOk = await ensureRunCheckpoint(this.chatId, this.projectPath)
          if (checkpointOk && !runCheckpointEmitted) {
            runCheckpointEmitted = true
            this.emitter.emit({ type: 'run_checkpoint', runCheckpointActive: true })
          }
        }

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
          const results = await this.toolExecutor.executeParallel(toolCalls, step)
          for (const { id, name, output } of results) {
            this.emitter.emit({ type: 'tool_end', toolName: name, toolOutput: output })
            const msg = {
              role: 'tool' as const,
              content: `Инструмент ${name}:\n${output}`,
              ...(id ? { tool_call_id: id } : {})
            }
            messages.push(msg)
          }
          ragGrepNudged =
            (await maybeAppendRagSearchHintAfterEmptyGrep(
              messages,
              results.map((r, i) => ({
                toolName: r.name,
                output: r.output,
                args: parseToolArgs(toolCalls[i]?.function.arguments ?? {})
              })),
              this.settings,
              ragGrepNudged
            )) || ragGrepNudged
        } else {
          const batch = await this.toolExecutor.executeSequential(
            toolCalls,
            step,
            isCloud,
            loopGuard
          )
          for (const name of batch.mutatingToolNames) {
            if (MUTATING_TOOLS.has(name)) mutatingToolsUsed.add(name)
          }
          if (batch.selfEdited) selfEdited = true
          for (const msg of batch.toolMessages) messages.push(msg)
          ragGrepNudged =
            (await maybeAppendRagSearchHintAfterEmptyGrep(
              messages,
              batch.invocations.map((inv) => ({
                toolName: inv.name,
                output: inv.output,
                args: inv.args
              })),
              this.settings,
              ragGrepNudged
            )) || ragGrepNudged
          if (batch.breakLoop) continue
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        this.emitter.handleAbort()
        return
      }
      throw error
    } finally {
      if (this.ctx.providerConfig.type === 'ollama') {
        try {
          await this.ctx.modelRuntime.unloadModel(this.settings.model)
        } catch {
          /* необязательно */
        }
      }
      void agentLogger.write({
        event: 'run_end',
        model: this.settings.model,
        total_ms: Date.now() - runStartMs
      })
      if (selfEdited) {
        if (taskPlanner.isSelfImprove && this.settings.autoPushSelfEdits !== false) {
          await this.selfImproveOrchestrator.autoCommitSelfEdits(
            userMessage,
            this.emitter.emit.bind(this.emitter)
          )
        } else if (!taskPlanner.isSelfImprove) {
          await this.selfImproveOrchestrator.stageSelfEditsForRestart(
            userMessage,
            this.emitter.emit.bind(this.emitter)
          )
        }
      }

      if (this.settings.syncCollectiveMemory !== false && getPendingCollectiveMemoryCount() > 0) {
        const branch = resolveSelfImproveBranch(this.settings.selfImproveBranch)
        this.emitter.emit({
          type: 'collective_sync',
          collectiveSyncStatus: 'syncing',
          collectiveSyncBranch: branch,
          collectiveSyncCount: getPendingCollectiveMemoryCount()
        })
        try {
          const result = await flushCollectiveMemoryToGit(
            userMessage,
            this.settings.selfImproveBranch
          )
          this.emitter.emit({
            type: 'collective_sync',
            collectiveSyncStatus: result.ok ? 'done' : 'error',
            collectiveSyncBranch: result.branch ?? branch,
            collectiveSyncCount: result.syncedCount,
            content: result.message
          })
        } catch (error) {
          this.emitter.emit({
            type: 'collective_sync',
            collectiveSyncStatus: 'error',
            collectiveSyncBranch: branch,
            content: error instanceof Error ? error.message : String(error)
          })
        }
      }

      if (this.settings.webhookUrl) {
        const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
        const summary =
          typeof lastAssistant?.content === 'string'
            ? lastAssistant.content.slice(0, 500)
            : userMessage.slice(0, 200)
        void notifyWebhook(this.settings.webhookUrl, {
          chatId: this.chatId ?? '',
          projectPath: this.projectPath,
          summary,
          durationMs: Date.now() - runStartMs
        })
      }
    }
  }
}
