import {
  shouldRetryForMissingTools,
  taskMutationLikelihood,
  taskLikelyNeedsMutation,
  taskLikelyNeedsTools
} from '../../shared/actionVerification'
import { escalateModel } from '../../shared/modelRouter'
import { MAX_CONSECUTIVE_SAME_TOOL, MAX_SAME_TOOL_TOTAL } from '../../shared/constants'
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
      const notice = this.verificationNoticeSent
        ? undefined
        : '⚠️ Модель ответила текстом без инструментов — повторяю с обязательным tool call…'
      this.verificationNoticeSent = true
      return {
        action: 'retry',
        nudgeMessage:
          notice ?? 'Инструменты обязательны для этой задачи. Вызови нужный инструмент сейчас.'
      }
    }

    const toolTaskUnfulfilled =
      taskLikelyNeedsTools(userMessage) && (mutationTask ? noMutatingToolsYet : !usedTools)
    if (toolTaskUnfulfilled && this.verificationRetries >= MAX_VERIFICATION_RETRIES) {
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
