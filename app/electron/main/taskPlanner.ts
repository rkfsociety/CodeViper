import { isRefusalResponse } from '../../shared/toolCalls'
import { isSelfImprovementTask } from '../../shared/selfImprovement'
import type { LoopGuard } from './agentLoopGuard'
import type { OllamaMessage } from './ollamaMessage'
import type { AgentSettings } from '../../src/types'

export type TaskMode = 'standard'

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

export interface PlannerContext {
  assistantText: string
  assistantThinking?: string
  usedTools: boolean
  mutatingToolsUsed: Set<string>
}

export interface PlanningStrategy {
  decide(context: PlannerContext): Promise<PlannerAction> | PlannerAction
}

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

export class TaskPlanner {
  readonly mode: TaskMode
  private readonly strategy: PlanningStrategy
  private readonly userMessage: string

  constructor(
    mode: TaskMode,
    userMessage: string,
    _orchestrator: unknown,
    loopGuard: LoopGuard,
    customStrategy?: PlanningStrategy
  ) {
    this.mode = mode
    this.userMessage = userMessage
    this.strategy = customStrategy ?? new StandardPlanningStrategy(loopGuard, userMessage)
  }

  get isSelfImprove(): boolean {
    return isSelfImprovementTask(this.userMessage)
  }

  async decide(ctx: PlannerContext): Promise<PlannerAction> {
    return this.strategy.decide(ctx)
  }

  async finalize(
    messages: OllamaMessage[],
    userMessage: string,
    hadMutations: boolean,
    settings: AgentSettings
  ): Promise<void> {
    void messages
    void userMessage
    void hadMutations
    void settings
  }

  static detectMode(userMessage: string): TaskMode {
    void userMessage
    return 'standard'
  }
}
