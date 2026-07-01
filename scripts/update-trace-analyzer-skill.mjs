import { readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const skillsPath = join(
  process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
  'CodeViper',
  'ViperSkills.md'
)

function parseSkillsMarkdown(raw) {
  const match = raw.match(/<!-- viper-skills-store\n([\s\S]*?)\n-->/)
  if (!match) throw new Error('viper-skills-store not found')
  return JSON.parse(match[1])
}

function renderSkillsMarkdown(store) {
  const lines = [
    '# ViperSkills',
    '',
    'Глобальные навыки агента CodeViper. Создаются через `create_skill`, сохраняются здесь и применяются автоматически по триггерам.',
    '',
    '<!-- viper-skills-store',
    JSON.stringify(store),
    '-->',
    '',
    '## Навыки',
    ''
  ]

  for (const skill of store.skills) {
    const triggers = skill.triggers.length ? skill.triggers.join(', ') : '—'
    lines.push(`### ${skill.id} · ${skill.name} · ${skill.scope}`)
    lines.push(`**Описание:** ${skill.description || '—'}`)
    lines.push(`**Триггеры:** ${triggers} · **Использовано:** ${skill.useCount}`)
    lines.push('')
    lines.push(skill.instructions)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}

const instructions = `# Trace Analyzer (CodeViper)

Пользователь присылает трейс **чтобы починить CodeViper**, а не чтобы агент выполнил ROADMAP/фичу вместо установленного .exe.

## Где лежат трейсы

| Путь | Содержимое |
|------|------------|
| \`%APPDATA%/CodeViper/traces/{timestamp}.json\` | Экспорт из UI |
| \`%APPDATA%/CodeViper/traces/chats/{chatId}.json\` | Live-трейс чата |

**Как читать:** JSON в чате — разбирай напрямую; с диска — \`run_command\`: \`Get-Content "$env:APPDATA\\CodeViper\\traces\\..." -Raw\` (Windows). \`read_file\` не видит APPDATA — только файлы открытого проекта.

## Быстрый старт

1. Открыть JSON (экспорт или live chats/{chatId}.json).
2. Найти **первую аномалию** (не последний симптом): зацикливание, неверный инструмент, HTTP 402/429, undefined, «0 файлов», отказ модели.
3. Сопоставить с кодом: \`grep_codeviper_files\` / \`read_codeviper_file\` в \`app/electron/main/\`, \`app/shared/\`.
4. Минимальный фикс + unit-тест в \`app/tests/\`.
5. \`remember\` — урок; при GitHub issue \`trace-report\` — \`closes #N\` в коммите.

## Чеклист разбора

- run_start: модель, провайдер, userMessage, projectPath
- tool_call → tool_result: аргументы, ошибки, повторы, signature (циклы)
- llm_response: отказ, галлюцинация путей, text-based tool calls
- context_compress: usage%, method
- nudge: source (loop_guard, self_improve…)
- run_end: status, steps, sessionTokens

События: run_start, llm_request, llm_response, tool_call, tool_result, context_compress, nudge, run_end. Схема: \`app/shared/ipcContracts.ts\`, traceSchemaVersion: 2.

## Куда править (по симптому)

| Симптом | Файлы |
|---------|-------|
| Неверный инструмент | agentTools.ts, toolCalls.ts, nudges в agent.ts |
| Ошибка handler (path, trim) | agentHandlers*.ts, services.ts, codeviperSource.ts |
| ROADMAP без плана | agentHandlersSelfImprovement.ts, shared/selfImprovement.ts |
| 402/429/timeout | providers/*Provider.ts, modelRuntime.ts |
| Пути app/app/, корень vs app/ | normalizeCodeViperPath, agentContext.ts |
| Trace/GitHub IPC | traceStorage.ts, traceGithubReport.ts |

## Типичные паттерны

- **Зацикливание:** одинаковые tool_call подряд → MAX_CONSECUTIVE_SAME_TOOL, nudges в agent.ts
- **Неверные пути:** grep_files вместо grep_codeviper_files → «0 файлов»
- **ROADMAP без плана:** read_roadmap_item без set_self_improvement_plan → автоплан/nudge
- **Billing:** 402/429 после многих шагов → ProviderBillingError, сократить разведку

## Делать

- Чинить **агента и инфраструктуру**, чтобы следующий прогон .exe справился сам.
- \`run_codeviper_command\`: typecheck → test → build (из app/).
- UI: пользователь на \`c:\\Program Files\\CodeViper\\CodeViper.exe\`; runtime — pull в \`%APPDATA%\\CodeViper\\source\`.

## Не делать

- Не реализовывать пункт ROADMAP «за CodeViper» (не писать фичу вместо агента).
- Не просить пользователя вручную доделать то, что должен сделать агент после фикса.
- Не предлагать CodeViper.cmd для проверки.

**Исключение:** явный запрос «сделай сам» / «выполни пункт N» — можно править код фичи.

## Формат отчёта

\`\`\`markdown
## Trace {id}
**Задача:** …
**Корень:** первый сбой (инструмент, шаг, ошибка)
**Фикс:** что менять
**Файлы:** …
**Тест:** app/tests/….
\`\`\`

Полные детали: \`read_skill(id: trace-analyzer)\`.`

const description =
  'Разбор JSON-трейсов CodeViper (%APPDATA%/traces/) и фикс runtime агента — не выполнение ROADMAP за пользователя.'

const triggers = [
  'анализируй трейс',
  'проанализируй трейс',
  'найди проблему в трейсе',
  'trace analysis',
  'trace analyzer',
  'трейс',
  'trace-report',
  'trace debug',
  'разбери трейс',
  'agent trace'
]

const raw = readFileSync(skillsPath, 'utf8')
const store = parseSkillsMarkdown(raw)
const skill = store.skills.find((s) => s.id === 'trace-analyzer')
if (!skill) throw new Error('trace-analyzer not found')

skill.description = description
skill.instructions = instructions
skill.triggers = triggers
skill.updatedAt = new Date().toISOString()

writeFileSync(skillsPath, renderSkillsMarkdown(store), 'utf8')

console.log(`Updated: ${skillsPath}`)
console.log(`Instructions: ${instructions.length} chars (limit inject: 4500)`)
console.log(`Triggers: ${triggers.join(', ')}`)
