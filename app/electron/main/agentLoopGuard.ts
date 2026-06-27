import {
  acceptTextAfterReadTools,
  shouldRetryForMissingTools,
  taskMutationLikelihood,
  taskLikelyNeedsMutation,
  taskLikelyNeedsTools,
  EXPLORATION_STALL_NUDGE
} from '../../shared/actionVerification'
import { escalateModel } from '../../shared/modelRouter'
import {
  EXPLORATION_STALL_MIN_STEPS,
  MAX_CONSECUTIVE_SAME_TOOL,
  MAX_SAME_TOOL_TOTAL
} from '../../shared/constants'
import { checkTaskScopeViolation } from '../../shared/selfImprovement'
import type { AgentSettings } from '../../src/types'
import type { OllamaMessage } from './agentContext'
import type { ModelRuntime } from './modelRuntime'
import { fetchOllamaModels } from './agentOllamaApi'

const MAX_VERIFICATION_RETRIES = 1

export type VerificationAction =
  | { action: 'retry'; nudgeMessage: string }
  | { action: 'failed' }
  | { action: 'escalate'; toModel: string }
  | { action: 'passthrough' }

export class LoopGuard {
  private lastToolSignature: string | null = null
  private consecutiveSameToolCount = 0
  private readonly toolCallCounts = new Map<string, number>()
  private verificationRetries = 0
  private verificationNoticeSent = false
  private explorationStallNudged = false
  private taskScopeNudged = false
  escalated = false

  constructor(
    readonly settings: AgentSettings,
    private readonly modelRuntime: ModelRuntime,
    private readonly signal?: AbortSignal
  ) {}

  /** Проверяет повторяющиеся подряд вызовы одного инструмента с теми же аргументами.
   *  Возвращает сообщение-нудж если лимит превышен, иначе null. */
  checkConsecutive(toolSignature: string, name: string): string | null {
    if (toolSignature === this.lastToolSignature) {
      this.consecutiveSameToolCount++
    } else {
      this.consecutiveSameToolCount = 1
      this.lastToolSignature = toolSignature
    }
    if (this.consecutiveSameToolCount > MAX_CONSECUTIVE_SAME_TOOL) {
      this.consecutiveSameToolCount = 0
      this.lastToolSignature = null
      return `Ты вызываешь инструмент "${name}" с теми же аргументами несколько раз подряд и не продвигаешься вперёд. Попробуй другой подход: измени запрос, используй другой инструмент или обоснуй вывод на основе уже полученных данных.`
    }
    return null
  }

  /** Проверяет суммарное число вызовов инструмента. Возвращает нудж если лимит превышен. */
  checkTotal(name: string): string | null {
    const count = (this.toolCallCounts.get(name) ?? 0) + 1
    this.toolCallCounts.set(name, count)
    if (count > MAX_SAME_TOOL_TOTAL) {
      this.toolCallCounts.set(name, 0)
      return `Ты слишком часто используешь инструмент "${name}". Попробуй другой подход или подведи итог на основе уже собранных данных.`
    }
    return null
  }

  /**
   * Nudge когда mutation-задача: много шагов с tools, но ни одного mutating.
   * Ловит «вечную разведку» (read/grep без edit_file).
   */
  checkExplorationStall(
    userMessage: string,
    mutatingToolsUsed: Set<string>,
    currentStep: number,
    usedTools: boolean
  ): string | null {
    if (this.explorationStallNudged) return null
    if (!usedTools || mutatingToolsUsed.size > 0) return null
    if (!taskLikelyNeedsMutation(userMessage)) return null
    if (currentStep < EXPLORATION_STALL_MIN_STEPS) return null
    this.explorationStallNudged = true
    return EXPLORATION_STALL_NUDGE
  }

  /** Nudge при чтении файлов вне списка «Файлы:» до первых правок. */
  checkTaskScope(
    userMessage: string,
    mutatingToolsUsed: Set<string>,
    invocations: Array<{ name: string; args: Record<string, string> }>
  ): string | null {
    if (this.taskScopeNudged) return null
    for (const inv of invocations) {
      const nudge = checkTaskScopeViolation(userMessage, mutatingToolsUsed, inv.name, inv.args)
      if (nudge) {
        this.taskScopeNudged = true
        return nudge
      }
    }
    return null
  }

  /** Определяет что делать когда модель не вызвала инструменты.
   *  Проверяет рефьюзал → верификацию → завершение. */
  async decideNoToolAction(
    userMessage: string,
    assistantText: string,
    mutatingToolsUsed: Set<string>,
    usedTools: boolean,
    isRefusal: boolean
  ): Promise<VerificationAction> {
    // Рефьюзал + autoModel → эскалируем модель
    if (!this.escalated && assistantText && isRefusal && this.settings.autoModel !== false) {
      const models = await fetchOllamaModels(this.settings.ollamaUrl).catch(() => [])
      const nextModel = escalateModel(this.settings.model, models)
      if (nextModel) {
        this.escalated = true
        return { action: 'escalate', toModel: nextModel }
      }
    }

    const mutationTask = taskLikelyNeedsMutation(userMessage)
    const noMutatingToolsYet = mutatingToolsUsed.size === 0
    let shouldRetry =
      shouldRetryForMissingTools(userMessage, assistantText, mutatingToolsUsed, usedTools) &&
      this.verificationRetries < MAX_VERIFICATION_RETRIES

    if (shouldRetry && taskMutationLikelihood(userMessage) === 'uncertain') {
      const llmSays = await this.classifyMutationNeededByLLM(userMessage)
      if (llmSays === false) shouldRetry = false
    }

    if (shouldRetry) {
      this.verificationRetries++
      const afterExploration = !assistantText.trim() && usedTools && mutatingToolsUsed.size === 0
      const notice = this.verificationNoticeSent
        ? undefined
        : afterExploration
          ? '⚠️ Пустой ответ после разведки — повторяю с требованием правок…'
          : '⚠️ Модель ответила текстом без инструментов — повторяю с обязательным tool call…'
      this.verificationNoticeSent = true
      return {
        action: 'retry',
        nudgeMessage: afterExploration
          ? EXPLORATION_STALL_NUDGE
          : (notice ?? 'Инструменты обязательны для этой задачи. Вызови нужный инструмент сейчас.')
      }
    }

    const toolTaskUnfulfilled =
      taskLikelyNeedsTools(userMessage) && (mutationTask ? noMutatingToolsYet : !usedTools)
    if (toolTaskUnfulfilled && this.verificationRetries >= MAX_VERIFICATION_RETRIES) {
      if (acceptTextAfterReadTools(assistantText, mutatingToolsUsed, usedTools)) {
        return { action: 'passthrough' }
      }
      return { action: 'failed' }
    }

    return { action: 'passthrough' }
  }

  async classifyMutationNeededByLLM(userMessage: string): Promise<boolean | null> {
    try {
      const msgs: OllamaMessage[] = [
        { role: 'system', content: 'Ты классификатор. Отвечай только JSON без пояснений.' },
        {
          role: 'user',
          content: `Требует ли следующее сообщение реального изменения файлов, кода или запуска команд? Или достаточно текстового ответа?\nСообщение: "${userMessage}"\nОтвет строго в формате: {"needsAction":true} или {"needsAction":false}`
        }
      ]
      let text = ''
      for await (const chunk of this.modelRuntime.chat({
        messages: msgs,
        model: this.settings.model,
        tools: [],
        signal: this.signal
      })) {
        if (chunk.content) text += chunk.content
        if (chunk.stop_reason) break
      }
      const match = text.match(/"needsAction"\s*:\s*(true|false)/)
      if (!match) return null
      return match[1] === 'true'
    } catch {
      return null
    }
  }
}
