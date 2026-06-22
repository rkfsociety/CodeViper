import type { ToolHandlers } from './agentTools'
import {
  parsePlanItemsJson,
  formatPlanSummary,
  type SelfImprovementItem
} from '../../shared/selfImprovement'
import type { SelfImprovementPlanStore } from './selfImprovementStore'

export function createSelfImprovementToolHandlers(
  plan: SelfImprovementPlanStore,
  emitPlan: (items: SelfImprovementItem[]) => void
): Partial<ToolHandlers> {
  // @ts-expect-error TS parameter type mismatch
  const handlers: Partial<ToolHandlers> = {
    set_self_improvement_plan: async (args: any) => {
      const items = plan.set(parsePlanItemsJson(args.items))
      emitPlan(items)
      return `${formatPlanSummary(items)}\n\nНачни выполнение пункта 1 через инструменты.`
    },

    complete_self_improvement_item: async (args: any) => {
      const items = plan.complete(args.id)
      emitPlan(items)
      const pending = items.filter((item) => !item.done)
      if (!pending.length) {
        return `Пункт ${args.id} выполнен. Все пункты плана завершены.`
      }
      return `Пункт ${args.id} выполнен. Следующий: «${pending[0].title}» (id: ${pending[0].id})`
    },

    get_self_improvement_plan: async () => {
      const items = plan.get()
      if (!items) return 'План не задан. Вызовите set_self_improvement_plan после изучения кода.'
      return formatPlanSummary(items)
    }
  }
  return handlers
}
