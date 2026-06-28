import type { ToolHandlers } from './agentTools'
import {
  parsePlanItemsJson,
  parsePlanFromAssistantText,
  normalizePlanItemsInput,
  formatPlanSummary,
  type SelfImprovementItem
} from '../../shared/selfImprovement'
import type { SelfImprovementPlanStore } from './selfImprovementStore'
import {
  formatRoadmapItemsList,
  formatRoadmapItemDetail,
  listRoadmapItems,
  readRoadmapItem,
  findRoadmapDoneMatch
} from './roadmapParser'

function parseSelfImprovementPlanItems(raw: unknown): SelfImprovementItem[] {
  try {
    return parsePlanItemsJson(raw)
  } catch (firstError) {
    const text = normalizePlanItemsInput(raw)
    const fromAssistant = parsePlanFromAssistantText(text)
    if (fromAssistant) return fromAssistant
    throw firstError
  }
}

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
        const doneLine = await findRoadmapDoneMatch(`пункт ${num}`)
        if (doneLine) {
          return (
            `Пункт ${num} не найден в ROADMAP.md (раздел «В планах»).\n\n` +
            `Возможно уже выполнен — запись в ROADMAP_DONE.md:\n${doneLine}\n\n` +
            `Не реализуй повторно. Сообщи пользователю и заверши прогон.`
          )
        }
        return `Пункт ${num} не найден в ROADMAP.md (раздел «В планах»).`
      }
      return formatRoadmapItemDetail(item)
    },

    set_self_improvement_plan: async (args: any) => {
      const items = plan.set(parseSelfImprovementPlanItems(args?.items))
      emitPlan(items)
      return `${formatPlanSummary(items)}\n\nНачни выполнение пункта 1 через инструменты.`
    },

    complete_self_improvement_item: async (args: any) => {
      const itemId = String(args?.id ?? '').trim()
      if (!itemId) return 'Укажите id пункта из set_self_improvement_plan (строка или число).'
      const items = plan.complete(itemId)
      emitPlan(items)
      const pending = items.filter((item) => !item.done)
      if (!pending.length) {
        return `Пункт ${itemId} выполнен. Все пункты плана завершены.`
      }
      return `Пункт ${itemId} выполнен. Следующий: «${pending[0].title}» (id: ${pending[0].id})`
    },

    get_self_improvement_plan: async () => {
      const items = plan.get()
      if (!items) return 'План не задан. Вызовите set_self_improvement_plan после изучения кода.'
      return formatPlanSummary(items)
    }
  }
  return handlers
}
