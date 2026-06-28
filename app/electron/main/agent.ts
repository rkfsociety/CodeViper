import type { AgentSettings, AgentStreamPayload, ChatMessage } from '../../src/types'
import { sanitizeAssistantContent } from '../../shared/toolCalls'
import {
  AGENT_STEP_TIMEOUT_MS,
  isCostLimitExceeded,
  resolveMaxCostPerRunUsd
} from '../../shared/constants'
import { formatCostUsd, getRequestTokenCount } from '../../shared/generationMetrics'
import {
  MUTATING_TOOLS,
  EXPLORATION_STALL_NUDGE,
  taskLikelyNeedsMutation,
  TOOL_VERIFICATION_FAILED_MESSAGE,
  TOOL_VERIFICATION_NUDGE
} from '../../shared/actionVerification'
import {
  prepareAgentRunContext,
  injectHardToolCallingSystemHint,
  maybeAppendRagSearchHintAfterEmptyGrep,
  type OllamaMessage
} from './agentContext'
import { buildVectorStoreConfig } from './vectorStore'
import { SelfImprovementPlanStore } from './selfImprovementStore'
import { agentLogger } from './agentLogger'
import { TaskPlanner } from './taskPlanner'
import { CircuitBreakerOpenError } from './modelRuntime'
import { ProviderBillingError, isProviderFallbackRetryableError } from '../../shared/providerErrors'
import { ensureSelfImproveBranch } from './selfCommit'
import {
  resolveSelfImproveBranch,
  parseRoadmapTaskItemNumber,
  isRoadmapSelfImprovementTask,
  isRoadmapItemBodyTask,
  parseRoadmapFieldsFromAssistantText,
  buildRoadmapSelfImproveHint,
  buildRoadmapAlreadyDoneHint,
  buildOpenAiCustomEndpointHint
} from '../../shared/selfImprovement'
import { findRoadmapDoneMatch, readRoadmapItem } from './roadmapParser'
import { getActiveAgentSourceRootPath } from './runtimeBootstrap'
import { flushCollectiveMemoryToGit, getPendingCollectiveMemoryCount } from './collectiveMemorySync'
import { notifyWebhook } from './webhookNotify'
import { analyze } from './orchestratorModel'
import {
  resolveOrchestratorBackend,
  resolveOrchestratorOllamaModel,
  shouldAwaitPlanConfirmation,
  shouldRunOrchestratorAnalysis
} from '../../shared/orchestrator'
import { runSubagent } from './subagentRunner'

import { ResponseEmitter } from './agentResponseEmitter'
import {
  buildRunEndTraceData,
  buildRunStartTraceData,
  buildLlmRequestTraceData,
  buildLlmResponseTraceData,
  buildContextCompressTraceData,
  buildNudgeTraceData,
  type NudgeTraceSource
} from './agentTrace'
import { getAgentTools } from './agentTools'
import { LoopGuard } from './agentLoopGuard'
import { ContextManager } from './agentContextManager'
import {
  ToolExecutor,
  PARALLEL_SAFE_TOOLS,
  parseToolArgs,
  toolTouchesRoadmapDocs
} from './agentToolExecutor'
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

export interface AgentRunnerOptions {
  settings: AgentSettings
  projectPath: string
  emit: (event: AgentStreamPayload) => void
  signal?: AbortSignal
  confirm?: (toolName: string, toolInput: string) => Promise<boolean>
  confirmPlan?: (plan: string) => Promise<boolean>
  clarify?: (question: string) => Promise<string | null>
  previewFn?: (previewId: string) => Promise<boolean>
  chatId?: string
  hunkSelectionFn?: (previewId: string) => number[] | undefined
}

function looksLikeQuestion(text: string): boolean {
  const t = text.trim()
  if (t.endsWith('?')) return true
  const lower = t.toLowerCase()
  return /укажите|уточните|пожалуйста\s+укажи|please\s+(specify|provide|clarify|tell me|indicate)|which file|какой файл|какие файлы/.test(
    lower
  )
}
export {
  fetchOllamaModels,
  fetchOllamaModelsWithDetails,
  pingOllama,
  pullOllamaModel,
  deleteOllamaModel,
  type OllamaPullProgress
} from './agentOllamaApi'
import { pingOllama } from './agentOllamaApi'

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
    const runner = new AgentRunner({
      settings,
      projectPath,
      emit,
      signal,
      chatId: `p2p-${task.id}`
    })
    await runner.run([], prompt)
    return { accepted: true, paused: false, message: 'задача выполнена' }
  } finally {
    releaseP2pTaskSlot()
  }
}

export class AgentRunner {
  private readonly selfImprovementPlan = new SelfImprovementPlanStore()
  private settings: AgentSettings
  private readonly projectPath: string
  private readonly chatId: string | undefined
  private readonly clarify: ((question: string) => Promise<string | null>) | undefined
  private readonly confirmPlan: ((plan: string) => Promise<boolean>) | undefined

  private readonly emitter: ResponseEmitter
  private readonly ctx: ContextManager
  private readonly toolExecutor: ToolExecutor
  private readonly selfImproveOrchestrator: SelfImprovementOrchestrator

  constructor({
    settings,
    projectPath,
    emit,
    signal,
    confirm,
    clarify,
    confirmPlan,
    previewFn,
    chatId,
    hunkSelectionFn
  }: AgentRunnerOptions) {
    this.clarify = clarify
    this.confirmPlan = confirmPlan
    this.settings = settings
    this.projectPath = projectPath
    this.chatId = chatId
    this.emitter = new ResponseEmitter(emit, signal)
    this.ctx = new ContextManager(settings, this.emitter, signal)

    this.toolExecutor = new ToolExecutor(
      projectPath,
      settings,
      emit,
      signal,
      confirm,
      previewFn,
      hunkSelectionFn,
      this.selfImprovementPlan,
      (items) => this.selfImproveOrchestrator.emitPlan(items),
      chatId
    )

    // Нужно зарегистрировать preview_edit/preview_patch через ссылку на методы ToolExecutor.
    this.toolExecutor.overrideHandlers({
      preview_edit: (args: Record<string, string>) => this.toolExecutor.handlePreviewEdit(args),
      preview_patch: (args: Record<string, string>) => this.toolExecutor.handlePreviewPatch(args)
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

  private pushNudge(
    messages: OllamaMessage[],
    step: number,
    source: NudgeTraceSource,
    content: string
  ): void {
    messages.push({ role: 'user', content })
    const nudge = buildNudgeTraceData(step, source, content)
    this.emitter.trace('nudge', nudge.label, nudge.data)
  }

  async run(
    history: ChatMessage[],
    userMessage: string,
    userImages?: { name: string; dataUrl: string }[]
  ): Promise<void> {
    this.emitter.throwIfAborted()
    this.toolExecutor.clearEditSnapshots?.()
    if (this.chatId) clearRunCheckpoint(this.chatId)

    let runCheckpointEmitted = false
    let runSuccess = true
    let runEndTraced = false

    const traceRunEnd = (
      status: 'ok' | 'error' | 'aborted',
      extra: Record<string, unknown> = {}
    ): void => {
      if (runEndTraced) return
      runEndTraced = true
      const end = buildRunEndTraceData(Date.now() - runStartMs, status, {
        sessionTokens: this.ctx.sessionTokens > 0 ? this.ctx.sessionTokens : undefined,
        sessionCostUsd: this.ctx.sessionCostUsd > 0 ? this.ctx.sessionCostUsd : undefined,
        ...extra
      })
      this.emitter.trace('run_end', end.label, end.data)
    }

    const runStartMs = Date.now()
    const taskMode = TaskPlanner.detectMode(userMessage)
    void agentLogger.write({
      event: 'run_start',
      model: this.settings.model,
      message: userMessage.slice(0, 200)
    })
    const runStartTrace = buildRunStartTraceData({
      model: this.settings.model,
      provider: this.ctx.providerConfig.type,
      message: userMessage,
      chatId: this.chatId,
      taskMode,
      settings: {
        contextSummarizeThreshold: this.ctx.resolveSummarizeThreshold(),
        aggressiveCompression: this.settings.aggressiveCompression === true,
        modelContextLength: this.settings.modelContextLength,
        permissionMode: this.settings.permissionMode ?? 'bypass',
        chatMode: this.settings.chatMode === true,
        cloudEnabled: this.settings.cloudEnabled === true,
        selfImproveAutoPush: this.settings.autoPushSelfEdits !== false
      }
    })
    this.emitter.trace('run_start', runStartTrace.label, runStartTrace.data)

    this.toolExecutor.beginRun(taskMode === 'self-improve')
    const roadmapItemNum = isRoadmapSelfImprovementTask(userMessage)
      ? parseRoadmapTaskItemNumber(userMessage)
      : null
    this.selfImproveOrchestrator.setRoadmapContext(roadmapItemNum, userMessage)

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

    let orchestratorPlanHint = ''
    let orchestratorIsComplex = false

    if (shouldRunOrchestratorAnalysis(this.settings, userMessage.length)) {
      this.emitter.emit({ type: 'orchestrating', orchestrating: true })
      try {
        const backend = resolveOrchestratorBackend(this.settings)
        const result = await analyze(userMessage, {
          backend,
          ggufPath: this.settings.orchestratorModelPath,
          ollamaUrl: this.settings.ollamaUrl,
          ollamaModel: resolveOrchestratorOllamaModel(this.settings),
          signal: this.emitter.abortSignal
        })
        orchestratorIsComplex = result.isComplex
        if (result.plan) {
          orchestratorPlanHint = result.plan
        }
        this.emitter.emit({
          type: 'orchestrating',
          orchestrating: false,
          content: result.plan || undefined
        })
        if (
          shouldAwaitPlanConfirmation(this.settings) &&
          orchestratorPlanHint &&
          this.confirmPlan
        ) {
          const approved = await this.confirmPlan(orchestratorPlanHint)
          if (!approved) {
            this.emitter.emit({
              type: 'context',
              content: '⏹ Выполнение отменено — план не подтверждён.'
            })
            this.emitter.emit({ type: 'done' })
            return
          }
        }
      } catch (err) {
        console.error('[AgentRunner] orchestrator error:', err)
        this.emitter.emit({ type: 'orchestrating', orchestrating: false, error: String(err) })
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
        } catch (err) {
          console.error('[AgentRunner] explorer error:', err)
          this.emitter.emit({ type: 'exploring', exploring: false, error: String(err) })
        }
      }
    }

    const baseSystemPrompt = this.settings.customSystemPrompt ?? ''
    const hintParts: string[] = []
    if (orchestratorPlanHint) hintParts.push(`## План оркестратора\n${orchestratorPlanHint}`)
    if (explorerSummary)
      hintParts.push(`## Разведка проекта (субагент-explorer)\n${explorerSummary}`)
    if (taskMode === 'self-improve' && isRoadmapSelfImprovementTask(userMessage)) {
      hintParts.push(
        buildRoadmapSelfImproveHint(
          roadmapItemNum,
          getActiveAgentSourceRootPath(),
          this.settings.model
        )
      )
      const doneLine = await findRoadmapDoneMatch(userMessage)
      if (doneLine) {
        hintParts.push(buildRoadmapAlreadyDoneHint(doneLine))
      } else if (roadmapItemNum != null) {
        const planned = await readRoadmapItem(roadmapItemNum)
        if (planned) {
          this.selfImproveOrchestrator.setRoadmapItemDetail(planned)
          const openAiHint = buildOpenAiCustomEndpointHint(planned)
          if (openAiHint) hintParts.push(openAiHint)
        } else {
          const byNum = await findRoadmapDoneMatch(`пункт ${roadmapItemNum}`)
          if (byNum) hintParts.push(buildRoadmapAlreadyDoneHint(byNum))
        }
      } else if (isRoadmapItemBodyTask(userMessage)) {
        const fields = parseRoadmapFieldsFromAssistantText(userMessage)
        if (fields) {
          const openAiHint = buildOpenAiCustomEndpointHint(fields)
          if (openAiHint) hintParts.push(openAiHint)
        }
      }
    }
    const customSystemPrompt = hintParts.length
      ? `${baseSystemPrompt}\n\n${hintParts.join('\n\n')}`.trim()
      : baseSystemPrompt

    const prepared = await prepareAgentRunContext(
      this.projectPath,
      history,
      userMessage,
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
        mcpServers: this.settings.mcpServers,
        userImages
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

        const compression = await this.ctx.compressMessagesInPlace(
          messages,
          this.settings.model,
          taskPlanner.isSelfImprove
        )
        const compressTrace = buildContextCompressTraceData({
          step,
          durationMs: compression.durationMs,
          before: compression.before,
          after: compression.after,
          summarized: compression.summarized,
          truncated: compression.truncated,
          droppedMessageCount: compression.droppedMessageCount,
          attempted: compression.attempted
        })
        this.emitter.trace('context_compress', compressTrace.label, compressTrace.data)

        const stepStartMs = Date.now()
        const toolsJsonChars = JSON.stringify(
          getAgentTools(
            taskPlanner.isSelfImprove,
            this.settings.disabledTools,
            this.settings.mcpServers
          )
        ).length
        const ctxChars = compression.after.contextChars
        const llmRequestTrace = buildLlmRequestTraceData({
          step,
          messages,
          model: this.settings.model,
          toolsJsonChars,
          knownContextLength: this.settings.modelContextLength,
          summarizeThresholdPercent: this.ctx.resolveSummarizeThreshold(),
          requireTool: requireToolNext
        })
        this.emitter.trace('llm_request', llmRequestTrace.label, llmRequestTrace.data)
        this.emitter.emit({ type: 'orchestrating', orchestrating: true })

        let response
        const modelChain = this.ctx.resolveModelChain(this.settings.model)
        let chatDone = false

        modelFallbackLoop: for (let mi = 0; mi < modelChain.length; mi++) {
          const tryModel = modelChain[mi]
          if (mi > 0) {
            this.emitter.emit({
              type: 'model_fallback',
              fallbackFromModel: modelChain[mi - 1],
              fallbackToModel: tryModel
            })
            this.emitter.trace('nudge', `↪ Fallback: ${tryModel}`, {
              step,
              from: modelChain[mi - 1],
              to: tryModel,
              source: 'model_fallback'
            })
          }
          try {
            const stepTimeout = new Promise<never>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `Шаг агента не завершился за ${AGENT_STEP_TIMEOUT_MS / 1000} с — запрос к модели прерван`
                    )
                  ),
                AGENT_STEP_TIMEOUT_MS
              )
            )
            response = await Promise.race([
              this.ctx.chat(messages, tryModel, taskPlanner.isSelfImprove, {
                requireTool: requireToolNext,
                skipCompression: true
              }),
              stepTimeout
            ])
            chatDone = true
            break modelFallbackLoop
          } catch (error) {
            if (
              mi < modelChain.length - 1 &&
              isProviderFallbackRetryableError(error) &&
              !isAbortError(error)
            ) {
              void agentLogger.write({
                event: 'model_fallback_retry',
                from: tryModel,
                to: modelChain[mi + 1],
                error: error instanceof Error ? error.message : String(error)
              })
              continue modelFallbackLoop
            }
            if (isAbortError(error)) {
              this.emitter.handleAbort()
              runSuccess = false
              traceRunEnd('aborted')
              return
            }
            if (error instanceof CircuitBreakerOpenError) {
              const secsLeft = Math.ceil((error.openUntilMs - Date.now()) / 1000)
              const cbMessage = `⚡ Слишком много ошибок подряд — запросы к провайдеру заблокированы. Подождите ~${secsLeft} с и попробуйте снова.`
              this.emitter.trace('llm_response', `✖ Ошибка запроса (шаг ${step})`, {
                step,
                durationMs: Date.now() - stepStartMs,
                error: cbMessage,
                errorKind: 'circuit_breaker'
              })
              // Повторно эмитим состояние open — контекст мог быть сброшен в RESET при старте прогона
              this.emitter.emit({
                type: 'circuit_breaker',
                circuitBreakerState: 'open',
                circuitBreakerOpenUntilMs: error.openUntilMs
              })
              // Если облачный провайдер недоступен — проверить Ollama и предложить fallback
              const ollamaUrl = this.settings.ollamaUrl || 'http://127.0.0.1:11434'
              const ollamaAvailable =
                this.ctx.providerConfig.type !== 'ollama' && (await pingOllama(ollamaUrl))
              if (ollamaAvailable) {
                this.emitter.emit({ type: 'ollama_fallback_offer', ollamaFallbackUrl: ollamaUrl })
                runSuccess = false
                traceRunEnd('error', { error: cbMessage, steps: step })
                this.emitter.emit({ type: 'done' })
                return
              }
              this.emitter.emit({
                type: 'error',
                content: cbMessage
              })
              runSuccess = false
              traceRunEnd('error', { error: cbMessage, steps: step })
              this.emitter.emit({ type: 'done' })
              return
            }
            if (error instanceof ProviderBillingError) {
              this.emitter.trace('llm_response', `✖ Ошибка запроса (шаг ${step})`, {
                step,
                durationMs: Date.now() - stepStartMs,
                error: error.message
              })
              this.emitter.emit({ type: 'error', content: error.message })
              runSuccess = false
              traceRunEnd('error', { error: error.message, steps: step })
              this.emitter.emit({ type: 'done' })
              return
            }
            const errMsg = error instanceof Error ? error.message : String(error)
            const errTrace = buildLlmResponseTraceData({
              step,
              durationMs: Date.now() - stepStartMs,
              error: errMsg
            })
            this.emitter.trace('llm_response', errTrace.label, errTrace.data)
            runSuccess = false
            throw error
          }
        }
        if (!chatDone || !response) {
          throw new Error('Запрос к модели не выполнен')
        }
        requireToolNext = false

        const costLimit = resolveMaxCostPerRunUsd(this.settings.maxCostPerRunUsd)
        if (isCostLimitExceeded(this.ctx.sessionCostUsd, costLimit)) {
          this.emitter.emit({
            type: 'error',
            content: `💰 Лимит стоимости прогона превышен: ~${formatCostUsd(this.ctx.sessionCostUsd)} из ${formatCostUsd(costLimit!)}. Прогон остановлен.`
          })
          this.emitter.emit({ type: 'done' })
          return
        }

        const durationMs = Date.now() - stepStartMs
        const requestTokens = getRequestTokenCount(response.metrics)
        void agentLogger.write({
          event: 'llm_response',
          step,
          model: this.settings.model,
          duration_ms: durationMs,
          tokens: requestTokens,
          input_tokens: response.metrics?.requestInputTokens,
          output_tokens: response.metrics?.requestOutputTokens,
          has_tools: (response.message?.tool_calls?.length ?? 0) > 0,
          has_thinking: !!response.message?.thinking
        })

        const assistantText = sanitizeAssistantContent(response.message?.content ?? '')
        const assistantThinking = response.message?.thinking
        const toolCalls = response.message?.tool_calls ?? []

        {
          const toolNames = toolCalls.map((tc) => tc.function.name)
          const tokens = requestTokens
          const tps =
            response.metrics?.tokensPerSec != null
              ? Math.round(response.metrics.tokensPerSec * 10) / 10
              : undefined
          const llmResponseTrace = buildLlmResponseTraceData({
            step,
            durationMs,
            tokens,
            inputTokens: response.metrics?.requestInputTokens,
            outputTokens: response.metrics?.requestOutputTokens,
            toksPerSec: tps,
            text: assistantText,
            thinking: assistantThinking,
            toolCalls: toolNames
          })
          this.emitter.trace('llm_response', llmResponseTrace.label, llmResponseTrace.data)
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

          // Если модель задала вопрос и есть clarify-callback — показать диалог пользователю
          if (
            assistantText &&
            looksLikeQuestion(assistantText) &&
            this.clarify &&
            (planAction.kind === 'done' || planAction.kind === 'passthrough')
          ) {
            this.emitter.emit({
              type: 'assistant',
              content: assistantText,
              thinking: assistantThinking
            })
            const answer = await this.clarify(assistantText)
            if (answer) {
              messages.push({ role: 'user', content: answer })
              continue
            }
            // Пользователь отменил диалог — завершаем
            await taskPlanner.finalize(messages, userMessage, usedTools, this.settings)
            traceRunEnd('aborted', { steps: step })
            this.emitter.emit({ type: 'done' })
            return
          }

          if (planAction.kind === 'done') {
            if (assistantText)
              this.emitter.emit({
                type: 'assistant',
                content: assistantText,
                thinking: assistantThinking
              })
            await taskPlanner.finalize(messages, userMessage, usedTools, this.settings)
            traceRunEnd('ok', { steps: step })
            this.emitter.emit({ type: 'done' })
            return
          }
          if (planAction.kind === 'error') {
            if (assistantText) messages.pop()
            this.emitter.emit({ type: 'clear_draft' })
            this.emitter.emit({ type: 'error', content: planAction.content })
            runSuccess = false
            traceRunEnd('error', { error: planAction.content, steps: step })
            this.emitter.emit({ type: 'done' })
            return
          }
          if (planAction.kind === 'continue') {
            if (planAction.clearDraft && assistantText) messages.pop()
            if (planAction.clearDraft) this.emitter.emit({ type: 'clear_draft' })
            if (planAction.injectHardToolHint) {
              injectHardToolCallingSystemHint(messages, this.settings.model)
              this.emitter.emit({
                type: 'context',
                content:
                  '⚠️ Модель описала инструменты текстом без tool_calls — повтор с жёстким tool calling…'
              })
            }
            if (planAction.emitAssistant)
              this.emitter.emit({
                type: 'assistant',
                content: planAction.emitAssistant.text,
                thinking: planAction.emitAssistant.thinking
              })
            this.pushNudge(messages, step, 'task_planner', planAction.nudgeMessage)
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
            const afterExploration =
              !assistantText.trim() && usedTools && mutatingToolsUsed.size === 0
            this.emitter.emit({
              type: 'error',
              content: afterExploration
                ? '⚠️ Пустой ответ после разведки — повторяю с требованием правок…'
                : '⚠️ Модель ответила текстом без инструментов — повторяю с обязательным tool call…'
            })
            this.pushNudge(
              messages,
              step,
              afterExploration ? 'exploration_stall' : 'require_tool',
              afterExploration ? EXPLORATION_STALL_NUDGE : TOOL_VERIFICATION_NUDGE
            )
            requireToolNext = true
            continue
          }
          if (planAction.kind === 'failed') {
            if (assistantText) messages.pop()
            this.emitter.emit({ type: 'clear_draft' })
            this.emitter.emit({ type: 'error', content: TOOL_VERIFICATION_FAILED_MESSAGE })
            runSuccess = false
            traceRunEnd('error', { error: TOOL_VERIFICATION_FAILED_MESSAGE, steps: step })
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
            const systemMsg = messages.find((m) => m.role === 'system')
            const systemChars =
              systemMsg && typeof systemMsg.content === 'string' ? systemMsg.content.length : 0
            const ctxTokensNow = Math.round(ctxChars / 4)
            const systemTokens = Math.round(systemChars / 4)
            const isCloudProvider = this.ctx.providerConfig.type !== 'ollama'
            let hint = ''
            if (usedTools && mutatingToolsUsed.size === 0 && taskLikelyNeedsMutation(userMessage)) {
              hint =
                ' Модель изучала код, но не внесла правок — возможно застряла в разведке; попробуй снова или упрости задачу.'
            } else if (ctxTokensNow > 12_000) {
              hint = ` Контекст диалога ~${ctxTokensNow} токенов — модель могла устать; начни новый чат или сократи задачу.`
            } else if (!isCloudProvider && systemTokens > 4000) {
              hint = ` Системный промпт ~${systemTokens} токенов — для локальных моделей 3b–7b попробуй покрупнее (qwen2.5-coder:7b, llama3.1:8b).`
            }
            this.emitter.emit({
              type: 'error',
              content: `Модель не ответила и не вызвала инструменты.${hint} Попробуй выбрать другую модель или переформулировать задачу.`
            })
            runSuccess = false
          }
          await taskPlanner.finalize(
            messages,
            userMessage,
            mutatingToolsUsed.size > 0,
            this.settings
          )
          traceRunEnd(
            runSuccess ? 'ok' : 'error',
            runSuccess
              ? { steps: step }
              : {
                  steps: step,
                  error: 'Модель не ответила и не вызвала инструменты'
                }
          )
          this.emitter.emit({ type: 'done' })
          return
        }

        usedTools = true

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

        let stepInvocations: Array<{ name: string; args: Record<string, string> }> = []

        if (allParallelSafe) {
          const results = await this.toolExecutor.executeParallel(toolCalls, step)
          for (const { id, name, output } of results) {
            if (MUTATING_TOOLS.has(name)) mutatingToolsUsed.add(name)
            this.emitter.emit({ type: 'tool_end', toolName: name, toolOutput: output })
            const msg = {
              role: 'tool' as const,
              content: `Инструмент ${name}:\n${output}`,
              ...(id ? { tool_call_id: id } : {})
            }
            messages.push(msg)
          }
          stepInvocations = results.map((r, i) => ({
            name: r.name,
            args: parseToolArgs(toolCalls[i]?.function.arguments ?? {})
          }))
          if (taskMode === 'self-improve') {
            const autoNudge = this.selfImproveOrchestrator.recordToolInvocations(
              results.map((r, i) => ({
                name: r.name,
                output: r.output,
                args: parseToolArgs(toolCalls[i]?.function.arguments ?? {})
              }))
            )
            if (autoNudge) {
              this.pushNudge(messages, step, 'self_improve', autoNudge)
              requireToolNext = true
              continue
            }
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
          for (const inv of batch.invocations) {
            if (toolTouchesRoadmapDocs(inv.name, inv.args)) {
              this.selfImproveOrchestrator.markRoadmapDocsUpdated()
            }
          }
          if (batch.selfEdited) selfEdited = true
          for (const msg of batch.toolMessages) messages.push(msg)
          stepInvocations = batch.invocations.map((inv) => ({
            name: inv.name,
            args: inv.args
          }))
          if (taskMode === 'self-improve') {
            const autoNudge = this.selfImproveOrchestrator.recordToolInvocations(
              batch.invocations.map((inv) => ({
                name: inv.name,
                output: inv.output,
                args: inv.args
              }))
            )
            if (autoNudge) {
              this.pushNudge(messages, step, 'self_improve', autoNudge)
              requireToolNext = true
              continue
            }
          }
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
          if (batch.breakLoop) {
            if (batch.breakMessage) {
              const loopNudge = buildNudgeTraceData(step, 'loop_guard', batch.breakMessage)
              this.emitter.trace('nudge', loopNudge.label, loopNudge.data)
            }
            continue
          }
        }

        if (
          toolCalls.some((call) => call.function.name === 'set_self_improvement_plan') &&
          this.selfImprovementPlan.has()
        ) {
          requireToolNext = true
        }

        const scopeNudge = loopGuard.checkTaskScope(userMessage, mutatingToolsUsed, stepInvocations)
        if (scopeNudge) {
          this.pushNudge(messages, step, 'scope', scopeNudge)
          requireToolNext = true
          continue
        }

        const stallResult = loopGuard.checkExplorationStall(
          userMessage,
          mutatingToolsUsed,
          step,
          usedTools
        )
        if (stallResult) {
          if (stallResult.action === 'abort') {
            this.emitter.emit({ type: 'error', content: stallResult.message })
            runSuccess = false
            traceRunEnd('error', { error: stallResult.message, steps: step })
            this.emitter.emit({ type: 'done' })
            return
          }
          this.pushNudge(messages, step, 'exploration_stall', stallResult.message)
          requireToolNext = true
          continue
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        this.emitter.handleAbort()
        runSuccess = false
        return
      }
      runSuccess = false
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
        total_ms: Date.now() - runStartMs,
        status: runSuccess ? 'ok' : 'error',
        session_tokens: this.ctx.sessionTokens > 0 ? this.ctx.sessionTokens : undefined,
        session_cost_usd: this.ctx.sessionCostUsd > 0 ? this.ctx.sessionCostUsd : undefined
      })
      traceRunEnd(runSuccess ? 'ok' : 'error')
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
