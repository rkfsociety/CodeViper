import {
  parsePlanItemsJson,
  parsePlanFromAssistantText,
  normalizePlanItemsInput,
  resolvePlanToolArg,
  formatPlanSummary,
  isInvalidSelfImprovementPlan,
  type SelfImprovementItem
} from '../../shared/selfImprovement'
import type { SelfImprovementPlanStore } from './selfImprovementStore'
import {
  formatRoadmapItemsList,
  formatPrioritizedRoadmapItemsList,
  formatRoadmapItemDetail,
  listRoadmapItems,
  prioritizeRoadmapItems,
  readRoadmapItem,
  findRoadmapDoneMatch,
  appendRoadmapDoneItem
} from './roadmapParser'
import { getCodeViperSourceRoot } from './codeviperSource'

function parseSelfImprovementPlanItems(raw: unknown): SelfImprovementItem[] {
  try {
    const items = parsePlanItemsJson(raw)
    if (isInvalidSelfImprovementPlan(items)) {
      throw new Error(
        'План должен содержать шаги реализации (Действие + Проверка из ROADMAP), а не только read_roadmap_item / write ROADMAP.'
      )
    }
    return items
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
): Record<string, (...args: any[]) => any> {
  const handlers: Record<string, (...args: any[]) => any> = {
    list_roadmap: async () => {
      const items = await listRoadmapItems()
      return formatRoadmapItemsList(items)
    },

    prioritize_roadmap_items: async (args: any) => {
      const rawLimit = Number.parseInt(String(args?.limit ?? '10').trim(), 10)
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 10
      const items = await prioritizeRoadmapItems(limit)
      return formatPrioritizedRoadmapItemsList(items)
    },

    read_roadmap_item: async (args: any) => {
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
      return formatRoadmapItemDetail(item, getCodeViperSourceRoot())
    },

    set_self_improvement_plan: async (args: any) => {
      const planArg = resolvePlanToolArg(args)
      if (planArg === undefined && (args?.item_id != null || args?.id != null)) {
        return 'Ошибка: set_self_improvement_plan требует items (JSON-массив [{id, title}, ...] или список «- шаг»), не item_id/id. Для отметки шага — complete_self_improvement_item.'
      }
      const items = plan.set(parseSelfImprovementPlanItems(planArg))
      emitPlan(items)
      return `${formatPlanSummary(items)}\n\nНачни выполнение пункта 1 через инструменты.`
    },

    complete_self_improvement_item: async (args: any) => {
      const itemId = String(args?.id ?? args?.item_id ?? args?.itemId ?? '').trim()
      if (!itemId) return 'Укажите id пункта из set_self_improvement_plan (строка или число).'
      const items = plan.complete(itemId)
      emitPlan(items)
      const completedNum = Number.parseInt(itemId, 10)
      if (Number.isFinite(completedNum)) {
        const doneItem = await readRoadmapItem(completedNum)
        if (doneItem) {
          await appendRoadmapDoneItem(doneItem)
        }
      }
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
