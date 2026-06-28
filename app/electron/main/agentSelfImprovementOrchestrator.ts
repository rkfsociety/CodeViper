import type { AgentStreamPayload } from '../../src/types'
import type { OllamaMessage } from './agentContext'
import type { ModelRuntime } from './modelRuntime'
import type { AgentSettings } from '../../src/types'
import {
  looksLikeAdviceInsteadOfAction,
  looksLikePseudoToolInvocation,
  responseMentionsToolsWithoutCall,
  shouldRetryForMissingTools,
  pickFakeToolOutputNudge,
  MAX_SIMULATED_TOOL_RESPONSE_RETRIES,
  SIMULATED_TOOL_ABORT_MESSAGE
} from '../../shared/actionVerification'
import {
  parsePlanFromAssistantText,
  syncPlanFromChecklist,
  formatPlanSummary,
  pickCreateSelfImprovementPlanNudge,
  pickStartSelfImprovementExplorationNudge,
  pickRoadmapItemAlreadyReadNudge,
  pickToolVerificationNudge,
  buildSelfImprovementContinueNudge,
  ROADMAP_DOCS_NOT_UPDATED_NUDGE,
  SELF_IMPROVE_PLAN_STUCK_MESSAGE,
  SELF_IMPROVE_PLAN_ALL_BLOCKED_MESSAGE,
  AUTO_ADOPT_ROADMAP_PLAN_AFTER_NUDGES,
  buildPlanFromRoadmapItem,
  parseRoadmapItemFromToolOutput,
  parseRoadmapFieldsFromAssistantText,
  isInvalidSelfImprovementPlan,
  looksLikeJsonPlanText,
  parsePlanItemsJson,
  incrementAttempt,
  hasActionablePending,
  planProgress,
  type SelfImprovementItem,
  type RoadmapPlanSource
} from '../../shared/selfImprovement'
import type { SelfImprovementPlanStore } from './selfImprovementStore'
import { commitAndPushSelfEditsRuntime, stageSelfEditsForRestartRuntime } from './selfCommitRuntime'
import { getPendingCollectiveMemoryCount, queueCollectiveMemoryEntry } from './collectiveMemorySync'
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
      injectHardToolHint?: boolean
      emitAssistant?: { text: string; thinking?: string }
    }
  | { action: 'passthrough' }

export class SelfImprovementOrchestrator {
  private selfImprovePlanNudges = 0
  private currentPlanItemId: string | null = null
  private roadmapDocsUpdated = false
  private roadmapItemNum: number | null = null
  private cachedRoadmapItem: RoadmapPlanSource | null = null
  private readRoadmapRepeatCount = 0
  private lastReadRoadmapNum: number | null = null
  private userMessage = ''
  private lastNoToolText: string | null = null
  private textOnlyStreak = 0
  private simulatedToolRetries = 0

  constructor(
    private readonly plan: SelfImprovementPlanStore,
    private readonly emit: (event: AgentStreamPayload) => void,
    private readonly modelRuntime: ModelRuntime,
    private readonly settings: AgentSettings,
    private readonly projectPath: string,
    private readonly signal?: AbortSignal
  ) {}

  /** Контекст ROADMAP-задачи на один прогон run(). */
  setRoadmapContext(itemNum: number | null, userMessage = ''): void {
    this.roadmapItemNum = itemNum
    this.userMessage = userMessage
    this.roadmapDocsUpdated = false
    this.cachedRoadmapItem = null
    this.readRoadmapRepeatCount = 0
    this.lastReadRoadmapNum = null
    this.lastNoToolText = null
    this.textOnlyStreak = 0
    this.simulatedToolRetries = 0
  }

  /** Предзагрузка пункта ROADMAP (agent.ts читает до первого шага модели). */
  setRoadmapItemDetail(detail: RoadmapPlanSource): void {
    this.cachedRoadmapItem = detail
    this.lastReadRoadmapNum = detail.num
    if (!this.plan.has()) {
      this.autoAdoptRoadmapPlan()
    }
  }

  /**
   * После batch tool calls: кэширует read_roadmap_item, при повторном чтении — автоплан.
   * Возвращает nudge для messages, если план создан автоматически.
   */
  recordToolInvocations(
    invocations: Array<{ name: string; output: string; args?: Record<string, string> }>
  ): string | null {
    if (invocations.length > 0) {
      this.simulatedToolRetries = 0
    }
    if (this.plan.has()) return null

    for (const inv of invocations) {
      if (inv.name !== 'read_roadmap_item') continue
      const parsed = parseRoadmapItemFromToolOutput(inv.output)
      if (!parsed) continue

      if (this.lastReadRoadmapNum === parsed.num) {
        this.readRoadmapRepeatCount++
      } else {
        this.lastReadRoadmapNum = parsed.num
        this.readRoadmapRepeatCount = 1
      }
      this.cachedRoadmapItem = parsed

      if (this.readRoadmapRepeatCount >= 1 && this.autoAdoptRoadmapPlan()) {
        const current = this.plan.get()
        const model = this.settings.model
        const alreadyRead = pickRoadmapItemAlreadyReadNudge(model)
        return current
          ? `${alreadyRead}\n\n${buildSelfImprovementContinueNudge(current, model)}`
          : alreadyRead
      }
    }
    return null
  }

  private autoAdoptRoadmapPlan(source?: RoadmapPlanSource): boolean {
    if (this.plan.has()) return false
    const item = source ?? this.cachedRoadmapItem
    if (!item?.action && !item?.verification) return false

    const items = buildPlanFromRoadmapItem(item)
    if (items.length < 2) return false

    this.plan.adopt(items)
    this.emitPlan(items)
    this.selfImprovePlanNudges = 0
    const next = items.find((i) => !i.done && !i.blocked)
    if (next) this.currentPlanItemId = next.id
    return true
  }

  markRoadmapDocsUpdated(): void {
    this.roadmapDocsUpdated = true
  }

  emitPlan(plan: SelfImprovementItem[]): void {
    const summary = formatPlanSummary(plan)
    this.emit({ type: 'self_improve_plan', content: summary })
    this.emit({
      type: 'todo_update',
      todoItems: plan.map((p) => ({
        id: p.id,
        title: p.title,
        done: p.done,
        blocked: p.blocked
      })),
      content: 'Todo List'
    })
  }

  adoptPlanFromText(assistantText: string): boolean {
    if (!this.plan.has()) {
      const parsed = parsePlanFromAssistantText(assistantText)
      if (parsed) {
        if (isInvalidSelfImprovementPlan(parsed)) {
          return this.cachedRoadmapItem ? this.autoAdoptRoadmapPlan() : false
        }
        this.plan.adopt(parsed)
        this.emitPlan(parsed)
        return true
      }
      if (looksLikeJsonPlanText(assistantText.trim())) {
        try {
          const raw = parsePlanItemsJson(assistantText)
          if (isInvalidSelfImprovementPlan(raw) && this.cachedRoadmapItem) {
            return this.autoAdoptRoadmapPlan()
          }
        } catch {
          /* не JSON-план */
        }
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
    const model = this.settings.model

    if (assistantText && responseMentionsToolsWithoutCall(assistantText)) {
      this.simulatedToolRetries++
      if (this.simulatedToolRetries >= MAX_SIMULATED_TOOL_RESPONSE_RETRIES) {
        return { action: 'error', content: SIMULATED_TOOL_ABORT_MESSAGE }
      }
      const currentPlan = this.plan.get()
      let nudgeMessage = pickFakeToolOutputNudge(model)
      if (currentPlan && this.plan.hasPending()) {
        nudgeMessage = `${nudgeMessage}\n\n${buildSelfImprovementContinueNudge(currentPlan, model)}`
      }
      return {
        action: 'continue',
        nudgeMessage,
        requireTool: true,
        clearDraft: true,
        injectHardToolHint: true
      }
    }

    const adoptedPlan = assistantText ? this.adoptPlanFromText(assistantText) : false
    const current = this.plan.get()

    if (this.plan.isComplete()) {
      if (current) this.emitPlan(current)
      if (this.roadmapItemNum != null && !this.roadmapDocsUpdated) {
        return {
          action: 'continue',
          nudgeMessage: ROADMAP_DOCS_NOT_UPDATED_NUDGE,
          requireTool: true,
          clearDraft: false
        }
      }
      return { action: 'done' }
    }

    if (current && this.plan.hasPending()) {
      if (!hasActionablePending(current)) {
        this.emitPlan(current)
        const { done } = planProgress(current)
        if (done === 0 && this.cachedRoadmapItem && isInvalidSelfImprovementPlan(current)) {
          this.plan.reset()
          if (this.autoAdoptRoadmapPlan()) {
            const planNow = this.plan.get()
            if (planNow) {
              return {
                action: 'continue',
                nudgeMessage: `${pickRoadmapItemAlreadyReadNudge(model)}\n\n${buildSelfImprovementContinueNudge(planNow, model)}`,
                requireTool: true,
                clearDraft: true
              }
            }
          }
        }
        if (done === 0) {
          return { action: 'error', content: SELF_IMPROVE_PLAN_ALL_BLOCKED_MESSAGE }
        }
        return { action: 'done' }
      }

      // Не принимать длинный текст как финальный ответ при незавершённом плане (trace 1782678329979:
      // qwen после read_codeviper_file писал «### Действие» текстом и прогон завершался «ok»).

      if (assistantText) {
        const normalized = assistantText.trim().slice(0, 400)
        const isRepeat = this.lastNoToolText != null && this.lastNoToolText === normalized
        const isPseudoOrAdvice =
          looksLikePseudoToolInvocation(assistantText) ||
          looksLikeAdviceInsteadOfAction(assistantText) ||
          (this.userMessage.length > 0 &&
            shouldRetryForMissingTools(this.userMessage, assistantText, new Set(), usedTools))
        if (isRepeat || isPseudoOrAdvice) {
          this.textOnlyStreak++
        } else {
          this.textOnlyStreak = 0
        }
        this.lastNoToolText = normalized
      }

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
      const baseNudge = buildSelfImprovementContinueNudge(current, model)
      const nudgeMessage =
        this.textOnlyStreak >= 1 ? `${pickToolVerificationNudge(model)}\n\n${baseNudge}` : baseNudge
      return {
        action: 'continue',
        nudgeMessage,
        requireTool: true,
        clearDraft: false,
        emitAssistant:
          !adoptedPlan && assistantText
            ? { text: assistantText, thinking: assistantThinking }
            : undefined
      }
    }

    if (!current && usedTools) {
      if (assistantText && !adoptedPlan) {
        const fromText = parseRoadmapFieldsFromAssistantText(assistantText)
        if (fromText && this.autoAdoptRoadmapPlan(fromText)) {
          const planNow = this.plan.get()
          if (planNow) {
            return {
              action: 'continue',
              nudgeMessage: buildSelfImprovementContinueNudge(planNow, model),
              requireTool: true,
              clearDraft: true
            }
          }
        }
      }

      if (this.cachedRoadmapItem && this.autoAdoptRoadmapPlan()) {
        const planNow = this.plan.get()
        if (planNow) {
          return {
            action: 'continue',
            nudgeMessage: buildSelfImprovementContinueNudge(planNow, model),
            requireTool: true,
            clearDraft: true
          }
        }
      }

      this.selfImprovePlanNudges++
      if (
        this.selfImprovePlanNudges >= AUTO_ADOPT_ROADMAP_PLAN_AFTER_NUDGES &&
        this.autoAdoptRoadmapPlan()
      ) {
        const planNow = this.plan.get()
        if (planNow) {
          return {
            action: 'continue',
            nudgeMessage: buildSelfImprovementContinueNudge(planNow, model),
            requireTool: true,
            clearDraft: true
          }
        }
      }

      if (this.selfImprovePlanNudges >= MAX_SELF_IMPROVE_PLAN_NUDGES) {
        return { action: 'error', content: SELF_IMPROVE_PLAN_STUCK_MESSAGE }
      }
      if (assistantText && !adoptedPlan && !parsePlanFromAssistantText(assistantText)) {
        this.emit({ type: 'assistant', content: assistantText, thinking: assistantThinking })
      }
      return {
        action: 'continue',
        nudgeMessage: pickCreateSelfImprovementPlanNudge(model),
        requireTool: true,
        clearDraft: false
      }
    }

    if (!current && !usedTools) {
      return {
        action: 'continue',
        nudgeMessage: pickStartSelfImprovementExplorationNudge(model),
        requireTool: true,
        clearDraft: true
      }
    }

    return { action: 'passthrough' }
  }

  async autoCommitSelfEdits(userMessage: string, emit: typeof this.emit): Promise<void> {
    try {
      const result = await commitAndPushSelfEditsRuntime(
        userMessage,
        this.settings.selfImproveBranch
      )
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
      const result = await stageSelfEditsForRestartRuntime(userMessage)
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
        if (
          this.settings.syncCollectiveMemory !== false &&
          entry.scope === 'global' &&
          queueCollectiveMemoryEntry(entry)
        ) {
          this.emit({
            type: 'collective_sync',
            collectiveSyncStatus: 'queued',
            collectiveSyncCount: getPendingCollectiveMemoryCount(),
            content: entry.content
          })
        }
      }
    } catch {
      /* рефлексия необязательна */
    }
  }
}
