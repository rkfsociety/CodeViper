import type { SelfImprovementItem } from '../../shared/selfImprovement'

let activePlan: SelfImprovementItem[] | null = null

export function resetSelfImprovementPlan(): void {
  activePlan = null
}

export function setSelfImprovementPlan(items: SelfImprovementItem[]): SelfImprovementItem[] {
  activePlan = items.map((item) => ({ ...item, done: false }))
  return activePlan
}

export function adoptSelfImprovementPlan(items: SelfImprovementItem[]): SelfImprovementItem[] {
  activePlan = items.map((item) => ({ ...item }))
  return activePlan
}

export function completeSelfImprovementItem(id: string): SelfImprovementItem[] {
  if (!activePlan) throw new Error('План не задан — сначала set_self_improvement_plan')

  const item = activePlan.find((entry) => entry.id === id)
  if (!item) throw new Error(`Пункт не найден: ${id}`)

  item.done = true
  return activePlan
}

export function getSelfImprovementPlan(): SelfImprovementItem[] | null {
  return activePlan
}

export function hasSelfImprovementPlan(): boolean {
  return Boolean(activePlan?.length)
}

export function hasPendingSelfImprovementItems(): boolean {
  return Boolean(activePlan?.some((item) => !item.done))
}

export function isSelfImprovementPlanComplete(): boolean {
  return Boolean(activePlan?.length && activePlan.every((item) => item.done))
}
