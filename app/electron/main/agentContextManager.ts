import { getAgentTools } from './agentTools'
import { getMcpAgentToolNames } from './mcpTools'
import { ModelRuntime } from './modelRuntime'
import type { ProviderConfig } from '../../shared/modelProvider'
import type { AgentSettings } from '../../src/types'
import type { OllamaMessage } from './ollamaMessage'
import { compressContextMessages } from './contextSummarizer'
import { buildMessageContextStats, type MessageContextStats } from './agentTrace'
import { agentLogger } from './agentLogger'
import {
  buildRequestGenerationMetrics,
  parseOllamaGenerationMetrics,
  type GenerationMetrics
} from '../../shared/generationMetrics'
import { findModelPricing, estimateRequestCost } from '../../shared/constants'
import { getModelContextLimitTokens } from '../../shared/contextLimits'
import { extractEmbeddedToolCalls, sanitizeAssistantContent } from '../../shared/toolCalls'
import {
  CUSTOM_API_BASE_URL,
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_MODEL_DEFAULT,
  GEMINI_API_BASE_URL,
  GEMINI_MODEL_DEFAULT,
  LITEROUTER_API_BASE_URL,
  LITEROUTER_MODEL_DEFAULT,
  OPENROUTER_API_BASE_URL
} from '../../shared/constants'
import type { ResponseEmitter } from './agentResponseEmitter'
import { redactMessagesForModel } from '../../shared/secretRedaction'

const OLLAMA_KEEP_ALIVE = '5m'

interface ToolCallShape {
  id?: string
  function: { name: string; arguments: Record<string, string> | string }
}

export interface CompressionStepResult {
  changed: boolean
  durationMs: number
  attempted: boolean
  before: MessageContextStats
  after: MessageContextStats
  summarized: boolean
  truncated: boolean
  droppedMessageCount: number
}

export interface ChatResult {
  message: {
    content?: string
    thinking?: string
    tool_calls?: ToolCallShape[]
  }
  metrics: GenerationMetrics | null
}

function filterMessagesForCloud(messages: OllamaMessage[]): OllamaMessage[] {
  const coveredIds = new Set(messages.filter((m) => m.tool_call_id).map((m) => m.tool_call_id!))
  const pass1 = messages.filter((msg) => {
    if (msg.role === 'tool') return !!msg.tool_call_id
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      return msg.tool_calls.every((tc) => coveredIds.has(tc.id))
    }
    return true
  })

  const assistantCallIds = new Set<string>()
  for (const msg of pass1) {
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      for (const tc of msg.tool_calls) assistantCallIds.add(tc.id)
    }
  }
  let pass2 = pass1.filter(
    (msg) => !(msg.role === 'tool' && msg.tool_call_id && !assistantCallIds.has(msg.tool_call_id))
  )

  const MAX_CLOUD_MESSAGES = 20
  if (pass2.length > MAX_CLOUD_MESSAGES) {
    const firstUserIdx = pass2.findIndex((m) => m.role === 'user')
    if (firstUserIdx >= 0) {
      pass2 = [
        pass2[firstUserIdx],
        ...pass2.slice(Math.max(firstUserIdx + 1, pass2.length - MAX_CLOUD_MESSAGES + 1))
      ]
    } else {
      pass2 = pass2.slice(-MAX_CLOUD_MESSAGES)
    }

    const idsAfterSlice = new Set<string>()
    for (const msg of pass2) {
      if (msg.role === 'assistant' && msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) idsAfterSlice.add(tc.id)
      }
    }
    pass2 = pass2.filter(
      (msg) => !(msg.role === 'tool' && msg.tool_call_id && !idsAfterSlice.has(msg.tool_call_id))
    )
    const toolResultIds = new Set(pass2.filter((m) => m.tool_call_id).map((m) => m.tool_call_id!))
    pass2 = pass2.filter((msg) => {
      if (msg.role === 'assistant' && msg.tool_calls?.length) {
        return msg.tool_calls.every((tc) => toolResultIds.has(tc.id))
      }
      return true
    })
  }
  return pass2
}

/** primary + fallbackModels без дублей, порядок сохраняется. */
export function buildModelFallbackChain(primary: string, fallbackModels?: string[]): string[] {
  const chain: string[] = []
  const primaryTrim = primary.trim()
  if (primaryTrim) chain.push(primaryTrim)
  for (const raw of fallbackModels ?? []) {
    const name = raw.trim()
    if (name && !chain.includes(name)) chain.push(name)
  }
  return chain.length > 0 ? chain : [primary]
}

export class ContextManager {
  readonly providerConfig: ProviderConfig
  readonly summarizeProviderConfig: ProviderConfig
  readonly summarizeModelResolved: string
  readonly modelRuntime: ModelRuntime
  sessionTokens = 0
  sessionInputTokens = 0
  sessionOutputTokens = 0
  sessionCacheReadTokens = 0
  sessionCostUsd = 0

  constructor(
    private readonly settings: AgentSettings,
    private readonly emitter: ResponseEmitter,
    private readonly signal?: AbortSignal
  ) {
    this.providerConfig = this.buildProviderConfig()
    this.modelRuntime = new ModelRuntime(this.providerConfig)
    const sum = this.buildSummarizeConfig()
    this.summarizeProviderConfig = sum.providerConfig
    this.summarizeModelResolved = sum.model
  }

  private buildProviderConfig(): ProviderConfig {
    const type = this.settings.modelProvider || 'ollama'
    const baseUrl =
      type === 'custom'
        ? (this.settings.customBaseUrl || CUSTOM_API_BASE_URL).replace(/\/$/, '')
        : type === 'deepseek'
          ? DEEPSEEK_API_BASE_URL
          : type === 'literouter'
            ? (this.settings.literouterBaseUrl || LITEROUTER_API_BASE_URL).replace(/\/$/, '')
            : type === 'gemini'
              ? GEMINI_API_BASE_URL
              : type === 'openrouter'
                ? OPENROUTER_API_BASE_URL
                : this.settings.ollamaUrl
    const model =
      type === 'deepseek' && !/^deepseek/i.test(this.settings.model || '')
        ? DEEPSEEK_MODEL_DEFAULT
        : type === 'literouter' && !(this.settings.model || '').trim()
          ? LITEROUTER_MODEL_DEFAULT
          : type === 'gemini' && !/^gemini/i.test(this.settings.model || '')
            ? GEMINI_MODEL_DEFAULT
            : this.settings.model
    const apiKey =
      type === 'deepseek'
        ? (this.settings.deepseekApiKey ?? this.settings.providerApiKey)
        : type === 'gemini'
          ? (this.settings.geminiApiKey ?? this.settings.providerApiKey)
          : type === 'openrouter'
            ? (this.settings.openrouterApiKey ?? this.settings.providerApiKey)
            : type === 'literouter'
              ? (this.settings.literouterApiKey ?? this.settings.providerApiKey)
              : type === 'openai'
                ? (this.settings.openaiApiKey ?? this.settings.providerApiKey)
                : type === 'custom'
                  ? (this.settings.customApiKey ?? this.settings.providerApiKey)
                  : undefined
    return {
      type,
      baseUrl,
      apiKey,
      model,
      ...(type === 'gemini' && this.settings.geminiRpm != null
        ? { rpm: this.settings.geminiRpm }
        : {})
    }
  }

  private cloudProviderApiKey(
    cloudType: 'deepseek' | 'openai' | 'openrouter' | 'gemini'
  ): string | undefined {
    switch (cloudType) {
      case 'deepseek':
        return this.settings.deepseekApiKey?.trim() || undefined
      case 'openai':
        return this.settings.openaiApiKey?.trim() || undefined
      case 'openrouter':
        return this.settings.openrouterApiKey?.trim() || undefined
      case 'gemini':
        return this.settings.geminiApiKey?.trim() || undefined
    }
  }

  private buildSummarizeConfig(): { providerConfig: ProviderConfig; model: string } {
    const primaryIsOllama = this.providerConfig.type === 'ollama'
    const cloudType = this.settings.cloudProvider || 'deepseek'
    const cloudApiKey = this.cloudProviderApiKey(cloudType)
    if (primaryIsOllama && this.settings.cloudEnabled && cloudApiKey) {
      const defaultUrl =
        cloudType === 'deepseek'
          ? DEEPSEEK_API_BASE_URL
          : cloudType === 'gemini'
            ? GEMINI_API_BASE_URL
            : cloudType === 'openrouter'
              ? OPENROUTER_API_BASE_URL
              : 'https://api.openai.com/v1'
      const cloudBaseUrl = this.settings.cloudBaseUrl || defaultUrl
      const cloudModel =
        this.settings.cloudModel ||
        (cloudType === 'gemini' ? GEMINI_MODEL_DEFAULT : DEEPSEEK_MODEL_DEFAULT)
      return {
        providerConfig: {
          type: cloudType,
          baseUrl: cloudBaseUrl,
          apiKey: cloudApiKey,
          model: cloudModel
        },
        model: cloudModel
      }
    }
    if (!primaryIsOllama && this.settings.ollamaUrl) {
      const ollamaModel = this.settings.model
      return {
        providerConfig: { type: 'ollama', baseUrl: this.settings.ollamaUrl },
        model: ollamaModel
      }
    }
    return { providerConfig: this.providerConfig, model: this.settings.model }
  }

  resolveSummarizeThreshold(): number {
    if (this.settings.aggressiveCompression) return 65
    if (this.settings.contextSummarizeThreshold != null) {
      return Math.max(50, Math.min(85, this.settings.contextSummarizeThreshold))
    }
    return 85
  }

  /** Цепочка моделей: основная + fallbackModels из настроек. */
  resolveModelChain(primary = this.settings.model): string[] {
    return buildModelFallbackChain(primary, this.settings.fallbackModels)
  }

  /** Ollama без облачной summarize-модели — только обрезка, без второго LLM-вызова. */
  private preferTruncateSummarize(): boolean {
    return (
      this.providerConfig.type === 'ollama' &&
      this.summarizeProviderConfig.type === 'ollama' &&
      !(
        this.settings.cloudEnabled &&
        this.cloudProviderApiKey(this.settings.cloudProvider || 'deepseek')
      )
    )
  }

  private resolveNumCtx(model: string): number {
    if (this.settings.modelContextLength && this.settings.modelContextLength > 0) {
      return this.settings.modelContextLength
    }
    return getModelContextLimitTokens(model)
  }

  /** Сжать messages на месте; возвращает метрики для трейса. */
  async compressMessagesInPlace(
    messages: OllamaMessage[],
    model: string,
    selfImproveMode: boolean
  ): Promise<CompressionStepResult> {
    const toolsJsonChars = JSON.stringify(
      getAgentTools(selfImproveMode, this.settings.disabledTools, this.settings.mcpServers)
    ).length
    const threshold = this.resolveSummarizeThreshold()
    const before = buildMessageContextStats(
      messages,
      model,
      toolsJsonChars,
      this.settings.modelContextLength,
      threshold
    )

    const started = Date.now()
    let compressionNotified = false
    const compression = await compressContextMessages({
      messages,
      model,
      summarizeModel: this.summarizeModelResolved,
      toolsJsonChars,
      providerConfig: this.summarizeProviderConfig,
      ollamaUrl: this.settings.ollamaUrl,
      signal: this.signal,
      summarizeThresholdPercent: threshold,
      knownContextLength: this.settings.modelContextLength,
      preferTruncateOverLlmSummarize: this.preferTruncateSummarize(),
      onCompressStart: () => {
        compressionNotified = true
        this.emitter.emit({ type: 'context', summarizing: true })
      }
    })
    if (compressionNotified) this.emitter.emit({ type: 'context', summarizing: false })

    const changed =
      compression.summarized ||
      compression.truncated ||
      compression.droppedMessageCount > 0 ||
      compression.messages.length !== messages.length

    if (changed) {
      messages.splice(0, messages.length, ...compression.messages)
      if (compression.summarized) {
        this.emitter.emit({
          type: 'context',
          content: `📋 Контекст ~${compression.usagePercent}% — суммаризация в ходе задачи`
        })
      } else if (compression.truncated) {
        this.emitter.emit({
          type: 'context',
          content: `📋 Контекст ~${compression.usagePercent}% — старые сообщения обрезаны`
        })
      }
    }

    const after = buildMessageContextStats(
      messages,
      model,
      toolsJsonChars,
      this.settings.modelContextLength,
      threshold
    )

    return {
      changed,
      durationMs: Date.now() - started,
      attempted: compressionNotified,
      before,
      after,
      summarized: compression.summarized,
      truncated: compression.truncated,
      droppedMessageCount: compression.droppedMessageCount
    }
  }

  async chat(
    messages: OllamaMessage[],
    model: string,
    selfImproveMode: boolean,
    options?: { requireTool?: boolean; skipCompression?: boolean }
  ): Promise<ChatResult> {
    if (this.providerConfig.type === 'ollama') {
      try {
        await this.modelRuntime.ensureModelLoaded(model, this.signal)
        const unloaded = await this.modelRuntime.prepareModel(model)
        const placement = await this.modelRuntime.getModelPlacement(model, this.signal)
        const memoryInfo = await this.modelRuntime.getModelMemoryInfo(model)
        const modelMemory = memoryInfo[0]
        void agentLogger.write({
          event: 'model_loaded',
          model,
          placement,
          size_mb: modelMemory?.size ? Math.round(modelMemory.size / (1024 * 1024)) : undefined,
          vram_mb: modelMemory?.vram ? Math.round(modelMemory.vram / (1024 * 1024)) : undefined,
          unloaded: unloaded.unloaded
        })
      } catch (err) {
        void agentLogger.write({ event: 'model_load_error', model, error: String(err) })
      }
    }

    if (!options?.skipCompression) {
      await this.compressMessagesInPlace(messages, model, selfImproveMode)
    }

    const isCloud = this.providerConfig.type !== 'ollama'
    const filteredMessages = isCloud
      ? filterMessagesForCloud(messages)
      : messages.map((msg) =>
          msg.role === 'tool' ? { ...msg, role: 'user' as const, content: msg.content } : msg
        )

    const chatMessages = redactMessagesForModel(
      filteredMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
        content: msg.content,
        ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
        ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
        ...(msg.images?.length ? { images: msg.images } : {})
      }))
    )

    const mcpToolNames = getMcpAgentToolNames(this.settings.mcpServers)
    const toolsForProvider = this.settings.chatMode
      ? []
      : getAgentTools(selfImproveMode, this.settings.disabledTools, this.settings.mcpServers)
    const chatOptions = {
      model,
      messages: chatMessages,
      tools: toolsForProvider,
      stream: true,
      keep_alive: OLLAMA_KEEP_ALIVE as string | number,
      signal: this.signal,
      ...(isCloud ? { max_tokens: 4096, temperature: 0.1 } : {}),
      ...(options?.requireTool ? { tool_choice: 'required' as const } : {}),
      ...(!isCloud && this.settings.ollamaNumGpu != null
        ? { num_gpu: this.settings.ollamaNumGpu }
        : {}),
      ...(!isCloud ? { num_ctx: this.resolveNumCtx(model) } : {}),
      onRetry429: (waitMs: number, attempt: number) => {
        this.emitter.emit({ type: 'retry_429', retryWaitMs: waitMs, retryAttempt: attempt })
      },
      onCircuitBreaker: (state: 'open' | 'half-open' | 'closed', openUntilMs?: number) => {
        this.emitter.emit({
          type: 'circuit_breaker',
          circuitBreakerState: state,
          circuitBreakerOpenUntilMs: openUntilMs
        })
      }
    }

    let content = ''
    let thinking = ''
    const toolCalls: ToolCallShape[] = []
    let evalCount: number | undefined
    let evalDurationNs: number | undefined
    let promptEvalCount: number | undefined
    let requestTotalTokens: number | undefined
    let requestInputTokens = 0
    let requestOutputTokens = 0
    let nativeToolCalls: ToolCallShape[] | undefined

    for await (const chunk of this.modelRuntime.chat(chatOptions)) {
      if (chunk.eval_count != null) evalCount = chunk.eval_count
      if (chunk.eval_duration != null) evalDurationNs = chunk.eval_duration
      if (chunk.prompt_eval_count != null) promptEvalCount = chunk.prompt_eval_count
      if (chunk.total_tokens != null) requestTotalTokens = chunk.total_tokens
      if (chunk.input_tokens != null) requestInputTokens = chunk.input_tokens
      if (chunk.output_tokens != null) requestOutputTokens = chunk.output_tokens
      if (chunk.thinking) {
        thinking += chunk.thinking
        this.emitter.emit({ type: 'thinking', content: chunk.thinking })
      }
      if (chunk.tool_calls?.length) {
        nativeToolCalls = chunk.tool_calls.map((tc) => ({
          id: tc.id,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments as Record<string, string> | string
          }
        }))
      }
      if (chunk.content) {
        content += chunk.content
        this.emitter.emit({ type: 'token', content: chunk.content })
      }
      if (chunk.total_tokens != null) this.sessionTokens += chunk.total_tokens
      if (chunk.input_tokens != null) this.sessionInputTokens += chunk.input_tokens
      if (chunk.output_tokens != null) this.sessionOutputTokens += chunk.output_tokens
      if (chunk.cache_read_tokens != null) this.sessionCacheReadTokens += chunk.cache_read_tokens
      // Накапливаем стоимость если есть раздельные токены
      if (chunk.input_tokens != null || chunk.output_tokens != null) {
        const pricing = findModelPricing(model)
        if (pricing) {
          this.sessionCostUsd += estimateRequestCost(
            pricing,
            chunk.input_tokens ?? 0,
            chunk.output_tokens ?? 0,
            chunk.cache_read_tokens ?? 0
          )
        }
      }
    }

    const requestMetrics = buildRequestGenerationMetrics(
      evalCount,
      evalDurationNs,
      promptEvalCount,
      requestTotalTokens,
      requestInputTokens,
      requestOutputTokens
    )
    const ollamaMetrics = parseOllamaGenerationMetrics(evalCount, evalDurationNs)
    if (ollamaMetrics) {
      this.emitter.emit({ type: 'generation_metrics', generationMetrics: ollamaMetrics })
    } else if (isCloud && this.sessionTokens > 0) {
      this.emitter.emit({
        type: 'generation_metrics',
        generationMetrics: {
          evalCount: 0,
          evalDurationSec: 0,
          tokensPerSec: 0,
          sessionTokens: this.sessionTokens,
          sessionInputTokens: this.sessionInputTokens || undefined,
          sessionOutputTokens: this.sessionOutputTokens || undefined,
          sessionCacheReadTokens: this.sessionCacheReadTokens || undefined,
          estimatedCostUsd: this.sessionCostUsd > 0 ? this.sessionCostUsd : undefined
        }
      })
    }

    if (nativeToolCalls?.length) {
      for (const tc of nativeToolCalls) toolCalls.push(tc)
    } else {
      const embedded = extractEmbeddedToolCalls(content, mcpToolNames)
      content = sanitizeAssistantContent(embedded.content)
      for (const call of embedded.toolCalls) {
        toolCalls.push({
          function: { name: call.name, arguments: call.arguments as Record<string, string> }
        })
      }
    }

    return {
      message: {
        content: content.trim() || undefined,
        thinking: thinking.trim() || undefined,
        tool_calls: toolCalls.length ? toolCalls : undefined
      },
      metrics: requestMetrics
    }
  }
}
