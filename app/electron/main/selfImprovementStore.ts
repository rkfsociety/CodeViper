import type { SelfImprovementItem } from '../../shared/selfImprovement'
import { isPlanComplete } from '../../shared/selfImprovement'

/** Состояние плана самоулучшения — один экземпляр на AgentRunner. */
export class SelfImprovementPlanStore {
  private activePlan: SelfImprovementItem[] | null = null

  reset(): void {
    this.activePlan = null
  }

  set(items: SelfImprovementItem[]): SelfImprovementItem[] {
    this.activePlan = items.map((item) => ({ ...item, done: false }))
    return this.activePlan
  }

  adopt(items: SelfImprovementItem[]): SelfImprovementItem[] {
    this.activePlan = items.map((item) => ({ ...item }))
    return this.activePlan
  }

  complete(id: string): SelfImprovementItem[] {
    if (!this.activePlan) throw new Error('План не задан — сначала set_self_improvement_plan')

    const item = this.activePlan.find((entry) => entry.id === id)
    if (!item) throw new Error(`Пункт не найден: ${id}`)

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
