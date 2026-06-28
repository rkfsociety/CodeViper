import { isCompactPromptModel } from './recommendedModels'
import {
  looksLikeAlreadyImplementedConclusion,
  pickToolVerificationNudge
} from './actionVerification'

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

/** Заголовок пункта из копипаста ROADMAP («N · M · Название — …»). */
export function extractRoadmapTitleFromTask(userMessage: string): string | null {
  const text = userMessage.trim()
  const header = text.match(/(?:^|\n)\*?\*?\d+\s*·\s*(?:S|M|L|XL)\s*·\s*(.+?)(?:\*\*|\s+—)/iu)
  if (header?.[1]) return header[1].trim()
  const goal = text.match(/(?:^|\n)-?\s*\*?\*?Цель:\*?\*?\s*(.+)/iu)
  if (goal?.[1]) return goal[1].trim().slice(0, 80)
  return null
}

export function buildRoadmapAlreadyDoneHint(doneLine: string): string {
  return `## ⚠️ Пункт ROADMAP уже выполнен
Запись в ROADMAP_DONE.md:
${doneLine}

Не реализуй задачу повторно. Кратко сообщи пользователю, что пункт уже в «Сделано», и заверши прогон без правок кода.`
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
    p.startsWith('src/') ||
    p.startsWith('shared/') ||
    p.startsWith('tests/')
  )
}

export const SELF_IMPROVE_TEST_IMPORTS_HINT = `**Тесты** (\`app/tests/*.test.ts\`): импорт из main — \`../electron/main/...\`, из shared — \`../shared/...\`, типы UI — \`../src/types\`. Не \`./modelRuntime\` и не пути к несуществующим файлам в tests/.`

export function buildRoadmapSelfImproveHint(
  itemNum: number | null,
  sourceRoot: string,
  model?: string
): string {
  if (model && isCompactPromptModel(model)) {
    const n = itemNum ?? 'N'
    return `## ROADMAP п.${n}
Корень app/: \`${sourceRoot}\`. Только *_codeviper_*. Шаги: read_roadmap_item → read_codeviper_file (пути из «Файлы») → edit_codeviper_file → run_codeviper_command → ROADMAP/README → commit. Только tool_calls.`
  }
  const itemLine = itemNum
    ? `Пункт ROADMAP: **${itemNum}**.`
    : 'Пункт ROADMAP: следующий из «В планах».'
  return `## Задача ROADMAP (самоулучшение)
${itemLine} Корень исходников CodeViper (app/): \`${sourceRoot}\`

**Инструменты:** для \`app/\`, \`tests/\`, \`ROADMAP.md\`, \`ROADMAP_DONE.md\`, \`README.md\` — только \`*_codeviper_*\` (read_codeviper_file, create_codeviper_file, edit_codeviper_file). **Не** read_file / list_directory / create_file проекта.

**edit_codeviper_file:** только \`path\` + \`old_string\` + \`new_string\` (точечная замена). Не передавай \`content\` / \`new_content\` — сначала read_codeviper_file, скопируй фрагмент. Новый файл → create_codeviper_file; полная перезапись → write_codeviper_file.

**Пути:** относительно корня app/ (например \`tests/foo.test.ts\`, \`../ROADMAP.md\`, \`../ROADMAP_DONE.md\`). **Запрещено:** Program Files, папка .exe, app.asar — это не исходники.

**Файл из «Файлы» отсутствует (ENOENT):** read_codeviper_file эталон из той же папки → create_codeviper_file с полным содержимым.

**UI (app/src/components/*.tsx):** modal-backdrop, useModalA11y, Dialogs.module.css — без выдуманных UI-kit. Настройки приложения — через AgentSettings (settings.json), не localStorage.

${SELF_IMPROVE_TEST_IMPORTS_HINT}

**План set_self_improvement_plan** обязан включать: реализация → run_codeviper_command (\`npm run typecheck\` затем тесты из «Проверка») → правка ROADMAP.md и ROADMAP_DONE.md → README → commit_and_push_self_edits.

Первый шаг: \`read_roadmap_item\` number=${itemNum ?? 'N'} (точные Цель/Файлы/Действие/Проверка), затем read_codeviper_file для путей из «Файлы».

Не вызывай list_directory «для разведки», если пути уже в ROADMAP.`
}

export const READ_FILE_ENOENT_CREATE_HINT = `Файл не существует. Если он в ROADMAP «Файлы» как цель работы — вызови create_codeviper_file (полное содержимое). Сначала read_codeviper_file 1–2 файлов из той же папки (импорты, модалки). Не выдумывай UI-библиотеки. Не повторяй read_* для того же пути.`

export const SELF_IMPROVE_WRONG_PROJECT_TOOL_HINT = `Для исходников CodeViper используй read_codeviper_file / create_codeviper_file / edit_codeviper_file, не инструменты проекта. Корень — в блоке «Исходники CodeViper», не папка установки .exe.`

export const SELF_IMPROVE_GREP_WRONG_TOOL_HINT = `grep_files ищет в открытом проекте (не в исходниках app/). Для ROADMAP-путей (electron/, src/, tests/) — grep_codeviper_files; для чтения — read_codeviper_file.`

export const SELF_IMPROVE_UI_REFERENCE_REQUIRED_HINT = `Перед create_codeviper_file для src/components/*.tsx прочитай эталон: read_codeviper_file app/src/components/ConfirmDialog.tsx (или KeyboardShortcutsModal.tsx, App.tsx) — затем создавай в том же стиле (modal-backdrop, useModalA11y, без сторонних UI-kit).`

/** project_* → *_codeviper_* при самоулучшении, если путь в app/ / tests/ / ROADMAP. */
export const SELF_IMPROVE_PROJECT_TO_CVI_TOOL: Record<string, string> = {
  read_file: 'read_codeviper_file',
  write_file: 'write_codeviper_file',
  create_file: 'create_codeviper_file',
  edit_file: 'edit_codeviper_file',
  list_directory: 'list_codeviper_directory',
  grep_files: 'grep_codeviper_files',
  find_files: 'find_codeviper_files'
}

export function extractSelfImproveToolPath(toolName: string, args: Record<string, string>): string {
  if (toolName === 'read_multiple_files') return ''
  return String(args.path ?? args.from ?? '').trim()
}

export function mapSelfImproveProjectTool(
  toolName: string,
  args: Record<string, string>
): { toolName: string; args: Record<string, string> } {
  const mapped = SELF_IMPROVE_PROJECT_TO_CVI_TOOL[toolName]
  if (!mapped) return { toolName, args }
  // grep/find в самоулучшении — всегда по исходникам app/, не по дереву открытого проекта
  if (toolName === 'grep_files' || toolName === 'find_files') {
    return { toolName: mapped, args }
  }
  const pathArg = extractSelfImproveToolPath(toolName, args)
  if (!pathArg || !isCodeViperSourceRelativePath(pathArg)) return { toolName, args }
  return { toolName: mapped, args }
}

export function isNewUiComponentPath(filePath: string): boolean {
  const p = filePath.trim().replace(/\\/g, '/')
  return /(?:^|\/)src\/components\/[^/]+\.tsx$/i.test(p)
}

export function isCodeViperUiReferencePath(filePath: string): boolean {
  const p = filePath.trim().replace(/\\/g, '/').toLowerCase()
  return (
    p.includes('/src/components/') ||
    /(?:^|\/)src\/app\.tsx$/i.test(p) ||
    /(?:^|\/)app\.tsx$/i.test(p)
  )
}

export function hasReadCodeViperUiReference(readKeys: Iterable<string>): boolean {
  for (const key of readKeys) {
    const pathPart = key.includes(':') ? key.split(':').slice(1).join(':') : key
    if (isCodeViperUiReferencePath(pathPart)) return true
  }
  return false
}

/** Блокирует типичные галлюцинации при create/edit исходников CodeViper. */
export function validateSelfImproveMutatingContent(
  filePath: string,
  content: string
): string | null {
  if (!content.trim()) return null
  void filePath
  if (/@some\//i.test(content)) {
    return 'Ошибка: выдуманный npm-пакет (@some/…) — в проекте нет. read_codeviper_file эталонного компонента (ConfirmDialog.tsx) и копируй паттерн импортов.'
  }
  if (/localStorage\.(get|set)Item\s*\(\s*['"]firstRunCompleted/i.test(content)) {
    return 'Ошибка: firstRunCompleted хранится в AgentSettings (loadSettings/saveSettings), не в localStorage. read_codeviper_file electron/main/settings.ts и src/App.tsx.'
  }
  if (
    /React\.useState/i.test(content) &&
    !/import\s+.*\bReact\b/.test(content) &&
    !/import\s*\{[^}]*\buseState\b/.test(content)
  ) {
    return "Ошибка: React.useState без import — используй `import { useState } from 'react'` как в остальных компонентах."
  }
  return null
}

export const READ_FILE_ALREADY_IN_RUN_HINT = `Этот файл уже читался в текущем прогоне — используй содержимое из предыдущего ответа инструмента, не вызывай read_* снова.`

export const READ_FILE_TRUNCATED_HINT = `Ответ обрезан (средняя часть файла скрыта). Не выдумывай old_string — read_codeviper_file/read_file с offset/limit (например offset=150, limit=80) или grep_* по символу из «Файлы:».`

export const EDIT_OLD_STRING_NOT_FOUND_HINT = `old_string не совпал с файлом. grep_codeviper_files/grep_files по уникальной подстроке (имя переменной, import), затем read_* с offset/limit — не повторяй read без offset, если файл >20KB. Не копируй строки [Файл:…] и [Конец файла] из ответа read_*.`

export const EDIT_WRONG_ARGS_HINT = `edit_* — точечная замена: path + old_string + new_string. Не content/new_content/file_path. Сначала read_* и скопируй фрагмент. Новый файл → create_*; полная перезапись → write_*.`

export const EDIT_ROADMAP_TEXT_AS_OLD_STRING_HINT = `old_string похож на текст ROADMAP (Цель/Файлы/Действие), а не на код. read_codeviper_file или grep_codeviper_files — скопируй точный фрагмент из файла.`

export const TYPECHECK_FAILED_REVERT_HINT = `typecheck упал после правки. Сначала откати сломанный файл: run_codeviper_command «git checkout -- <path>» (или read_codeviper_file + edit с точным фрагментом). Не commit_and_push_self_edits, пока npm run typecheck зелёный.`

export const MISSING_PING_SCRIPT_HINT = `Скрипта npm run ping нет. Проверка «ping к mock server»: run_codeviper_command «npm test -- providers.integration.test.ts».`

export const OPENAI_CUSTOM_ENDPOINT_HINT = `OpenAIProvider уже принимает custom baseUrl + apiKey + model id в конструкторе (см. electron/main/providers/openaiProvider.ts и modelRuntime.ts). Не переименовывай export class OpenAIProvider и BACKOFF_MS. Добавь type custom в modelRuntime + ModelTab + тест ping в providers.integration.test.ts.`

/** Расширяет «Проверка» ROADMAP до явной npm-команды для плана самоулучшения. */
export function expandRoadmapVerificationTitle(verification: string): string {
  const v = verification.trim()
  if (!v) return v
  if (/ping.*mock|mock.*ping|ping.*server/i.test(v) && !/npm test/i.test(v)) {
    return `${v} (npm test -- providers.integration.test.ts)`
  }
  return v
}

/** Блокирует типичные разрушительные edit_codeviper_file при самоулучшении. */
export function validateSelfImproveEditArgs(oldString: string, newString: string): string | null {
  if (
    /(?:^|\n)\s*(?:Цель|Файлы|Действие|Проверка):/u.test(oldString) ||
    /\d+\s*·\s*(?:S|M|L|XL)\s*·/u.test(oldString)
  ) {
    return `Ошибка: ${EDIT_ROADMAP_TEXT_AS_OLD_STRING_HINT}`
  }

  if (
    /export\s+class\s+(\w+)/.test(oldString) &&
    !/export\s+class/.test(newString) &&
    /\bclass\s+\w+/.test(newString)
  ) {
    return 'Ошибка: нельзя убирать export у class — сохрани «export class …».'
  }

  const exportedClass = oldString.match(/export\s+class\s+(\w+)/)?.[1]
  const newClass = newString.match(/\bclass\s+(\w+)/)?.[1]
  if (exportedClass && newClass && exportedClass !== newClass) {
    return `Ошибка: не переименовывай export class ${exportedClass} → ${newClass}. Добавь новый класс/файл или правь все импорты.`
  }

  if (/\bBACKOFF_MS\b/.test(oldString) && !/\bBACKOFF_MS\b/.test(newString)) {
    return 'Ошибка: не переименовывай BACKOFF_MS — поле используется StreamingChatProvider.'
  }

  return null
}

/** Подсказка для ROADMAP custom OpenAI endpoint (LM Studio, vLLM). */
export function buildOpenAiCustomEndpointHint(item: RoadmapPlanSource): string | null {
  const blob = `${item.action} ${item.title ?? ''} ${item.verification}`.toLowerCase()
  if (!/custom|openai|baseurl|lm studio|vllm|endpoint/i.test(blob)) return null
  return `## Custom OpenAI endpoint\n${OPENAI_CUSTOM_ENDPOINT_HINT}`
}

/** read_file / read_codeviper_file вернули head+tail или chunk с пропуском строк. */
export function isReadOutputTruncated(output: string): boolean {
  return (
    /строк обрезано/i.test(output) ||
    /показаны первые \d+ и последние \d+/i.test(output) ||
    /\[Ещё \d+ строк\. Читай дальше: offset=/i.test(output)
  )
}

const PATH_SCOPED_READ_TOOLS = new Set([
  'read_file',
  'read_codeviper_file',
  'search_in_file',
  'read_multiple_files',
  'find_symbol',
  'find_references'
])

/** edit/create/write — scope проверяем всегда (trace: edit README вместо файлов из «Файлы:»). */
const PATH_SCOPED_MUTATING_TOOLS = new Set([
  'edit_file',
  'edit_codeviper_file',
  'create_file',
  'create_codeviper_file',
  'write_file',
  'write_codeviper_file'
])

const PATH_SCOPED_AGENT_TOOLS = new Set([...PATH_SCOPED_READ_TOOLS, ...PATH_SCOPED_MUTATING_TOOLS])

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
  if (!PATH_SCOPED_AGENT_TOOLS.has(toolName)) return null
  // После успешной правки в scope — read вне списка не блокируем; mutating вне scope — всегда.
  if (mutatingToolsUsed.size > 0 && PATH_SCOPED_READ_TOOLS.has(toolName)) return null
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

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

/** title и алиасы; при отсутствии — поля ROADMAP action/check (Gemini fix #23). */
export function extractPlanItemTitle(record: Record<string, unknown>): string {
  for (const key of PLAN_ITEM_TITLE_KEYS) {
    const value = record[key]
    if (value == null) continue
    const text = String(value).trim()
    if (text) return text
  }

  const action = firstNonEmptyString(record.action, record.действие)
  const check = firstNonEmptyString(record.check, record.проверка)
  if (action && check) return `${action} (проверка: ${check})`
  if (action) return action
  if (check) return check

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

const PLAN_TOOL_ARG_KEYS = ['items', 'plan', 'steps', 'plan_items'] as const

/** items / plan / steps — Gemini часто шлёт plan вместо items (см. trace #1782640816802). */
export function resolvePlanToolArg(args: Record<string, unknown> | null | undefined): unknown {
  if (!args) return undefined
  for (const key of PLAN_TOOL_ARG_KEYS) {
    const value = args[key]
    if (value !== undefined && value !== null) return value
  }

  const action = firstNonEmptyString(args.action, args.действие)
  const check = firstNonEmptyString(args.check, args.проверка)
  const roadmap = firstNonEmptyString(args.roadmap)
  if (action || check || roadmap) {
    const lines: string[] = []
    if (action) lines.push(`- Реализация: ${action}`)
    if (check) lines.push(check.startsWith('-') ? check : `- ${check}`)
    if (roadmap) lines.push(roadmap.startsWith('-') ? roadmap : `- ${roadmap}`)
    return lines.join('\n')
  }

  return undefined
}

function parseStringArrayPlan(parsed: unknown[]): SelfImprovementItem[] | null {
  if (!parsed.length || !parsed.every((entry) => typeof entry === 'string')) return null
  const items: SelfImprovementItem[] = []
  for (const entry of parsed) {
    const title = entry.trim()
    if (!title) continue
    items.push({
      id: String(items.length + 1),
      title,
      done: false,
      attemptCount: 0
    })
  }
  return items.length ? items : null
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

/** Убирает markdown-обёртки и {items: [...]} перед парсингом плана. */
export function stripPlanItemsWrappers(text: string): string {
  let t = text.trim()
  const fenced = t.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i)
  if (fenced) t = fenced[1].trim()

  try {
    const parsed = JSON.parse(t) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as { items?: unknown }).items)
    ) {
      return JSON.stringify((parsed as { items: unknown[] }).items)
    }
  } catch {
    /* не JSON-объект */
  }

  return t
}

/** Многострочный JSON [{id,title},…] — не разбирать parseLoosePlanLines построчно (trace 1782685657649). */
export function looksLikeJsonPlanText(text: string): boolean {
  const t = text.trim()
  if (!t.startsWith('[')) return false
  return /"title"\s*:|"id"\s*:/.test(t)
}

const FRAGMENTED_PLAN_TITLE_RE = /^"?(?:id|title)"?\s*:/i

/** План из «склеенных» строк JSON — артеfact parseLoosePlanLines. */
export function isFragmentedJsonPlan(items: SelfImprovementItem[]): boolean {
  if (items.length < 2) return false
  const fragmented = items.filter((item) => FRAGMENTED_PLAN_TITLE_RE.test(item.title.trim()))
  return fragmented.length >= Math.ceil(items.length / 2)
}

/** Только meta-шаги (read/write ROADMAP) без реализации — qwen trace 1782685657649. */
export function isExplorationOnlyPlan(items: SelfImprovementItem[]): boolean {
  if (items.length === 0) return false
  const implRe =
    /edit_codeviper|create_codeviper|preview_patch|run_codeviper_command|npm run|commit_and_push/i
  if (items.some((item) => implRe.test(item.title))) return false
  const metaRe =
    /read_roadmap_item|read_codeviper_file.*ROADMAP|write_codeviper_file.*ROADMAP|ROADMAP:\s*удалить/i
  return items.every((item) => metaRe.test(item.title))
}

export function isInvalidSelfImprovementPlan(items: SelfImprovementItem[]): boolean {
  return isFragmentedJsonPlan(items) || isExplorationOnlyPlan(items)
}

/** Построчный план без JSON (Gemini flash иногда шлёт так). */
export function parseLoosePlanLines(text: string): SelfImprovementItem[] | null {
  const items: SelfImprovementItem[] = []

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const match = line.match(/^(?:(?:\d+[.)]\s*|[-*]\s*|step\s+\d+[:.)]\s*))?(.+)$/iu)
    const title = (match?.[1] ?? line).trim()
    if (title.length < 3) continue
    if (/^```|^[[{]/u.test(title)) continue

    items.push({
      id: String(items.length + 1),
      title,
      done: false,
      attemptCount: 0
    })
  }

  return items.length >= 2 ? items : null
}

function parseJsonPlanArray(normalized: string): SelfImprovementItem[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(normalized)
  } catch {
    return null
  }

  if (!Array.isArray(parsed) || !parsed.length) return null

  const stringPlan = parseStringArrayPlan(parsed)
  if (stringPlan) return stringPlan

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`items[${index}]: ожидается объект`)
    }
    const record = entry as Record<string, unknown>
    const title = extractPlanItemTitle(record)
    if (!title) {
      const keys = Object.keys(record).join(', ') || '(пусто)'
      throw new Error(
        `items[${index}]: пустой title — используйте title или action/check (алиасы: item, text). Ключи: ${keys}`
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

export function parsePlanItemsJson(raw: unknown): SelfImprovementItem[] {
  const normalized = stripPlanItemsWrappers(normalizePlanItemsInput(raw)).trim()

  if (looksLikeJsonPlanText(normalized)) {
    const fromJson = parseJsonPlanArray(normalized)
    if (fromJson?.length) return fromJson
  }

  const bulletPlan = parseBulletListAsPlan(normalized)
  if (bulletPlan) return bulletPlan

  if (!looksLikeJsonPlanText(normalized)) {
    const loosePlan = parseLoosePlanLines(normalized)
    if (loosePlan && !isFragmentedJsonPlan(loosePlan)) return loosePlan
  }

  const fromJson = parseJsonPlanArray(normalized)
  if (fromJson?.length) return fromJson

  const fallback = parseBulletListAsPlan(normalized) ?? parseLoosePlanLines(normalized)
  if (fallback && !isFragmentedJsonPlan(fallback)) return fallback

  throw new Error(
    'items должны быть JSON-массивом [{id, title}, ...] или маркированным списком «- пункт»'
  )
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

/** Минимальные поля ROADMAP для автоплана (read_roadmap_item / startup). */
export interface RoadmapPlanSource {
  num: number
  action: string
  verification: string
  title?: string
}

/** Стандартный план самоулучшения из полей «Действие» и «Проверка» пункта ROADMAP. */
export function buildPlanFromRoadmapItem(item: RoadmapPlanSource): SelfImprovementItem[] {
  const items: SelfImprovementItem[] = []
  const action = item.action.trim()
  const verification = item.verification.trim()

  if (action) {
    items.push({ id: '1', title: action, done: false, attemptCount: 0 })
  }
  if (verification) {
    items.push({
      id: String(items.length + 1),
      title: expandRoadmapVerificationTitle(verification),
      done: false,
      attemptCount: 0
    })
  }
  items.push({
    id: String(items.length + 1),
    title: `ROADMAP: удалить пункт ${item.num}, перенумеровать; ROADMAP_DONE: запись; README: счётчик задач`,
    done: false,
    attemptCount: 0
  })
  items.push({
    id: String(items.length + 1),
    title: 'commit_and_push_self_edits',
    done: false,
    attemptCount: 0
  })
  return items
}

/** Парсит текст ответа read_roadmap_item (Цель / Файлы / Действие / Проверка). */
export function parseRoadmapItemFromToolOutput(text: string): RoadmapPlanSource | null {
  const body = text.replace(/^Инструмент\s+read_roadmap_item:\s*/i, '').trim()
  const numMatch = body.match(/^Пункт\s+(\d+)/m)
  if (!numMatch) return null

  const readField = (name: string): string => {
    const re = new RegExp(`^${name}:\\s*(.+)$`, 'im')
    const m = body.match(re)
    return m?.[1]?.trim() ?? ''
  }

  const action = readField('Действие')
  const verification = readField('Проверка')
  if (!action && !verification) return null

  const titleMatch = body.match(/^Пункт\s+\d+\s+·\s+(?:S|M|L|XL)\s+·\s+(.+?)(?:\s+\(|$)/im)
  return {
    num: parseInt(numMatch[1], 10),
    action,
    verification,
    title: titleMatch?.[1]?.trim()
  }
}

/** Действие/Проверка из текста ответа модели (qwen часто пишет план текстом, не tool call). */
export function parseRoadmapFieldsFromAssistantText(text: string): RoadmapPlanSource | null {
  const actionMatch = text.match(
    /(?:^|\n)(?:#{1,3}\s*)?\*?\*?Действие:?\*?\*?\s*([\s\S]*?)(?=\n\s*(?:#{1,3}\s*)?\*?\*?(?:Проверка|Инструмент|Редактирование)|$)/iu
  )
  const checkMatch = text.match(
    /(?:^|\n)(?:#{1,3}\s*)?\*?\*?Проверка:?\*?\*?\s*([\s\S]*?)(?=\n\s*(?:#{1,3}\s*)?\*?\*?(?:Действие|Инструмент|Редактирование)|$)/iu
  )
  if (!actionMatch && !checkMatch) return null

  const clean = (raw: string): string =>
    raw
      .replace(/^\d+\.\s+/gm, '')
      .replace(/^[-*]\s+/gm, '')
      .replace(/`/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^инструмент/i.test(l) && !/^только tool/i.test(l))
      .join(' ')
      .trim()

  const action = actionMatch ? clean(actionMatch[1]) : ''
  const verification = checkMatch ? clean(checkMatch[1]) : ''
  if (!action && !verification) return null
  if (/^реализация пункта \d+ из дорожной/i.test(action)) return null

  const numMatch = text.match(/пункт\s+(\d+)/i)
  return {
    num: numMatch ? parseInt(numMatch[1], 10) : 1,
    action: action || verification,
    verification:
      verification && verification !== action ? verification : 'npm run typecheck; npm run build'
  }
}

/** План из markdown checklist или JSON-массива [{id, title}, …] в тексте ответа модели. */
export function parsePlanFromAssistantText(text: string): SelfImprovementItem[] | null {
  const roadmapFields = parseRoadmapFieldsFromAssistantText(text)
  if (roadmapFields?.action) {
    const built = buildPlanFromRoadmapItem(roadmapFields)
    if (built.length >= 2) return built
  }

  const checklist = parseChecklistAsPlan(text)
  if (checklist) return checklist

  for (const candidate of extractJsonArrays(text)) {
    if (!/(?:id|title|item)/i.test(candidate)) continue
    try {
      const items = parsePlanItemsJson(candidate)
      if (items.length >= 2 && !isInvalidSelfImprovementPlan(items)) return items
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

/** Есть невыполненные пункты, по которым ещё можно работать (не заблокированы). */
export function hasActionablePending(plan: SelfImprovementItem[]): boolean {
  return plan.some((item) => !item.done && !item.blocked)
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
1. read_roadmap_item number=N (предпочтительно) или read_codeviper_file ../ROADMAP.md → пункт N; read_codeviper_file для путей из «Файлы» (ENOENT → create_codeviper_file)
2. set_self_improvement_plan — Действие + Проверка + обновление ROADMAP.md, ROADMAP_DONE.md и README.md (единый Todo List в UI; не set_todo_list)
3. create_codeviper_file / edit_codeviper_file → complete_self_improvement_item(id)
4. run_codeviper_command — сначала \`npm run typecheck\`, затем команды из «Проверка» (npm test …)
5. edit_codeviper_file ../ROADMAP.md — удалить пункт N, перенумеровать; edit_codeviper_file ../ROADMAP_DONE.md — запись в «Сделано»; README — счётчик задач
6. commit_and_push_self_edits в том же прогоне
7. В цепочке 🔗 — не переходить к следующему номеру, пока текущий не закрыт

Без steps пользователю — только tool_calling.`

export const SELF_IMPROVEMENT_MODE_PROMPT_COMPACT = `## Самоулучшение
Исходники app/: только *_codeviper_*. read_roadmap_item → read_codeviper_file → edit_codeviper_file → run_codeviper_command → ROADMAP/README → commit_and_push_self_edits.
Только native tool_calls — не пиши «Инструмент …» / «Путь:» текстом.`

export function pickSelfImprovementModePrompt(model: string): string {
  return isCompactPromptModel(model)
    ? SELF_IMPROVEMENT_MODE_PROMPT_COMPACT
    : SELF_IMPROVEMENT_MODE_PROMPT
}

export const CREATE_SELF_IMPROVEMENT_PLAN_NUDGE = `⚠️ Нужен set_self_improvement_plan по полям ROADMAP (Действие + Проверка + ROADMAP/README).
Формат A — JSON: [{"id":"1","title":"…Действие…"},{"id":"2","title":"npm run typecheck"}]
Формат B — список:
- Реализация: …
- npm run typecheck
- ROADMAP: удалить пункт; ROADMAP_DONE: запись
Только tool_calling. read_roadmap_item number=N (или read_codeviper_file ../ROADMAP.md) и файлы из «Файлы» (*_codeviper_*, не read_file).`

export const CREATE_SELF_IMPROVEMENT_PLAN_NUDGE_COMPACT = `set_self_improvement_plan: Действие + Проверка + ROADMAP/README. Только tool_calls.`

export const AUTO_ADOPT_ROADMAP_PLAN_AFTER_NUDGES = 1

/** qwen2.5-coder иногда пишет «read_roadmap_item number=1» текстом вместо native tool call. */
export function isPseudoReadRoadmapItemText(text: string): boolean {
  return /^\s*read_roadmap_item\s+number\s*=\s*\d+\s*$/i.test(text.trim())
}

export const SELF_IMPROVE_PLAN_STUCK_MESSAGE =
  'Самоулучшение stuck: plan-текст вместо set_self_improvement_plan. qwen2.5-coder:7b / llama3.1:8b или перефразируй.'

export const SELF_IMPROVE_PLAN_ALL_BLOCKED_MESSAGE =
  'Самоулучшение не выполнено: все пункты плана заблокированы (модель писала «Вывод: … завершено» без tool calls). Повторите прогон или смените модель.'

export const ROADMAP_ITEM_ALREADY_READ_NUDGE = `Пункт ROADMAP уже прочитан — не вызывай read_roadmap_item повторно. План создан автоматически; начни с read_codeviper_file для путей из «Файлы», затем edit_codeviper_file. Не вставляй текст ROADMAP в old_string — только фрагменты из read/grep.`

export const ROADMAP_ITEM_ALREADY_READ_NUDGE_COMPACT = `ROADMAP прочитан. read_codeviper_file (пути из «Файлы») → edit_codeviper_file. Только tool_calls.`

export const START_SELF_IMPROVEMENT_EXPLORATION_NUDGE = `Start: read_roadmap_item number=N (или read_codeviper_file ../ROADMAP.md) → read_codeviper_file файлы из «Файлы» (ENOENT → create_codeviper_file) → set_self_improvement_plan. Не list_directory и не read_file проекта для app/. Не угадывай файлы (agent.ts в корне нет — смотри «Файлы» в ROADMAP).`

export const START_SELF_IMPROVEMENT_EXPLORATION_NUDGE_COMPACT = `read_roadmap_item N → read_codeviper_file (пути из «Файлы») → edit_codeviper_file. Только tool_calls.`

export function pickStartSelfImprovementExplorationNudge(model: string): string {
  return isCompactPromptModel(model)
    ? START_SELF_IMPROVEMENT_EXPLORATION_NUDGE_COMPACT
    : START_SELF_IMPROVEMENT_EXPLORATION_NUDGE
}

export function pickCreateSelfImprovementPlanNudge(model: string): string {
  return isCompactPromptModel(model)
    ? CREATE_SELF_IMPROVEMENT_PLAN_NUDGE_COMPACT
    : CREATE_SELF_IMPROVEMENT_PLAN_NUDGE
}

export function pickRoadmapItemAlreadyReadNudge(model: string): string {
  return isCompactPromptModel(model)
    ? ROADMAP_ITEM_ALREADY_READ_NUDGE_COMPACT
    : ROADMAP_ITEM_ALREADY_READ_NUDGE
}

/** Модель выдала текстовый план/рассуждение вместо tool calls (self-improve). */
export function looksLikeSelfImproveTextPlan(assistantText: string): boolean {
  const text = assistantText.trim()
  if (!text || text.length < 80) return false
  if (looksLikeAlreadyImplementedConclusion(text)) return false

  return (
    /(?:^|\n)\s*#{1,3}\s*(?:Действие|Проверка|План|Шаги?)\b/im.test(text) ||
    /(?:^|\n)\s*\d+\.\s+\*\*[^*]+\*\*/m.test(text) ||
    /(?:давайте|давай)\s+начн(?:ем|ём)/iu.test(text) ||
    /Теперь давайте начн/i.test(text) ||
    /(?:^|\n)\s*[-*]\s+(?:Реализация|Проверка|Шаг)/im.test(text) ||
    (text.length >= 200 && /(?:^|\n)\s*#{1,3}\s/m.test(text))
  )
}

export { pickToolVerificationNudge }

export const ROADMAP_DOCS_NOT_UPDATED_NUDGE = `Код и тесты готовы, но ROADMAP.md / ROADMAP_DONE.md / README.md не обновлены. edit_codeviper_file: удалить выполненный пункт из ROADMAP.md, перенумеровать с 1, запись в ROADMAP_DONE.md («Сделано»), счётчик в README — затем commit_and_push_self_edits.`

export function buildSelfImprovementContinueNudge(
  plan: SelfImprovementItem[],
  model?: string
): string {
  const { done, total, pending } = planProgress(plan)
  const blocked = plan.filter((item) => item.blocked).length
  const next = pending[0]
  const compact = model ? isCompactPromptModel(model) : false

  const blocked_info =
    blocked > 0
      ? compact
        ? ` Заблокировано: ${blocked}.`
        : `\n⚠️ Заблокировано ${blocked} пунктов (не переоформляй их).`
      : ''

  if (!next) {
    const summary = compact
      ? blocked > 0
        ? `План ${done}/${total}.${blocked_info} Итог и завершение.`
        : 'План выполнен. Краткий итог.'
      : blocked > 0
        ? `${done} пункта выполнены${blocked_info}. Кратко подведи итог и заверши.`
        : 'Все пункты плана выполнены. Кратко подведи итог и заверши.'
    return summary
  }

  if (compact) {
    return `План ${done}/${total}.${blocked_info} Следующий: «${next.title}» (id ${next.id}). Tool call → complete_self_improvement_item(id).`
  }

  return `План самоулучшения: выполнено ${done}/${total}.${blocked_info}
Следующий пункт: «${next.title}» (id: ${next.id}).

Вызови инструменты для этого пункта. После успеха — complete_self_improvement_item(id: "${next.id}"), затем следующий пункт.
Не останавливайся, пока все активные пункты не отмечены done.`
}
