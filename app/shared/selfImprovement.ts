/** Ветка git по умолчанию для автономного самоулучшения (не master/main). */
export const DEFAULT_SELF_IMPROVE_BRANCH = 'agent/self-improve'

export interface SelfImprovementItem {
  id: string
  title: string
  done: boolean
  attemptCount?: number
  blocked?: boolean
  blockReason?: string
}

/** Имя ветки самоулучшения: только agent/*, иначе дефолт. */
export function resolveSelfImproveBranch(configured?: string): string {
  const raw = configured?.trim() || DEFAULT_SELF_IMPROVE_BRANCH
  if (!/^agent\/[a-z0-9][a-z0-9\-_.]*$/i.test(raw)) {
    return DEFAULT_SELF_IMPROVE_BRANCH
  }
  return raw.toLowerCase()
}

const ROADMAP_SELF_IMPROVE_RE =
  /(?:выполни\s+пункт\s+\d+|следующий\s+пункт).*ROADMAP\.md.*самоулучш/iu

/** Тело пункта ROADMAP (копипаст из «В планах»): Цель / Файлы / уровень или Действие+Проверка. */
export function isRoadmapItemBodyTask(userMessage: string): boolean {
  const text = userMessage.trim()
  if (!text) return false
  if (!/Файлы:\s*\S/iu.test(text) || !/Цель:\s*\S/iu.test(text)) return false
  return (
    /уровень\s+\d+/iu.test(text) || (/Действие:\s*\S/iu.test(text) && /Проверка:\s*\S/iu.test(text))
  )
}

/** Промпт «Выполни пункт N из ROADMAP.md — самоулучшение» или тело пункта. */
export function isRoadmapSelfImprovementTask(userMessage: string): boolean {
  const text = userMessage.trim()
  return ROADMAP_SELF_IMPROVE_RE.test(text) || isRoadmapItemBodyTask(text)
}

/** Номер пункта из ROADMAP-промпта или тела пункта, иначе null. */
export function parseRoadmapTaskItemNumber(userMessage: string): number | null {
  const text = userMessage.trim()
  const standard = text.match(/выполни\s+пункт\s+(\d+)\s+из\s+ROADMAP\.md/iu)
  if (standard) {
    const n = parseInt(standard[1], 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const body = text.match(/(?:^|\n)\*?\*?(\d+)\s*·/u)
  if (body) {
    const n = parseInt(body[1], 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}

/** Запрос на автономное самоулучшение до выполнения всех пунктов плана. */
export function isSelfImprovementTask(userMessage: string): boolean {
  const text = userMessage.trim()
  if (!text) return false
  if (isRoadmapSelfImprovementTask(text)) return true

  return /(?:улучш[\p{L}]*\s+себя|самоулучш[\p{L}]*|саморедакт[\p{L}]*|изучи\s+код\s+и\s+начни|начни\s+улучш[\p{L}]*\s+себя|улучши\s+свой\s+код|improve\s+yourself|self[\s-]?improve)/iu.test(
    text
  )
}

/** Путь относительно app/ — исходники CodeViper (для самоулучшения). */
export function isCodeViperSourceRelativePath(filePath: string): boolean {
  const p = filePath.trim().replace(/\\/g, '/')
  if (!p) return false
  if (/^(\.\.\/)?ROADMAP(_DONE)?\.md$/i.test(p)) return true
  if (/^(\.\.\/)?README\.md$/i.test(p)) return true
  return (
    p.startsWith('app/') ||
    p.startsWith('electron/') ||
    p.startsWith('shared/') ||
    p.startsWith('tests/')
  )
}

export const SELF_IMPROVE_TEST_IMPORTS_HINT = `**Тесты** (\`app/tests/*.test.ts\`): импорт из main — \`../electron/main/...\`, из shared — \`../shared/...\`, типы UI — \`../src/types\`. Не \`./modelRuntime\` и не пути к несуществующим файлам в tests/.`

export function buildRoadmapSelfImproveHint(itemNum: number | null, sourceRoot: string): string {
  const itemLine = itemNum
    ? `Пункт ROADMAP: **${itemNum}**.`
    : 'Пункт ROADMAP: следующий из «В планах».'
  return `## Задача ROADMAP (самоулучшение)
${itemLine} Корень исходников CodeViper (app/): \`${sourceRoot}\`

**Инструменты:** для \`app/\`, \`tests/\`, \`ROADMAP.md\`, \`ROADMAP_DONE.md\`, \`README.md\` — только \`*_codeviper_*\` (read_codeviper_file, create_codeviper_file, edit_codeviper_file). **Не** read_file / list_directory / create_file проекта.

**Пути:** относительно корня app/ (например \`tests/foo.test.ts\`, \`../ROADMAP.md\`, \`../ROADMAP_DONE.md\`). **Запрещено:** Program Files, папка .exe, app.asar — это не исходники.

**Файл из «Файлы» отсутствует (ENOENT):** сразу create_codeviper_file с полным содержимым; не повторять read_*.

${SELF_IMPROVE_TEST_IMPORTS_HINT}

**План set_self_improvement_plan** обязан включать: реализация → run_codeviper_command (\`npm run typecheck\` затем тесты из «Проверка») → правка ROADMAP.md и ROADMAP_DONE.md → README → commit_and_push_self_edits.

Не вызывай list_directory «для разведки», если пути уже в ROADMAP.`
}

export const READ_FILE_ENOENT_CREATE_HINT = `Файл не существует. Если он в ROADMAP «Файлы» как цель работы — вызови create_codeviper_file (полное содержимое). Не повторяй read_file/read_codeviper_file для того же пути.`

export const SELF_IMPROVE_WRONG_PROJECT_TOOL_HINT = `Для исходников CodeViper используй read_codeviper_file / create_codeviper_file / edit_codeviper_file, не инструменты проекта. Корень — в блоке «Исходники CodeViper», не папка установки .exe.`

export const READ_FILE_ALREADY_IN_RUN_HINT = `Этот файл уже читался в текущем прогоне — используй содержимое из предыдущего ответа инструмента, не вызывай read_* снова.`

const PATH_SCOPED_AGENT_TOOLS = new Set([
  'read_file',
  'read_codeviper_file',
  'search_in_file',
  'read_multiple_files',
  'find_symbol',
  'find_references'
])

function normalizeScopePath(p: string): string {
  return p.trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
}

/** Пути из поля «Файлы:» в промпте задачи (ROADMAP или копипаст пункта). */
export function parseTaskScopedFiles(userMessage: string): string[] | null {
  const m = userMessage.match(/(?:^|\n)-?\s*\*?\*?Файлы:\*?\*?\s*(.+)/iu)
  if (!m) return null
  const line = m[1].split('\n')[0].trim()
  if (!line) return null
  const files = line
    .split(/[,;]/)
    .map((s) => s.trim().replace(/^`+|`+$/g, ''))
    .filter(Boolean)
  return files.length > 0 ? files : null
}

/** Путь инструмента попадает в список «Файлы:» (по полному пути или basename). */
export function isPathWithinTaskScope(toolPath: string, scopedFiles: string[]): boolean {
  const norm = normalizeScopePath(toolPath)
  if (!norm) return false
  const base = norm.split('/').pop() ?? norm
  for (const scoped of scopedFiles) {
    const sn = normalizeScopePath(scoped)
    if (!sn) continue
    const sb = sn.split('/').pop() ?? sn
    if (norm === sn || norm.endsWith(`/${sn}`) || base === sb) return true
  }
  return false
}

export function buildTaskScopeNudge(scopedFiles: string[]): string {
  return `⚠️ В задаче указаны файлы: ${scopedFiles.join(', ')}. Не читай IPC, preload и другие пути вне списка — сначала edit_file / edit_codeviper_file по этим файлам.`
}

/** Инструмент с path-аргументом и проверка scope по полю «Файлы:». */
export function checkTaskScopeViolation(
  userMessage: string,
  mutatingToolsUsed: ReadonlySet<string>,
  toolName: string,
  args: Record<string, string>
): string | null {
  if (mutatingToolsUsed.size > 0) return null
  if (!PATH_SCOPED_AGENT_TOOLS.has(toolName)) return null
  const scoped = parseTaskScopedFiles(userMessage)
  if (!scoped?.length) return null
  const toolPath = args.path?.trim()
  if (!toolPath) return null
  if (isPathWithinTaskScope(toolPath, scoped)) return null
  return buildTaskScopeNudge(scoped)
}

export function selfImprovementStepLimit(configuredMaxSteps: number): number {
  // Для самообучения снимаем жёсткий потолок — агент должен дойти до конца плана.
  // Нижняя граница 50 шагов, верхняя — не ограничена (пользователь может остановить вручную).
  return Math.max(configuredMaxSteps, 200)
}

const PLAN_ITEM_TITLE_KEYS = ['title', 'text', 'item', 'name', 'description', 'label'] as const

export function extractPlanItemTitle(record: Record<string, unknown>): string {
  for (const key of PLAN_ITEM_TITLE_KEYS) {
    const value = record[key]
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

/** Нормализует args.items из tool call (string | array | object). */
export function normalizePlanItemsInput(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw) || (raw && typeof raw === 'object')) {
    return JSON.stringify(raw)
  }
  return String(raw ?? '')
}

/** Маркированный список «- пункт» / «1. пункт» (Gemini иногда шлёт вместо JSON). */
export function parseBulletListAsPlan(text: string): SelfImprovementItem[] | null {
  const items: SelfImprovementItem[] = []

  for (const line of text.split('\n')) {
    const match = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/u)
    if (!match) continue

    const title = match[1].trim()
    if (!title) continue

    items.push({
      id: String(items.length + 1),
      title,
      done: false,
      attemptCount: 0
    })
  }

  return items.length >= 2 ? items : null
}

export function parsePlanItemsJson(raw: unknown): SelfImprovementItem[] {
  const normalized = normalizePlanItemsInput(raw).trim()
  const bulletPlan = parseBulletListAsPlan(normalized)
  if (bulletPlan) return bulletPlan

  let parsed: unknown
  try {
    parsed = JSON.parse(normalized)
  } catch {
    const fallback = parseBulletListAsPlan(normalized)
    if (fallback) return fallback
    throw new Error(
      'items должны быть JSON-массивом [{id, title}, ...] или маркированным списком «- пункт»'
    )
  }

  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error('items: нужен непустой JSON-массив')
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`items[${index}]: ожидается объект`)
    }
    const record = entry as Record<string, unknown>
    const title = extractPlanItemTitle(record)
    if (!title) {
      const keys = Object.keys(record).join(', ') || '(пусто)'
      throw new Error(
        `items[${index}]: пустой title — используйте поле title (не item). Ключи: ${keys}`
      )
    }

    return {
      id: String(record.id ?? index + 1),
      title,
      done: false,
      attemptCount: 0
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
      done: match[1].toLowerCase() === 'x',
      attemptCount: 0
    })
  }

  return items.length >= 2 ? items : null
}

function extractJsonArrays(text: string): string[] {
  const arrays: string[] = []
  let depth = 0
  let start = -1

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '[') {
      if (depth === 0) start = i
      depth++
    } else if (char === ']') {
      depth--
      if (depth === 0 && start >= 0) {
        arrays.push(text.slice(start, i + 1))
        start = -1
      }
    }
  }

  return arrays
}

/** План из markdown checklist или JSON-массива [{id, title}, …] в тексте ответа модели. */
export function parsePlanFromAssistantText(text: string): SelfImprovementItem[] | null {
  const checklist = parseChecklistAsPlan(text)
  if (checklist) return checklist

  for (const candidate of extractJsonArrays(text)) {
    if (!/(?:id|title|item)/i.test(candidate)) continue
    try {
      const items = parsePlanItemsJson(candidate)
      if (items.length >= 2) return items
    } catch {
      // пробуем следующий массив
    }
  }

  return null
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
    pending: plan.filter((item) => !item.done && !item.blocked)
  }
}

export function isItemBlocked(item: SelfImprovementItem): boolean {
  return Boolean(item.blocked)
}

export function blockItem(item: SelfImprovementItem, reason: string): void {
  item.blocked = true
  item.blockReason = reason
}

export function incrementAttempt(item: SelfImprovementItem): number {
  const count = (item.attemptCount ?? 0) + 1
  item.attemptCount = count
  if (count >= 3) {
    blockItem(item, `Заблокирован после 3 попыток`)
  }
  return count
}

export function isPlanComplete(plan: SelfImprovementItem[] | null): boolean {
  return Boolean(plan && plan.length > 0 && plan.every((item) => item.done))
}

export function formatPlanSummary(plan: SelfImprovementItem[]): string {
  const { done, total } = planProgress(plan)
  const lines = plan.map((item) => {
    let icon = '⬜'
    if (item.done) icon = '✅'
    else if (item.blocked) icon = '🚫'
    const suffix = item.blocked && item.blockReason ? ` (${item.blockReason})` : ''
    return `${icon} ${item.id}. ${item.title}${suffix}`
  })
  return `План самоулучшения (${done}/${total}):\n${lines.join('\n')}`
}

export const SELF_IMPROVEMENT_MODE_PROMPT = `## Самоулучшение (АКТИВНО)
Изучай → loop до done. Автопуш — в ветку agent/self-improve, не в master.

ROADMAP.md — формат пункта:
«N · [S/M/L/XL] · Название» + Цель / Файлы / Действие / Проверка.
Промпт: «Выполни пункт N из ROADMAP.md — самоулучшение CodeViper».

**Исходники CodeViper** (app/, tests/, ROADMAP.md, ROADMAP_DONE.md): только инструменты \`*_codeviper_*\`. Не read_file/list_directory/create_file проекта. Не пути Program Files / установки .exe.

${SELF_IMPROVE_TEST_IMPORTS_HINT}

Алгоритм:
1. read_codeviper_file ../ROADMAP.md → пункт N; read_codeviper_file для путей из «Файлы» (ENOENT → create_codeviper_file)
2. set_self_improvement_plan — Действие + Проверка + обновление ROADMAP.md, ROADMAP_DONE.md и README.md
3. create_codeviper_file / edit_codeviper_file → complete_self_improvement_item(id)
4. run_codeviper_command — сначала \`npm run typecheck\`, затем команды из «Проверка» (npm test …)
5. edit_codeviper_file ../ROADMAP.md — удалить пункт N, перенумеровать; edit_codeviper_file ../ROADMAP_DONE.md — запись в «Сделано»; README — счётчик задач
6. commit_and_push_self_edits в том же прогоне
7. В цепочке 🔗 — не переходить к следующему номеру, пока текущий не закрыт

Без steps пользователю — только tool_calling.`

export const CREATE_SELF_IMPROVEMENT_PLAN_NUDGE = `⚠️ Нужен set_self_improvement_plan по полям ROADMAP (Действие + Проверка + ROADMAP/README).
[{"id":"1","title":"…Действие…"},{"id":"2","title":"npm run typecheck"},{"id":"3","title":"…Проверка npm test…"},{"id":"4","title":"ROADMAP: удалить пункт; ROADMAP_DONE: запись в Сделано"},{"id":"5","title":"README: счётчик задач"}]
Только tool_calling. read_codeviper_file ../ROADMAP.md и файлы из «Файлы» (*_codeviper_*, не read_file).`

export const SELF_IMPROVE_PLAN_STUCK_MESSAGE =
  'Самоулучшение stuck: plan-текст вместо set_self_improvement_plan. qwen2.5-coder:7b / llama3.1:8b или перефразируй.'

export const START_SELF_IMPROVEMENT_EXPLORATION_NUDGE = `Start: read_codeviper_file ../ROADMAP.md → read_codeviper_file файлы из «Файлы» (ENOENT → create_codeviper_file) → set_self_improvement_plan. Не list_directory и не read_file проекта для app/.`

export const ROADMAP_DOCS_NOT_UPDATED_NUDGE = `Код и тесты готовы, но ROADMAP.md / ROADMAP_DONE.md / README.md не обновлены. edit_codeviper_file: удалить выполненный пункт из ROADMAP.md, перенумеровать с 1, запись в ROADMAP_DONE.md («Сделано»), счётчик в README — затем commit_and_push_self_edits.`

export function buildSelfImprovementContinueNudge(plan: SelfImprovementItem[]): string {
  const { done, total, pending } = planProgress(plan)
  const blocked = plan.filter((item) => item.blocked).length
  const next = pending[0]

  const blocked_info =
    blocked > 0 ? `\n⚠️ Заблокировано ${blocked} пунктов (не переоформляй их).` : ''

  if (!next) {
    const summary =
      blocked > 0
        ? `${done} пункта выполнены${blocked_info}. Кратко подведи итог и заверши.`
        : 'Все пункты плана выполнены. Кратко подведи итог и заверши.'
    return summary
  }

  return `План самоулучшения: выполнено ${done}/${total}.${blocked_info}
Следующий пункт: «${next.title}» (id: ${next.id}).

Вызови инструменты для этого пункта. После успеха — complete_self_improvement_item(id: "${next.id}"), затем следующий пункт.
Не останавливайся, пока все активные пункты не отмечены done.`
}
