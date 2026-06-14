export interface SelfImprovementItem {
  id: string
  title: string
  done: boolean
}

/** Запрос на автономное самоулучшение до выполнения всех пунктов плана. */
export function isSelfImprovementTask(userMessage: string): boolean {
  const text = userMessage.trim()
  if (!text) return false

  return /(?:улучш[\p{L}]*\s+себя|самоулучш[\p{L}]*|саморедакт[\p{L}]*|изучи\s+код\s+и\s+начни|начни\s+улучш[\p{L}]*\s+себя|улучши\s+свой\s+код|improve\s+yourself|self[\s-]?improve)/iu.test(
    text
  )
}

export function selfImprovementStepLimit(configuredMaxSteps: number): number {
  return Math.min(30, Math.max(configuredMaxSteps, 20))
}

export function parsePlanItemsJson(raw: string): SelfImprovementItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('items должны быть JSON-массивом [{id, title}, ...]')
  }

  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error('items: нужен непустой JSON-массив')
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`items[${index}]: ожидается объект`)
    }
    const record = entry as Record<string, unknown>
    const title = String(record.title ?? record.text ?? '').trim()
    if (!title) throw new Error(`items[${index}]: пустой title`)

    return {
      id: String(record.id ?? index + 1),
      title,
      done: false
    }
  })
}

export function parseChecklistAsPlan(text: string): SelfImprovementItem[] | null {
  const items: SelfImprovementItem[] = []

  for (const line of text.split('\n')) {
    const match = line.match(/^\s*(?:[-*]|\d+\.)\s+\[(x| )\]\s+(.+)$/iu)
    if (!match) continue

    items.push({
      id: String(items.length + 1),
      title: match[2].trim(),
      done: match[1].toLowerCase() === 'x'
    })
  }

  return items.length >= 2 ? items : null
}

export function syncPlanFromChecklist(
  text: string,
  plan: SelfImprovementItem[]
): SelfImprovementItem[] {
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*(?:[-*]|\d+\.)\s+\[(x| )\]\s+(.+)$/iu)
    if (!match) continue

    const done = match[1].toLowerCase() === 'x'
    const title = match[2].trim().toLowerCase()
    const item = plan.find(
      (entry) =>
        entry.title.toLowerCase() === title ||
        title.includes(entry.title.toLowerCase()) ||
        entry.title.toLowerCase().includes(title)
    )
    if (item) item.done = done
  }

  return plan
}

export function planProgress(plan: SelfImprovementItem[]): {
  done: number
  total: number
  pending: SelfImprovementItem[]
} {
  const done = plan.filter((item) => item.done).length
  return {
    done,
    total: plan.length,
    pending: plan.filter((item) => !item.done)
  }
}

export function isPlanComplete(plan: SelfImprovementItem[] | null): boolean {
  return Boolean(plan && plan.length > 0 && plan.every((item) => item.done))
}

export function formatPlanSummary(plan: SelfImprovementItem[]): string {
  const { done, total } = planProgress(plan)
  const lines = plan.map(
    (item) => `${item.done ? '✅' : '⬜'} ${item.id}. ${item.title}`
  )
  return `План самоулучшения (${done}/${total}):\n${lines.join('\n')}`
}

export const SELF_IMPROVEMENT_MODE_PROMPT = `## Режим автономного самоулучшения (АКТИВЕН)

Пользователь просил **изучить код и улучшать себя до конца** — не останавливайся после одного ответа.

Обязательный workflow:
1. \`list_codeviper_directory\` + \`read_codeviper_file\` — изучи agent.ts, agentTools.ts, skills.ts
2. \`set_self_improvement_plan\` — зафиксируй **3–8 конкретных** пунктов (skills, UI, инструменты, тесты, промпт)
3. Для **каждого** пункта: инструменты правки → \`complete_self_improvement_item\` с id пункта
4. После правок кода: \`run_codeviper_command\` → \`npm run typecheck\` и \`npm test\`
5. Завершай только когда \`get_self_improvement_plan\` показывает все пункты done

Не давай пользователю пошаговый план — **выполняй** через tool calling.`

export const CREATE_SELF_IMPROVEMENT_PLAN_NUDGE = `STOP. Нужен план самоулучшения через инструмент set_self_improvement_plan.

Пример items:
[{"id":"1","title":"Изучить agent.ts и agentTools.ts"},{"id":"2","title":"Добавить skill для code review"},{"id":"3","title":"Улучшить UI чата"}]

После set_self_improvement_plan сразу начни пункт 1 — вызывай read_codeviper_file / edit_codeviper_file / create_skill.`

export const START_SELF_IMPROVEMENT_EXPLORATION_NUDGE = `Начни автономное самоулучшение: вызови list_codeviper_directory и read_codeviper_file (agent.ts, agentTools.ts), затем set_self_improvement_plan.`

export function buildSelfImprovementContinueNudge(plan: SelfImprovementItem[]): string {
  const { done, total, pending } = planProgress(plan)
  const next = pending[0]

  if (!next) {
    return 'Все пункты плана выполнены. Кратко подведи итог и заверши.'
  }

  return `План самоулучшения: выполнено ${done}/${total}.
Следующий пункт: «${next.title}» (id: ${next.id}).

Вызови инструменты для этого пункта. После успеха — complete_self_improvement_item(id: "${next.id}"), затем следующий пункт.
Не останавливайся, пока все пункты не отмечены done.`
}
