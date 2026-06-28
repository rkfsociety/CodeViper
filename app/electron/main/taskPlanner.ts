/**
 * TaskPlanner — единая точка планирования на каждом шаге агентского цикла.
 *
 * Назначение:
 *   - Определить режим задачи (self-improve / standard) по сообщению пользователя.
 *   - На каждом шаге, когда модель не вызвала инструменты, принять решение:
 *     продолжить, завершить, повторить или эскалировать.
 *   - Выполнить пост-задачную рефлексию (reflectAndLearn).
 *
 * Тестирование: передайте `customStrategy` с моком вместо реальных провайдеров.
 *
 * @example
 *   const planner = new TaskPlanner(taskMode, userMessage, orchestrator, loopGuard)
 *   const action = await planner.decide({ assistantText, assistantThinking, usedTools, mutatingToolsUsed })
 *   if (action.kind === 'done') { ... }
 */
import { isRefusalResponse } from '../../shared/toolCalls'
import { isSelfImprovementTask } from '../../shared/selfImprovement'
import type { SelfImprovementOrchestrator } from './agentSelfImprovementOrchestrator'
import type { LoopGuard } from './agentLoopGuard'
import type { OllamaMessage } from './agentContext'
import type { AgentSettings } from '../../src/types'

// ─── Публичные типы ───────────────────────────────────────────────────────

/** Режим выполнения текущей задачи. */
export type TaskMode = 'self-improve' | 'standard'

/** Унифицированное решение планировщика, возвращаемое из decide(). */
export type PlannerAction =
  | { kind: 'done' }
  | { kind: 'error'; content: string }
  | {
      kind: 'continue'
      nudgeMessage: string
      requireTool: boolean
      clearDraft: boolean
      injectHardToolHint?: boolean
      emitAssistant?: { text: string; thinking?: string }
    }
  | { kind: 'passthrough' }
  | { kind: 'escalate'; toModel: string }
  | { kind: 'retry' }
  | { kind: 'failed' }

/** Контекст одного шага цикла, передаётся в decide(). */
export interface PlannerContext {
  assistantText: string
  assistantThinking?: string
  usedTools: boolean
  mutatingToolsUsed: Set<string>
}

/**
 * Интерфейс стратегии планирования.
 * Реализуйте его в тестах вместо реальных провайдеров:
 *
 * @example
 *   const mock: PlanningStrategy = { decide: async () => ({ kind: 'done' }) }
 *   const planner = new TaskPlanner(mode, msg, orchestrator, loopGuard, mock)
 */
export interface PlanningStrategy {
  decide(context: PlannerContext): Promise<PlannerAction> | PlannerAction
}

// ─── Встроенные стратегии (внутренние) ───────────────────────────────────

class StandardPlanningStrategy implements PlanningStrategy {
  constructor(
    private readonly loopGuard: LoopGuard,
    private readonly userMessage: string
  ) {}

  async decide(ctx: PlannerContext): Promise<PlannerAction> {
    const action = await this.loopGuard.decideNoToolAction(
      this.userMessage,
      ctx.assistantText,
      ctx.mutatingToolsUsed,
      ctx.usedTools,
      isRefusalResponse(ctx.assistantText)
    )
    if (action.action === 'escalate') return { kind: 'escalate', toModel: action.toModel }
    if (action.action === 'retry') return { kind: 'retry' }
    if (action.action === 'failed') return { kind: 'failed' }
    return { kind: 'passthrough' }
  }
}

/** В режиме self-improve: пробует оркестратор; при passthrough падает на стандартную верификацию. */
class SelfImprovePlanningStrategy implements PlanningStrategy {
  constructor(
    private readonly orchestrator: SelfImprovementOrchestrator,
    private readonly fallback: StandardPlanningStrategy
  ) {}

  async decide(ctx: PlannerContext): Promise<PlannerAction> {
    const action = this.orchestrator.handleNoToolCalls(
      ctx.assistantText,
      ctx.assistantThinking,
      ctx.usedTools
    )
    if (action.action === 'done') return { kind: 'done' }
    if (action.action === 'error') return { kind: 'error', content: action.content }
    if (action.action === 'continue') {
      return {
        kind: 'continue',
        nudgeMessage: action.nudgeMessage,
        requireTool: action.requireTool,
        clearDraft: action.clearDraft,
        injectHardToolHint: action.injectHardToolHint,
        emitAssistant: action.emitAssistant
      }
    }
    // passthrough → стандартная верификация (проверка рефьюзала/эскалации)
    return this.fallback.decide(ctx)
  }
}

// ─── TaskPlanner ──────────────────────────────────────────────────────────

export class TaskPlanner {
  readonly mode: TaskMode
  private readonly strategy: PlanningStrategy
  private readonly orchestrator: SelfImprovementOrchestrator

  constructor(
    mode: TaskMode,
    userMessage: string,
    orchestrator: SelfImprovementOrchestrator,
    loopGuard: LoopGuard,
    /** Кастомная стратегия — для тестирования без реальных провайдеров. */
    customStrategy?: PlanningStrategy
  ) {
    this.mode = mode
    this.orchestrator = orchestrator

    if (customStrategy) {
      this.strategy = customStrategy
    } else {
      const standard = new StandardPlanningStrategy(loopGuard, userMessage)
      this.strategy =
        mode === 'self-improve' ? new SelfImprovePlanningStrategy(orchestrator, standard) : standard
    }
  }

  get isSelfImprove(): boolean {
    return this.mode === 'self-improve'
  }

  /** Принять решение когда модель не вызвала инструменты. */
  async decide(ctx: PlannerContext): Promise<PlannerAction> {
    return this.strategy.decide(ctx)
  }

  /**
   * Пост-задачная рефлексия: сохранить уроки из выполненной задачи.
   * @param hadMutations — были ли реальные изменения (влияет на решение учиться).
   *   Для self-improve: передавай `usedTools`.
   *   Для standard: передавай `mutatingToolsUsed.size > 0`.
   */
  async finalize(
    messages: OllamaMessage[],
    userMessage: string,
    hadMutations: boolean,
    settings: AgentSettings
  ): Promise<void> {
    if (settings.selfLearning !== false) {
      await this.orchestrator.reflectAndLearn(messages, userMessage, hadMutations)
    }
  }

  /** Определить режим задачи по сообщению пользователя. */
  static detectMode(userMessage: string): TaskMode {
    return isSelfImprovementTask(userMessage) ? 'self-improve' : 'standard'
  }
}
