import type { SelfImprovementItem } from '../../shared/selfImprovement'
import { isPlanComplete } from '../../shared/selfImprovement'

/** Состояние плана самоулучшения — один экземпляр на AgentRunner. */
export class SelfImprovementPlanStore {
  private activePlan: SelfImprovementItem[] | null = null

  reset(): void {
    this.activePlan = null
  }

  set(items: SelfImprovementItem[]): SelfImprovementItem[] {
    this.activePlan = items.map((item) => ({ ...item, done: false, attemptCount: 0 }))
    return this.activePlan
  }

  adopt(items: SelfImprovementItem[]): SelfImprovementItem[] {
    this.activePlan = items.map((item) => ({ ...item }))
    return this.activePlan
  }

  complete(id: string | number): SelfImprovementItem[] {
    if (!this.activePlan) throw new Error('План не задан — сначала set_self_improvement_plan')

    const normalizedId = String(id).trim()
    const item = this.activePlan.find((entry) => entry.id === normalizedId)
    if (!item) throw new Error(`Пункт не найден: ${normalizedId}`)

    item.done = true
    return this.activePlan
  }

  get(): SelfImprovementItem[] | null {
    return this.activePlan
  }

  has(): boolean {
    return Boolean(this.activePlan?.length)
  }

  hasPending(): boolean {
    return Boolean(this.activePlan?.some((item) => !item.done))
  }

  isComplete(): boolean {
    return isPlanComplete(this.activePlan)
  }
}
