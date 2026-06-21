import type { AgentStreamPayload } from '../../src/types'
import type { OllamaMessage } from './agentContext'
import type { ModelRuntime } from './modelRuntime'
import type { AgentSettings } from '../../src/types'
import {
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
import type { SelfImprovementPlanStore } from './selfImprovementStore'
import { commitAndPushSelfEdits, stageSelfEditsForRestart } from './selfCommit'
import { parseReflectionLearnings, addMemory } from './memory'

const REFLECTION_PROMPT = `Проанализируй выполненную задачу. Если есть полезные уроки для будущих задач (ошибки, паттерны проекта, предпочтения пользователя, навыки работы), верни JSON-массив до 2 элементов:
[{"content": "краткий урок", "category": "pattern|mistake|preference|project|skill", "tags": ["тег"]}]
Если уроков нет — верни [].
Только JSON, без пояснений.`

const OLLAMA_KEEP_ALIVE = '5m'

const MAX_SELF_IMPROVE_PLAN_NUDGES = 20

export type SelfImproveNoToolAction =
  | { action: 'done' }
  | { action: 'error'; content: string }
  | {
      action: 'continue'
      nudgeMessage: string
      requireTool: boolean
      clearDraft: boolean
      emitAssistant?: { text: string; thinking?: string }
    }
  | { action: 'passthrough' }

export class SelfImprovementOrchestrator {
  private selfImprovePlanNudges = 0
  private currentPlanItemId: string | null = null

  constructor(
    private readonly plan: SelfImprovementPlanStore,
    private readonly emit: (event: AgentStreamPayload) => void,
    private readonly modelRuntime: ModelRuntime,
    private readonly settings: AgentSettings,
    private readonly projectPath: string,
    private readonly signal?: AbortSignal
  ) {}

  emitPlan(plan: SelfImprovementItem[]): void {
    this.emit({ type: 'self_improve_plan', content: formatPlanSummary(plan), planItems: plan })
  }

  adoptPlanFromText(assistantText: string): boolean {
    if (!this.plan.has()) {
      const parsed = parsePlanFromAssistantText(assistantText)
      if (parsed) {
        this.plan.adopt(parsed)
        this.emitPlan(parsed)
        return true
      }
      return false
    }
    const current = this.plan.get()
    if (current) syncPlanFromChecklist(assistantText, current)
    return false
  }

  /** Обрабатывает шаг без tool calls в режиме selfImprove.
   *  Возвращает дискриминированный union — caller решает что делать с loop. */
  handleNoToolCalls(
    assistantText: string,
    assistantThinking: string | undefined,
    usedTools: boolean
  ): SelfImproveNoToolAction {
    const adoptedPlan = assistantText ? this.adoptPlanFromText(assistantText) : false
    const current = this.plan.get()

    if (this.plan.isComplete()) {
      if (current) this.emitPlan(current)
      return { action: 'done' }
    }

    if (current && this.plan.hasPending()) {
      this.selfImprovePlanNudges = 0
      if (this.currentPlanItemId) {
        const item = current.find((i) => i.id === this.currentPlanItemId)
        if (item && !item.done) {
          const attemptNum = incrementAttempt(item)
          if (item.blocked) {
            this.emit({
              type: 'context',
              content: `🚫 Пункт «${item.title}» заблокирован после ${attemptNum} попыток`
            })
          }
        }
      }
      this.emitPlan(current)
      const nextItem = current.find((i) => !i.done && !i.blocked)
      if (nextItem) this.currentPlanItemId = nextItem.id
      return {
        action: 'continue',
        nudgeMessage: buildSelfImprovementContinueNudge(current),
        requireTool: true,
        clearDraft: false,
        emitAssistant:
          !adoptedPlan && assistantText
            ? { text: assistantText, thinking: assistantThinking }
            : undefined
      }
    }

    if (!current && usedTools) {
      this.selfImprovePlanNudges++
      if (this.selfImprovePlanNudges >= MAX_SELF_IMPROVE_PLAN_NUDGES) {
        return { action: 'error', content: SELF_IMPROVE_PLAN_STUCK_MESSAGE }
      }
      if (assistantText && !adoptedPlan && !parsePlanFromAssistantText(assistantText)) {
        this.emit({ type: 'assistant', content: assistantText, thinking: assistantThinking })
      }
      return {
        action: 'continue',
        nudgeMessage: CREATE_SELF_IMPROVEMENT_PLAN_NUDGE,
        requireTool: true,
        clearDraft: false
      }
    }

    if (!current && !usedTools) {
      return {
        action: 'continue',
        nudgeMessage: START_SELF_IMPROVEMENT_EXPLORATION_NUDGE,
        requireTool: true,
        clearDraft: true
      }
    }

    return { action: 'passthrough' }
  }

  async autoCommitSelfEdits(userMessage: string, emit: typeof this.emit): Promise<void> {
    try {
      const result = await commitAndPushSelfEdits(userMessage)
      emit({
        type: 'context',
        content: result.ok ? `🔁 Самоправки: ${result.message}` : `⚠️ Автокоммит: ${result.message}`
      })
    } catch {
      /* автокоммит необязателен */
    }
  }

  async stageSelfEditsForRestart(userMessage: string, emit: typeof this.emit): Promise<void> {
    try {
      const result = await stageSelfEditsForRestart(userMessage)
      emit({
        type: 'context',
        content: result.ok
          ? `⏳ Правки сохранены: ${result.message}`
          : `⚠️ Не удалось сохранить правки: ${result.message}`
      })
    } catch {
      /* необязательно */
    }
  }

  async reflectAndLearn(
    messages: OllamaMessage[],
    userMessage: string,
    hadMutations: boolean
  ): Promise<void> {
    if (!hadMutations) return
    try {
      let reflectionContent = ''
      const reflectionMessages = messages
        .filter((msg) => msg.role !== 'tool')
        .map((msg) => ({ role: msg.role as 'user' | 'assistant' | 'system', content: msg.content }))
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
        this.emit({ type: 'learning_saved', content: entry.content, memoryId: entry.id })
      }
    } catch {
      /* рефлексия необязательна */
    }
  }
}
