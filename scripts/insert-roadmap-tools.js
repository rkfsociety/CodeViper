/**
 * Вставка пунктов ROADMAP по инструментам агента + сквозная перенумерация.
 * Запуск: node scripts/insert-roadmap-tools.js
 */
const fs = require('fs')
const path = require('path')

const roadmapPath = path.join(__dirname, '..', 'ROADMAP.md')
let text = fs.readFileSync(roadmapPath, 'utf8').replace(/\r\n/g, '\n')

const BLOCK_IGNORE = `
### 🔗 Ignore и верификация mutating tools

**PLACEHOLDER · S · ignore в grep_files / find_files** — уровень 1
- **Цель:** \`grep_files\` и \`find_files\` уважают \`.gitignore\`, \`.cursorignore\`, \`.codeviperignore\` как \`list_directory\`
- **Файлы:** \`ignorePatterns.ts\`, \`fileSearch.ts\`, \`fileSearchInWorker.ts\`
- **Действие:** общий фильтр пути при обходе дерева; rules из корня проекта
- **Проверка:** unit-тест: файл из \`.codeviperignore\` не в \`grep_files\`


**PLACEHOLDER · S · MUTATING_TOOLS: GitHub и файловые ops** — уровень 1
- **Цель:** \`create_issue\`, \`create_pr\`, \`trigger_github_workflow\`, \`copy_file\`, \`move_file\`, \`rename_folder\`, \`copy_folder\` в \`MUTATING_TOOLS\`
- **Файлы:** \`shared/actionVerification.ts\`, \`tests/actionVerification.test.ts\`
- **Действие:** дополнить Set; тест «создай PR» → requires mutation
- **Проверка:** \`npm test -- actionVerification\`

`

const BLOCK_ROADMAP_GH = `
### 🔗 ROADMAP и GitHub для агента

**PLACEHOLDER · M · list_pull_requests** — уровень 1
- **Цель:** tool \`list_pull_requests\` — открытые PR (как \`PrStatusPanel\`)
- **Файлы:** \`agentTools/integrations.ts\`, \`agentHandlersGitHub.ts\`, \`githubPr.ts\`, \`toolCalls.ts\`
- **Действие:** handler вызывает \`listPullRequests()\`; схема без обязательных параметров
- **Проверка:** unit-тест mock; имя в \`AGENT_TOOL_NAMES\`


**PLACEHOLDER · S · list_roadmap** — уровень 1
- **Цель:** tool \`list_roadmap\` — список пунктов «В планах» (num · title · chain)
- **Файлы:** \`roadmapParser.ts\`, \`agentTools/mcp.ts\`, \`agentHandlersSelfImprovement.ts\`
- **Действие:** обёртка над \`listRoadmapItems()\`; форматированный текст
- **Проверка:** unit-тест handler ≥1 пункт при наличии ROADMAP.md


**PLACEHOLDER · S · read_roadmap_item** — уровень 1
- **Цель:** tool \`read_roadmap_item\` с \`number\` — цель/файлы/действие/проверка пункта N
- **Файлы:** \`roadmapParser.ts\`, handlers, \`agentTools/mcp.ts\`
- **Действие:** parse полного блока пункта N из ROADMAP.md
- **Проверка:** unit-тест: существующий пункт содержит поля шаблона


**PLACEHOLDER · S · Описания search-инструментов** — уровень 1
- **Цель:** в description — когда \`grep_files\` vs \`find_files\` vs \`search_in_file\` vs \`file_search_summary\`
- **Файлы:** \`agentTools/core.ts\`, \`defaultSkills.ts\` (viper-files)
- **Действие:** обновить description; строка «когда использовать» в skill
- **Проверка:** unit-тест descriptions содержат ключевые слова


**PLACEHOLDER · M · docs/tools-api актуализация** — уровень 1
- **Цель:** справочник совпадает с \`agentTools/\` и \`AGENT_TOOL_NAMES\`
- **Файлы:** \`docs/tools-api.md\`, \`docs/README.md\`
- **Действие:** путь источника; индекс tools; \`check_github_auth\`, git, roadmap
- **Проверка:** тест: каждое имя из \`AGENT_TOOL_NAMES\` упомянуто в md

`

const BLOCK_LEVEL2 = `
### 🔗 Дополнительные инструменты агента

**PLACEHOLDER · M · git_blame и git_show** — уровень 2
- **Цель:** read-only \`git_blame\` (path, line?) и \`git_show\` (commit, path?)
- **Файлы:** \`gitTools.ts\`, \`agentTools/core.ts\`, \`agentHandlersProject.ts\`
- **Действие:** лимит строк вывода; только внутри projectPath
- **Проверка:** unit-тест temp git repo


**PLACEHOLDER · M · diff_files** — уровень 2
- **Цель:** unified diff двух файлов проекта без git
- **Файлы:** \`diffUtil.ts\`, \`agentTools/core.ts\`, \`agentHandlersProjectFile.ts\`
- **Действие:** параметры \`path_a\`, \`path_b\`; оба внутри projectPath
- **Проверка:** unit-тест на два fixture-файла


**PLACEHOLDER · M · read_agent_log** — уровень 2
- **Цель:** tool \`read_agent_log\` — tail \`agent-*.ndjson\` (до UI LogViewerPanel)
- **Файлы:** \`agentLogger.ts\`, \`agentTools/integrations.ts\`, handler
- **Действие:** параметры \`lines?\` (default 100), \`event?\`; NDJSON → текст
- **Проверка:** unit-тест на fixture log file


**PLACEHOLDER · M · npm_install / add_package** — уровень 2
- **Цель:** безопасная установка зависимостей без произвольного \`run_command\`
- **Файлы:** \`agentTools/core.ts\`, \`agentHandlersProjectTerminal.ts\`, \`commandRunner.ts\`
- **Действие:** \`npm_install\` с \`package\`, \`dev?\`; блок \`&&\` и лишних флагов
- **Проверка:** unit-тест: опасная строка → отказ


**PLACEHOLDER · S · create_pr vs create_codeviper_pr** — уровень 2
- **Цель:** агент не путает PR проекта и PR исходников CodeViper
- **Файлы:** \`agentTools/integrations.ts\`, \`agentTools/mcp.ts\`, \`defaultSkills.ts\`
- **Действие:** descriptions: \`create_pr\` — проект; \`create_codeviper_pr\` — CodeViper
- **Проверка:** grep descriptions содержит «проект» и «CodeViper»

`

if (text.includes('ignore в grep_files / find_files')) {
  console.log('Пункты уже вставлены — только перенумерация при необходимости')
  process.exit(0)
}

text = text.replace(
  /(\*\*6 · M · git_checkout[\s\S]*?dirty tree → ошибка\n)\n\n(\*\*7 · M · Валидация)/,
  `$1\n${BLOCK_IGNORE}\n$2`
)

text = text.replace(
  /(\*\*14 · M · Вкл\/выкл MCP[\s\S]*?отключённый tool не в списке агента\n)\n\n(\n### 🟠 Уровень 2)/,
  `$1\n${BLOCK_ROADMAP_GH}\n$2`
)

text = text.replace(
  /(\*\*43 · M · Субагент Tester[\s\S]*?не вызывает write_file\n)\n\n(\*\*44 · M · E2E)/,
  `$1\n${BLOCK_LEVEL2}\n$2`
)

let n = 0
text = text.replace(/^\*\*(?:PLACEHOLDER|\d+) · /gm, () => `**${++n} · `)

const total = n
text = text.replace(/1…\d+/g, `1…${total}`)
text = text.replace(/1\.\.\.\d+/g, `1…${total}`)
text = text.replace(/(\*\*1…)\d+( по убыванию)/g, `$1${total}$2`)
text = text.replace(/(отсортированы по важности\*\* \(🔴→🟢\)\.)/, `$1 Новые инструменты агента — цепочки **7–8**, **17–21**, **50–54**.`)

fs.writeFileSync(roadmapPath, text, 'utf8')

const nums = (text.match(/^\*\*\d+ · /gm) || []).map((line) => parseInt(line.match(/\d+/)[0], 10))
const max = Math.max(...nums)
const missing = []
for (let i = 1; i <= max; i++) if (!nums.includes(i)) missing.push(i)
const dups = nums.filter((x, i, a) => a.indexOf(x) !== i)
console.log(
  'Пунктов:',
  nums.length,
  '| 1..' + max,
  missing.length ? '❌ пропуски:' + missing : dups.length ? '❌ дубли:' + dups : '✅ чисто'
)
