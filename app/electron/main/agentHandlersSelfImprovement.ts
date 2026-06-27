import type { ToolHandlers } from './agentTools'
import {
  parsePlanItemsJson,
  formatPlanSummary,
  type SelfImprovementItem
} from '../../shared/selfImprovement'
import type { SelfImprovementPlanStore } from './selfImprovementStore'
import {
  formatRoadmapItemsList,
  formatRoadmapItemDetail,
  listRoadmapItems,
  readRoadmapItem
} from './roadmapParser'

export function createSelfImprovementToolHandlers(
  plan: SelfImprovementPlanStore,
  emitPlan: (items: SelfImprovementItem[]) => void
): Partial<ToolHandlers> {
  const handlers: Partial<ToolHandlers> = {
    list_roadmap: async () => {
      const items = await listRoadmapItems()
      return formatRoadmapItemsList(items)
    },

    read_roadmap_item: async (args) => {
      const num = parseInt(String(args.number).trim(), 10)
      if (!Number.isFinite(num) || num < 1) {
        return 'Укажите number — номер пункта из list_roadmap (целое ≥ 1).'
      }
      const item = await readRoadmapItem(num)
      if (!item) {
        return `Пункт ${num} не найден в ROADMAP.md (раздел «В планах»).`
      }
      return formatRoadmapItemDetail(item)
    },

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
