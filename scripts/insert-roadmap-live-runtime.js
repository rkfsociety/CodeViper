const fs = require('fs')
const path = require('path')

const ROADMAP = path.join(__dirname, '..', 'ROADMAP.md')
let text = fs.readFileSync(ROADMAP, 'utf8').replace(/\r\n/g, '\n')

const ADD = 8

// 1) Renumber existing items 142..1 -> 150..9
for (let n = 142; n >= 1; n--) {
  const re = new RegExp('\\*\\*' + n + ' · ', 'g')
  text = text.replace(re, '**' + (n + ADD) + ' · ')
}

const newChain = `### 🔗 Тонкая оболочка + live runtime с GitHub

> Установленный \`.exe\` — редко меняемая оболочка (окно, IPC, настройки). Логика агента и инструменты — из \`%APPDATA%\\\\CodeViper\\\\source\` (NSIS уже клонирует репо при установке). Мелкие фиксы на GitHub → pull + build + restart, без NSIS и без bump версии.

**1 · M · bundledSourceSync — пути и git pull** — уровень 1
- **Цель:** модуль знает \`%APPDATA%/CodeViper/source\`, делает \`git pull --ff-only\`, возвращает \`{ updated, localHead, error? }\`
- **Файлы:** \`app/electron/main/bundledSourceSync.ts\`, \`app/shared/constants.ts\` (константа пути)
- **Действие:** \`getBundledSourceRoot()\`, \`syncBundledSource()\`; лог в \`userData/logs\`; без pull если нет \`.git\`
- **Проверка:** unit-тест с mock git; при отсутствии клона — \`{ updated: false }\`

**2 · S · Настройка liveRuntimeFromGit** — уровень 1
- **Цель:** \`liveRuntimeFromGit\` в settings (default \`true\` для packaged); тумблер в BehaviorTab
- **Файлы:** \`app/electron/main/settings.ts\`, \`app/src/components/SettingsModal/BehaviorTab.tsx\`, \`app/src/types.ts\`
- **Действие:** Zod optional с default; UI «Обновлять runtime с GitHub»
- **Проверка:** настройка сохраняется; при \`false\` sync не вызывается

**3 · M · Startup sync для packaged** — уровень 1
- **Цель:** при \`app.isPackaged\` и \`liveRuntimeFromGit\` — \`syncBundledSource()\` при старте (не блокируя UI дольше 3 с)
- **Файлы:** \`app/electron/main/index.ts\`, \`bundledSourceSync.ts\`
- **Действие:** фоновый pull; при ошибке — лог, работа из asar
- **Проверка:** unit/smoke: packaged + mock → sync вызван

**4 · M · Сборка runtime в клоне** — уровень 1
- **Цель:** после pull с изменениями в \`app/\` — \`npm install\` при необходимости + \`npm run build\` в \`source/app\` через portable Node
- **Файлы:** \`app/electron/main/bundledSourceBuild.ts\`, \`codeviperSource.ts\`
- **Действие:** проверка stale \`out/main\`; \`runCodeViperCommand\` в корне клона; IPC прогресса опционально
- **Проверка:** integration: после изменения в клоне → build обновляет \`out/main/index.js\`

**5 · L · Загрузка agent runtime из клона** — уровень 1
- **Цель:** packaged-приложение выполняет tool handlers из \`.../source/app/out/main\`, не из asar
- **Файлы:** \`app/electron/main/runtimeBootstrap.ts\`, \`agentToolExecutor.ts\`, \`agent.ts\`, \`index.ts\`
- **Действие:** при валидном \`out/main\` клона — dynamic import модулей handlers; fallback на asar
- **Проверка:** правка handler в клоне + build → после restart новое поведение без переустановки \`.exe\`

**6 · M · Relaunch после обновления runtime** — уровень 1
- **Цель:** после pull+build — баннер «Перезапустить для применения»; relaunch с bootstrap из клона
- **Файлы:** \`app/electron/main/runtimeUpdate.ts\`, \`app/src/App.tsx\`, \`updateChecker.ts\`
- **Действие:** событие \`runtime-update-ready\`; кнопка как у release update
- **Проверка:** UI: баннер → перезапуск → runtime из клона активен

**7 · S · Документация live runtime** — уровень 1
- **Цель:** README и docs: установка vs live runtime; путь клона; нужен Git
- **Файлы:** \`README.md\`, \`docs/development.md\`
- **Действие:** раздел «Обновление без переустановки»
- **Проверка:** текст упоминает \`%APPDATA%/CodeViper/source\`

**8 · M · Тесты bundled source runtime** — уровень 1
- **Цель:** unit-тесты sync/build/path resolution для live runtime
- **Файлы:** \`app/tests/bundledSourceSync.test.ts\`, \`app/tests/runtimeBootstrap.test.ts\`
- **Действие:** mock git/fs; \`getRuntimeMainPath()\` предпочитает клон при валидном out/
- **Проверка:** \`npm test -- bundledSource runtimeBootstrap\`

`

const marker = '### 🔗 Ignore и верификация mutating tools'
if (!text.includes(marker)) {
  console.error('marker not found')
  process.exit(1)
}
if (text.includes('### 🔗 Тонкая оболочка + live runtime')) {
  console.error('chain already exists')
  process.exit(1)
}

text = text.replace(marker, newChain + '\n\n\n' + marker)

text = text.replace(/1…142/g, '1…150')
text = text.replace(
  '> Надёжность агента, безопасность, тесты ядра, git-инструменты, RAG/MCP. Внутри уровня — сверху вниз. **Цепочки** (строго по порядку): split-view **20–22**, onboarding **33–35**, редактор **57–58**, worktree **62–64**, LSP **86–88**, i18n **142–146**.',
  '> Надёжность агента, **live runtime с GitHub (1–8)**, безопасность, тесты ядра. **Цепочки** (строго по порядку): **live runtime 1–8**, ignore **9–10**, roadmap/github **11–15**, split-view **28–30**, onboarding **41–43**, редактор **65–66**, worktree **70–72**, LSP **94–96**, i18n **150–154**.'
)
text = text.replace(
  'Сначала надёжность и ядро, затем UX',
  'Сначала live runtime и надёжность, затем UX'
)
text = text.replace(
  'Пункты **104–146** — когда уровни 1–3 закрыты.',
  'Пункты **112–154** — когда уровни 1–3 закрыты.'
)

fs.writeFileSync(ROADMAP, text, 'utf8')

const nums = (text.match(/^\*\*\d+ · /gm) || []).map((n) => parseInt(n.match(/\d+/)[0], 10))
const max = Math.max(...nums)
const missing = []
for (let i = 1; i <= max; i++) if (!nums.includes(i)) missing.push(i)
const dups = nums.filter((n, i, a) => a.indexOf(n) !== i)
console.log('Пунктов:', nums.length, '| 1..' + max, missing.length ? '❌ пропуски:' + missing : dups.length ? '❌ дубли:' + [...new Set(dups)] : '✅ чисто')
