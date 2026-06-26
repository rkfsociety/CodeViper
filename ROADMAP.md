# Дорожная карта CodeViper

Планы развития и список выполненного. Назад в [README](README.md).

> **Принцип чтения:** сначала **Блок 0 (пункты 1–8)** — live runtime с GitHub; только после него — «📋 В планах» (9…150). Внутри цепочки — строгий порядок.

## 🚨 Блок 0 — Live runtime с GitHub (ПРИОРИТЕТ №1)

> **Сделать в первую очередь**, до остальных пунктов ROADMAP. Пока блок 0 не готов, установленный `.exe` выполняет логику агента из **asar** — каждый фикс инструментов тянет **полный релиз** или ручной `CodeViper.cmd`.

### Когда нужен полный релиз (NSIS, `vX.Y.Z`, переустановка)

| Ситуация | Действие |
|----------|----------|
| Первая установка на машине | `CodeViper-Setup-*.exe` |
| Смена Electron, NSIS, portable Node, подпись, иконка | bump `version` → CI → тег → установщик |
| Критичный баг **оболочки** (окно не открывается, IPC, трей) | релиз оболочки |
| Блок 0 ещё **не выполнен** | релиз даёт новый asar; мелкие фиксы агента всё равно в asar |

### Когда релиз **не** нужен (после завершения блока 0)

| Ситуация | Действие |
|----------|----------|
| Фикс `list_directory`, handlers, промптов, ROADMAP-логики | `git push` на `master` → у пользователя: pull в `%APPDATA%\CodeViper\source` → build → **перезапуск** `.exe` |
| Документация, skills, collective memory | push на GitHub; перезапуск или без него |
| Обычный коммит разработки | **без** bump `version` и **без** тега |

**Путь клона (уже создаётся установщиком):** `%APPDATA%\CodeViper\source` → `app/` — исходники и `out/main` после build.

**Промпт для самоулучшения блока 0:** `Выполни пункт N из ROADMAP.md — блок 0, live runtime.`

### 🔗 Цепочка: тонкая оболочка + runtime с GitHub

> `.exe` — редко меняемая оболочка. Инструменты и agent runtime — из клона. NSIS уже делает `git clone` / `git pull` при установке; задача блока 0 — заставить **работающий** `.exe` использовать этот клон.

**1 · M · bundledSourceSync — пути и git pull** — блок 0
- **Цель:** модуль знает `%APPDATA%/CodeViper/source`, делает `git pull --ff-only`, возвращает `{ updated, localHead, error? }`
- **Файлы:** `app/electron/main/bundledSourceSync.ts`, `app/shared/constants.ts` (константа пути)
- **Действие:** `getBundledSourceRoot()`, `syncBundledSource()`; лог в `userData/logs`; без pull если нет `.git`
- **Проверка:** unit-тест с mock git; при отсутствии клона — `{ updated: false }`

**2 · S · Настройка liveRuntimeFromGit** — блок 0
- **Цель:** `liveRuntimeFromGit` в settings (default `true` для packaged); тумблер в BehaviorTab
- **Файлы:** `app/electron/main/settings.ts`, `app/src/components/SettingsModal/BehaviorTab.tsx`, `app/src/types.ts`
- **Действие:** Zod optional с default; UI «Обновлять runtime с GitHub»
- **Проверка:** настройка сохраняется; при `false` sync не вызывается

**3 · M · Startup sync для packaged** — блок 0
- **Цель:** при `app.isPackaged` и `liveRuntimeFromGit` — `syncBundledSource()` при старте (не блокируя UI дольше 3 с)
- **Файлы:** `app/electron/main/index.ts`, `bundledSourceSync.ts`
- **Действие:** фоновый pull; при ошибке — лог, работа из asar
- **Проверка:** unit/smoke: packaged + mock → sync вызван

**4 · M · Сборка runtime в клоне** — блок 0
- **Цель:** после pull с изменениями в `app/` — `npm install` при необходимости + `npm run build` в `source/app` через portable Node
- **Файлы:** `app/electron/main/bundledSourceBuild.ts`, `codeviperSource.ts`
- **Действие:** проверка stale `out/main`; `runCodeViperCommand` в корне клона; IPC прогресса опционально
- **Проверка:** integration: после изменения в клоне → build обновляет `out/main/index.js`

**5 · L · Загрузка agent runtime из клона** — блок 0
- **Цель:** packaged-приложение выполняет tool handlers из `.../source/app/out/main`, не из asar
- **Файлы:** `app/electron/main/runtimeBootstrap.ts`, `agentToolExecutor.ts`, `agent.ts`, `index.ts`
- **Действие:** при валидном `out/main` клона — dynamic import модулей handlers; fallback на asar
- **Проверка:** правка handler в клоне + build → после restart новое поведение без переустановки `.exe`

**6 · M · Relaunch после обновления runtime** — блок 0
- **Цель:** после pull+build — баннер «Перезапустить для применения»; relaunch с bootstrap из клона
- **Файлы:** `app/electron/main/runtimeUpdate.ts`, `app/src/App.tsx`, `updateChecker.ts`
- **Действие:** событие `runtime-update-ready`; кнопка как у release update
- **Проверка:** UI: баннер → перезапуск → runtime из клона активен

**7 · S · Документация live runtime** — блок 0
- **Цель:** README и docs: установка vs live runtime; путь клона; нужен Git
- **Файлы:** `README.md`, `docs/development.md`
- **Действие:** раздел «Обновление без переустановки»
- **Проверка:** текст упоминает `%APPDATA%/CodeViper/source`

**8 · M · Тесты bundled source runtime** — блок 0
- **Цель:** unit-тесты sync/build/path resolution для live runtime
- **Файлы:** `app/tests/bundledSourceSync.test.ts`, `app/tests/runtimeBootstrap.test.ts`
- **Действие:** mock git/fs; `getRuntimeMainPath()` предпочитает клон при валидном out/
- **Проверка:** `npm test -- bundledSource runtimeBootstrap`

---

### Формат задач для самообучения агента

Каждый пункт следует **одному шаблону** — агент читает `ROADMAP.md` и строит `set_self_improvement_plan`.

**Шаблон пункта:**

```text
N · [S/M/L/XL] · Краткое название — блок 0 | уровень 9…150
- Цель: один измеримый результат
- Файлы: конкретные пути (app/electron/main/…, app/src/…)
- Действие: одна атомарная правка
- Проверка: npm run typecheck | npm test -- … | сценарий в UI
```

**Промпты:** блок 0 → `Выполни пункт N из ROADMAP.md — блок 0, live runtime.` · пункты 9+ → `Выполни пункт N из ROADMAP.md — самоулучшение CodeViper.`

**Правила:** блок **0 (1–8)** — первым; затем **9…150**; внутри цепочки — строго по порядку.

## 📋 В планах

> Пункты **9…150**. **Не начинать, пока блок 0 не в «✅ Сделано»** — иначе каждый фикс агента снова требует релиза.


### 🔴 Уровень 1 — критично (с пункта 9)

> **Цепочки:** ignore **9–10**, roadmap/github **11–15**, split-view **28–30**, onboarding **41–43**, редактор **65–66**, worktree **70–72**, LSP **94–96**, i18n **150–154**.









### 🔗 Ignore и верификация mutating tools



**9 · M · Валидация схемы tool при загрузке** — уровень 1
- **Цель:** невалидный плагин логируется и пропускается, не ломая остальные  
- **Файлы:** `app/electron/main/pluginLoader.ts`  
- **Действие:** Zod-схема `{ name, description, parameters }`; catch per plugin  
- **Проверка:** unit-тест: плагин без `name` → skip + остальные загружены







**10 · M · Инкрементальная индексация при изменении файлов** — уровень 1
- **Цель:** Qdrant-индекс обновляется при сохранении файла без полного reindex  
- **Файлы:** `vectorStore.ts`, `services.ts` watcher, `embeddingQueue.ts`  
- **Действие:** watcher → debounce → upsert/delete эмбеддингов изменённого файла  
- **Проверка:** правка файла → поиск находит новый контент без full reindex


### 🔗 ROADMAP и GitHub для агента

**11 · M · list_pull_requests** — уровень 1
- **Цель:** tool `list_pull_requests` — открытые PR (как `PrStatusPanel`)
- **Файлы:** `agentTools/integrations.ts`, `agentHandlersGitHub.ts`, `githubPr.ts`, `toolCalls.ts`
- **Действие:** handler вызывает `listPullRequests()`; схема без обязательных параметров
- **Проверка:** unit-тест mock; имя в `AGENT_TOOL_NAMES`


**12 · S · list_roadmap** — уровень 1
- **Цель:** tool `list_roadmap` — список пунктов «В планах» (num · title · chain)
- **Файлы:** `roadmapParser.ts`, `agentTools/mcp.ts`, `agentHandlersSelfImprovement.ts`
- **Действие:** обёртка над `listRoadmapItems()`; форматированный текст
- **Проверка:** unit-тест handler ≥1 пункт при наличии ROADMAP.md


**13 · S · read_roadmap_item** — уровень 1
- **Цель:** tool `read_roadmap_item` с `number` — цель/файлы/действие/проверка пункта N
- **Файлы:** `roadmapParser.ts`, handlers, `agentTools/mcp.ts`
- **Действие:** parse полного блока пункта N из ROADMAP.md
- **Проверка:** unit-тест: существующий пункт содержит поля шаблона


**14 · S · Описания search-инструментов** — уровень 1
- **Цель:** в description — когда `grep_files` vs `find_files` vs `search_in_file` vs `file_search_summary`
- **Файлы:** `agentTools/core.ts`, `defaultSkills.ts` (viper-files)
- **Действие:** обновить description; строка «когда использовать» в skill
- **Проверка:** unit-тест descriptions содержат ключевые слова


**15 · M · docs/tools-api актуализация** — уровень 1
- **Цель:** справочник совпадает с `agentTools/` и `AGENT_TOOL_NAMES`
- **Файлы:** `docs/tools-api.md`, `docs/README.md`
- **Действие:** путь источника; индекс tools; `check_github_auth`, git, roadmap
- **Проверка:** тест: каждое имя из `AGENT_TOOL_NAMES` упомянуто в md



### 🟠 Уровень 2 — высокая польза

> Ежедневный UX, превью файлов, onboarding, провайдеры, субагенты, E2E, ModelTab. Пункты **18–58** — выполнять сверху вниз; цепочки см. блок уровня 1.

**16 · S · Toast при ожидании подтверждения** — уровень 2
- **Цель:** системное уведомление, если агент ждёт `preview_edit`/danger-dialog, а окно не в фокусе  
- **Файлы:** `app/src/App.tsx`, `app/electron/main/tray.ts` или `webhookNotify.ts`  
- **Действие:** при `pendingApproval` + `!document.hasFocus()` → toast «Агент ждёт подтверждения»  
- **Проверка:** сценарий в UI: свернуть окно → агент вызывает preview → toast появляется


**17 · M · Расширение горячих клавиш** — уровень 2
- **Цель:** Escape — стоп агента; Ctrl+Shift+N — новый чат; Ctrl+B — фокус/переключение дерева файлов  
- **Файлы:** `app/src/App.tsx`, `app/src/components/KeyboardShortcutsModal.tsx`  
- **Действие:** обработчики `keydown` + строки в модалке `?`  
- **Проверка:** каждая комбинация работает в UI; модалка отображает новые шорткаты


**18 · M · Resizable split layout** — уровень 2
- **Цель:** основной layout с изменяемой шириной панели превью справа от чата  
- **Файлы:** `app/src/App.tsx`, `app/src/App.module.css` (или `styles.css`)  
- **Действие:** splitter между чатом и правой панелью; ширина в `localStorage`  
- **Проверка:** перетаскивание границы меняет ширину; после перезапуска ширина сохранена


**19 · M · FilePreviewPanel read-only** — уровень 2
- **Цель:** компонент просмотра файла с подсветкой синтаксиса (как в DiffPreviewModal)  
- **Файлы:** `app/src/components/FilePreviewPanel.tsx`, `shared/diffPreview.ts`  
- **Действие:** IPC `read-file` → highlight.js; заголовок с путём и кнопкой закрыть  
- **Проверка:** открытие `.ts` файла показывает подсветку


**20 · S · ProjectTree открывает превью** — уровень 2
- **Цель:** клик по файлу в `ProjectTreePanel` открывает его в `FilePreviewPanel`  
- **Файлы:** `app/src/components/ProjectTreePanel.tsx`, `app/src/App.tsx`  
- **Действие:** callback `onFileOpen(path)` → state `previewPath` в App  
- **Проверка:** клик в дереве → файл виден в split-панели


**21 · S · Копировать блок кода в MessageBody** — уровень 2
- **Цель:** кнопка «Копировать» на каждом `<pre><code>` в markdown-ответе  
- **Файлы:** `MessageBody.tsx`, `MessageBody.module.css`  
- **Действие:** `navigator.clipboard.writeText` по клику  
- **Проверка:** копирование блока кода из ответа агента


**22 · M · Повторить ответ ассистента** — уровень 2
- **Цель:** в меню `MessageRow` для `assistant` — «↺ Перегенерировать» (truncate history + resend)  
- **Файлы:** `MessageRow.tsx`, `ChatPanel/index.tsx`, `useMessageQueue.ts`  
- **Действие:** удалить assistant-сообщение и последний user turn → повторный прогон  
- **Проверка:** перегенерация даёт новый ответ


**23 · S · Поиск по истории чатов** — уровень 2
- **Цель:** поле фильтра в `ChatHistoryPanel` по заголовку и последнему сообщению  
- **Файлы:** `ChatHistoryPanel.tsx`  
- **Действие:** `searchQuery` state + `useMemo` фильтр `FlatItem`  
- **Проверка:** ввод текста сужает список чатов


**24 · S · Автосохранение черновика ввода** — уровень 2
- **Цель:** `input` поля чата в `localStorage` per `chatId` с debounce 500 мс  
- **Файлы:** `ChatPanel/index.tsx`  
- **Действие:** восстановление при переключении чата  
- **Проверка:** набрать текст → другой чат → вернуться — текст на месте


**25 · S · Сохранение светлой темы в settings** — уровень 2
- **Цель:** `lightMode` не сбрасывается после перезапуска (`App.tsx` сейчас только `useState`)  
- **Файлы:** `settings.ts`, `types.ts`, `App.tsx`  
- **Действие:** `uiLightMode: boolean` в Zod; загрузка при старте  
- **Проверка:** включить ☀️ → перезапуск → тема сохранена


**26 · M · Quick Open — палитра файлов Ctrl+P** — уровень 2
- **Цель:** fuzzy search по project tree → открыть превью  
- **Файлы:** `QuickOpenPalette.tsx`, `App.tsx`  
- **Действие:** модалка + IPC `get-project-tree`; Enter → `onFileOpen`  
- **Проверка:** Ctrl+P → ввод → Enter открывает файл


**27 · S · Ctrl+` — переключить терминал** — уровень 2
- **Цель:** быстро показать/скрыть `TerminalPanel` без мыши  
- **Файлы:** `App.tsx`, `KeyboardShortcutsModal.tsx`  
- **Действие:** toggle state `terminalVisible` по Ctrl+`  
- **Проверка:** терминал показывается/скрывается


**28 · M · Недавние проекты** — уровень 2
- **Цель:** список последних 10 `projectPath` в WelcomePanel и меню «Открыть»  
- **Файлы:** `settings.ts`, `WelcomePanel.tsx`, `App.tsx`  
- **Действие:** `recentProjects: string[]` при `selectProjectFolder`  
- **Проверка:** после открытия 2 проектов оба в списке


**29 · M · planBeforeExecute в настройках** — уровень 2
- **Цель:** тумблер «Сначала показать план» в BehaviorTab  
- **Файлы:** `settings.ts`, `BehaviorTab.tsx`, `types.ts`  
- **Действие:** `planBeforeExecute: boolean` в Zod-схеме с default `false`  
- **Проверка:** настройка сохраняется и загружается


**30 · M · Пауза после плана до подтверждения** — уровень 2
- **Цель:** при `planBeforeExecute` оркестратор показывает план и ждёт кнопку «Выполнить»  
- **Файлы:** `agent.ts`, `orchestratorModel.ts`, `ChatPanel/index.tsx`  
- **Действие:** emit `plan_awaiting_confirm`; UI-кнопка продолжает прогон  
- **Проверка:** с включённым тумблером агент не вызывает tools до «Выполнить»


**31 · M · Флаг firstRunCompleted** — уровень 2
- **Цель:** `firstRunCompleted: boolean` в settings; false при первой установке  
- **Файлы:** `settings.ts`, `types.ts`  
- **Действие:** поле в Zod с default `false`; true после завершения визарда  
- **Проверка:** чистый settings.json → `firstRunCompleted === false`


**32 · M · OnboardingWizard** — уровень 2
- **Цель:** модалка: выбор провайдера → модель → открыть проект  
- **Файлы:** `app/src/components/OnboardingWizard.tsx`, `App.tsx`  
- **Действие:** 3 шага; показ при `!firstRunCompleted`; «Пропустить» → true  
- **Проверка:** первый запуск показывает визард; повторный — нет


**33 · S · Ссылка на example-prompts в визарде** — уровень 2
- **Цель:** финальный шаг визарда — кнопка «Примеры запросов» → `docs/example-prompts.md`  
- **Файлы:** `OnboardingWizard.tsx`  
- **Действие:** `shell.openExternal` или открытие вики/GitHub  
- **Проверка:** клик открывает страницу с примерами


**34 · M · OpenAI-compatible произвольный endpoint** — уровень 2
- **Цель:** провайдер `custom` — `baseUrl` + `apiKey` + model id (LM Studio, vLLM)  
- **Файлы:** `openaiProvider.ts`, `modelRuntime.ts`, `ModelTab/providers/`  
- **Действие:** переиспользовать OpenAI client с custom baseURL  
- **Проверка:** ping к mock server


**35 · M · Цепочка fallback моделей** — уровень 2
- **Цель:** `fallbackModels: string[]` — при ошибке провайдера пробовать следующую  
- **Файлы:** `agentContextManager.ts`, `settings.ts`, `BehaviorTab.tsx`  
- **Действие:** loop в `AgentRunner` при 429/5xx  
- **Проверка:** mock: primary fail → secondary ok


**36 · S · Чип прогресса индексации** — уровень 2
- **Цель:** «Индекс 42%» в `AgentStatusBar` при `index_project`  
- **Файлы:** `AgentStatusBar.tsx`, stream event `index_progress`  
- **Действие:** подписка на `index_progress` → обновление чипа  
- **Проверка:** чип виден во время индексации


**37 · S · Ручная переиндексация** — уровень 2
- **Цель:** кнопка в `ProjectTreePanel` ПКМ → «Переиндексировать»  
- **Файлы:** `ProjectTreePanel.tsx`, IPC вызов `index_project`  
- **Действие:** пункт меню → `index_project` для текущего `projectPath`  
- **Проверка:** индексация запускается


**38 · M · Аудит focus trap в модалках** — уровень 2
- **Цель:** все `role="dialog"` используют `useModalA11y` + Tab cycle  
- **Файлы:** модалки без хука (`MetricsPanel`, `TracePanel`, …)  
- **Действие:** подключить `useModalA11y`; initial focus на первый интерактивный элемент  
- **Проверка:** Tab не уходит за пределы открытой модалки


**39 · S · aria-live для статуса агента** — уровень 2
- **Цель:** screen reader объявляет «Агент работает» / «Готово»  
- **Файлы:** `AgentStatusBar.tsx`  
- **Действие:** `aria-live="polite"` region с текстом фазы  
- **Проверка:** accessibility inspector показывает live region


**40 · M · Просмотр NDJSON-логов агента** — уровень 2
- **Цель:** вкладка или панель «Логи» — tail `agent-*.ndjson`  
- **Файлы:** `agentLogger.ts`, `LogViewerPanel.tsx`, IPC `read-agent-logs`  
- **Действие:** фильтр по event type; последние 500 строк  
- **Проверка:** после прогона логи видны в UI


**41 · S · Подтверждение внешних ссылок** — уровень 2
- **Цель:** клик по `http(s)` в MessageBody → ConfirmDialog перед `openExternal`  
- **Файлы:** `MessageBody.tsx`, `App.tsx`  
- **Действие:** перехват click на `<a>`  
- **Проверка:** без подтверждения браузер не открывается


**42 · M · Клик по пути в code block → открыть файл** — уровень 2
- **Цель:** `src/foo.ts:12` в коде → открыть в превью (п. 21–23)  
- **Файлы:** `MessageBody.tsx`, `App.tsx`  
- **Действие:** regex path:line; IPC read + preview  
- **Проверка:** клик открывает файл на строке


**43 · M · Субагент Reviewer** — уровень 2
- **Цель:** `delegate_to_reviewer` — read-only обзор diff без правок  
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`, `agent.ts`  
- **Проверка:** unit-тест контракта; чип «Ревью…»


**44 · M · Субагент Tester** — уровень 2
- **Цель:** `delegate_to_tester` — только `run_tests` / `run_command` test  
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`  
- **Проверка:** не вызывает write_file


### 🔗 Дополнительные инструменты агента

**45 · M · git_blame и git_show** — уровень 2
- **Цель:** read-only `git_blame` (path, line?) и `git_show` (commit, path?)
- **Файлы:** `gitTools.ts`, `agentTools/core.ts`, `agentHandlersProject.ts`
- **Действие:** лимит строк вывода; только внутри projectPath
- **Проверка:** unit-тест temp git repo


**46 · M · diff_files** — уровень 2
- **Цель:** unified diff двух файлов проекта без git
- **Файлы:** `diffUtil.ts`, `agentTools/core.ts`, `agentHandlersProjectFile.ts`
- **Действие:** параметры `path_a`, `path_b`; оба внутри projectPath
- **Проверка:** unit-тест на два fixture-файла


**47 · M · read_agent_log** — уровень 2
- **Цель:** tool `read_agent_log` — tail `agent-*.ndjson` (до UI LogViewerPanel)
- **Файлы:** `agentLogger.ts`, `agentTools/integrations.ts`, handler
- **Действие:** параметры `lines?` (default 100), `event?`; NDJSON → текст
- **Проверка:** unit-тест на fixture log file


**48 · M · npm_install / add_package** — уровень 2
- **Цель:** безопасная установка зависимостей без произвольного `run_command`
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`, `commandRunner.ts`
- **Действие:** `npm_install` с `package`, `dev?`; блок `&&` и лишних флагов
- **Проверка:** unit-тест: опасная строка → отказ


**49 · S · create_pr vs create_codeviper_pr** — уровень 2
- **Цель:** агент не путает PR проекта и PR исходников CodeViper
- **Файлы:** `agentTools/integrations.ts`, `agentTools/mcp.ts`, `defaultSkills.ts`
- **Действие:** descriptions: `create_pr` — проект; `create_codeviper_pr` — CodeViper
- **Проверка:** grep descriptions содержит «проект» и «CodeViper»


**50 · M · E2E: smoke настройки и отправка** — уровень 2
- **Цель:** Playwright-тест: открыть настройки → закрыть → ввести промпт (mock LLM)  
- **Файлы:** `app/e2e/smoke.spec.ts`  
- **Действие:** `CODEVIPER_E2E=1`; stub agent-stream или пустой ответ  
- **Проверка:** `npm run test:e2e` — новый тест зелёный в CI


**51 · M · Component test MessageRow** — уровень 2
- **Цель:** vitest + @testing-library/react для pin/retry menu  
- **Файлы:** `tests/MessageRow.test.tsx`, vitest config jsdom  
- **Проверка:** `npm test -- MessageRow`


**52 · M · E2E: навигация по вкладкам настроек** — уровень 2
- **Файлы:** `e2e/settings.test.ts`  
- **Проверка:** `npm run test:e2e`


**53 · S · docs/troubleshooting.md** — уровень 2
- **Цель:** GPUCache, чёрный экран, plugins, portable Node  
- **Файлы:** `docs/troubleshooting.md`, ссылка в README  
- **Проверка:** README ссылается на troubleshooting


**54 · S · README: Linux и macOS в быстром старте** — уровень 2
- **Цель:** бейджи платформ, ссылки на AppImage/DMG и `CodeViper.sh` из релизов  
- **Файлы:** `README.md`  
- **Действие:** дополнить «Быстрый старт» установкой не только через Windows-установщик  
- **Проверка:** README содержит AppImage, dmg и POSIX-лаунчер


**55 · M · ModelTab: формы провайдеров** — уровень 2
- **Цель:** вынести JSX-блоки `provider === '…'` в `ModelTab/providers/*.tsx`  
- **Файлы:** `SettingsModal/ModelTab.tsx` → `SettingsModal/ModelTab/providers/` (Ollama, DeepSeek, Gemini, …)  
- **Действие:** каждый провайдер — отдельный компонент с props `{ settings, onSettingsChange }`; ModelTab — switch по `modelProvider`  
- **Проверка:** `npm run typecheck`; смена провайдера в настройках работает как раньше


**56 · M · ModelTab: оркестратор, бенчмарк, канал обновлений** — уровень 2
- **Цель:** вынести нижнюю часть ModelTab (~300 строк) в отдельные секции  
- **Файлы:** `OrchestratorSection.tsx`, `BenchmarkSection.tsx`, `UpdateChannelSection.tsx` в `SettingsModal/ModelTab/`  
- **Действие:** перенести GGUF-download, benchmark, orchestrator toggle, beta-channel без изменения логики  
- **Проверка:** бенчмарк и скачивание GGUF работают; `ModelTab.tsx` < 400 строк


**57 · M · Экспорт чата в Markdown** — уровень 2
- **Цель:** кнопка в меню чата → `.md` с ролями и код-блоками  
- **Файлы:** `ChatHistoryPanel.tsx`, `chats.ts`, `registerChatsIpc.ts`  
- **Действие:** `export-chat-markdown` IPC + save dialog  
- **Проверка:** файл читается в любом MD-viewer


**58 · M · IPC export-chat** — уровень 2
- **Цель:** экспорт сообщений и метаданных чата в JSON  
- **Файлы:** `chats.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** `export-chat` → `{ messages, settings, projectPath }`; save dialog  
- **Проверка:** экспорт → файл валидный JSON с messages


**59 · M · IPC import-chat** — уровень 2
- **Цель:** импорт чата из JSON в новый чат в store  
- **Файлы:** `chats.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** open dialog → parse → `createChat` с messages  
- **Проверка:** импортированный чат отображает историю


**60 · M · CodeEditorPanel на CodeMirror** — уровень 2
- **Цель:** редактируемая вкладка файла вместо read-only `FilePreviewPanel` (п. 22)  
- **Файлы:** `app/src/components/CodeEditorPanel.tsx`, `app/package.json`  
- **Действие:** зависимость `@codemirror/*`; обёртка с темой под тёмный UI  
- **Проверка:** файл открывается в редакторе; курсор и правка работают


**61 · M · Сохранение из редактора** — уровень 2
- **Цель:** Ctrl+S / кнопка «Сохранить» пишет файл через существующий IPC  
- **Файлы:** `CodeEditorPanel.tsx`, `app/electron/main/ipc/registerFileIpc.ts`  
- **Действие:** `window.codeviper.writeFile(path, content)`; индикатор «несохранено»  
- **Проверка:** правка + сохранение → содержимое на диске изменилось


### 🟡 Уровень 3 — средняя польза

> Символы, worktree, рефакторинг IPC/services, интеграции, LSP, автоматизации, P2P. Пункты **59–103**.

**62 · M · find_symbol для Go** — уровень 3
- **Цель:** `find_symbol` / `find_references` для `.go` через `go/ast` или tree-sitter  
- **Файлы:** `app/electron/main/symbolIndex.ts`, `agentHandlersProjectSearch.ts`  
- **Действие:** парсер Go → символы с `path:line:col`  
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.go` файлом


**63 · M · find_symbol для Rust** — уровень 3
- **Цель:** символы для `.rs` (tree-sitter-rust или синтаксический обход)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** расширить `walkProjectForSymbols` для `.rs`  
- **Проверка:** unit-тест: `fn main` и `struct Foo` находятся по имени


**64 · M · find_symbol для Java** — уровень 3
- **Цель:** символы для `.java` (class/method)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** regex или tree-sitter-java для объявлений top-level  
- **Проверка:** unit-тест на простом `.java` с `public class Bar`


**65 · M · gitWorktree.ts** — уровень 3
- **Цель:** create / remove / list worktrees через `git worktree`  
- **Файлы:** `app/electron/main/gitWorktree.ts` (новый), `gitTools.ts`  
- **Действие:** `createWorktree(repoPath, branch)` → путь worktree; `removeWorktree`  
- **Проверка:** unit-тест с temp git repo; `git worktree list` содержит запись


**66 · M · worktreePath в чате + IPC** — уровень 3
- **Цель:** поле `worktreePath?` в persisted chat; IPC `create-chat-worktree`  
- **Файлы:** `chats.ts`, `types.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** кнопка «Изолировать в worktree» в меню чата  
- **Проверка:** новый чат получает отдельную папку worktree


**67 · M · AgentRunner — корень worktree** — уровень 3
- **Цель:** если у чата есть `worktreePath`, агент работает в нём, а не в `projectPath`  
- **Файлы:** `agent.ts`, `registerAgentIpc.ts`, `agentHandlersProjectContext.ts`  
- **Действие:** `resolveProjectRoot(chat)` → `worktreePath ?? projectPath`  
- **Проверка:** правка файла в изолированном чате не затрагивает основную копию


**68 · M · ipcContracts: Zod-схемы данных** — уровень 3
- **Цель:** схемы `ChatMessage`, `AgentSettings`, `SavedChat` и др. — в `shared/ipc/schemas.ts`  
- **Файлы:** `shared/ipcContracts.ts` → `shared/ipc/schemas.ts`  
- **Действие:** re-export из `ipcContracts.ts` для обратной совместимости импортов  
- **Проверка:** `npm run typecheck`; импорты `ChatMessageSchema` не сломаны


**69 · M · ipcContracts: IPC enum и Contracts** — уровень 3
- **Цель:** объект `IPC` и `Contracts` — в `shared/ipc/channels.ts`  
- **Файлы:** `shared/ipcContracts.ts` → `shared/ipc/channels.ts`  
- **Действие:** `ipcContracts.ts` — barrel re-export; `parseIpcArgs` остаётся рядом с Contracts  
- **Проверка:** `npm run typecheck`; preload и register*Ipc компилируются


**70 · M · services.ts: файловые операции** — уровень 3
- **Цель:** `safeRead*`, `safeWrite*`, `buildFileTree`, кэши — в `fileServices.ts`  
- **Файлы:** `services.ts` → `fileServices.ts`  
- **Действие:** `services.ts` re-export для handler-импортов  
- **Проверка:** `npm test -- services` зелёный


**71 · M · services.ts: runCommand** — уровень 3
- **Цель:** `validateCommand`, `normalizeCommand`, `runCommand`, лимит буфера — в `commandRunner.ts`  
- **Файлы:** `services.ts` → `commandRunner.ts`  
- **Действие:** handlers импортируют из `commandRunner.ts` или barrel `services.ts`  
- **Проверка:** `npm test -- services.test` — validateCommand и buffer limit


**72 · S · Поиск в MemoryPanel** — уровень 3
- **Файлы:** `MemoryPanel.tsx`  
- **Действие:** filter по тексту и category  
- **Проверка:** поиск сужает список


**73 · M · Импорт skill из файла** — уровень 3
- **Цель:** кнопка «Импорт .md» → copy в skills dir  
- **Файлы:** `SkillsPanel.tsx`, IPC `import-skill-file`  
- **Проверка:** skill появляется в списке


**74 · S · Шаблоны MCP-серверов** — уровень 3
- **Цель:** кнопки «+ filesystem», «+ fetch» с готовым JSON конфигом  
- **Файлы:** `IntegrationsTab.tsx`, `docs/integrations.md`  
- **Проверка:** шаблон добавляет запись в settings


**75 · S · Slash /lint** — уровень 3
- **Файлы:** `shared/slashCommands.ts`  
- **Действие:** expand → `npm run lint` + исправить  
- **Проверка:** `/lint` в меню slash


**76 · S · Slash /build** — уровень 3
- **Файлы:** `shared/slashCommands.ts`  
- **Действие:** expand → `npm run build` + исправить ошибки  
- **Проверка:** `/build` в автодополнении


**77 · S · Slash /security** — уровень 3
- **Файлы:** `shared/slashCommands.ts`  
- **Действие:** expand → review на секреты, injection, unsafe commands  
- **Проверка:** `/security` в списке


**78 · S · Ctrl+Shift+T — экспорт трейса** — уровень 3
- **Файлы:** `App.tsx`, `TracePanel.tsx`  
- **Действие:** если trace open → export; иначе открыть TracePanel  
- **Проверка:** shortcut в модалке `?`


**79 · S · Кнопка «Очистить» в терминале** — уровень 3
- **Файлы:** `TerminalPanel.tsx`  
- **Проверка:** output сбрасывается


**80 · S · Очередь: удалить элемент** — уровень 3
- **Цель:** кнопка ✕ у каждого сообщения в очереди (`AgentStatusBar` / queue UI)  
- **Файлы:** `AgentStatusBar.tsx`, `QueueContext.tsx`  
- **Действие:** `removeFromQueue(index)` IPC или context  
- **Проверка:** элемент исчезает, остальные выполняются


**81 · S · Skip link «К содержимому»** — уровень 3
- **Цель:** скрытая ссылка в начале `App.tsx` → `#main-chat`  
- **Файлы:** `App.tsx`, `styles.css`  
- **Действие:** `:focus` показывает ссылку  
- **Проверка:** Tab с первого элемента → skip → фокус в чате


**82 · S · Экспорт метрик в CSV** — уровень 3
- **Цель:** кнопка в `MetricsPanel` → CSV byModel + topTools  
- **Файлы:** `MetricsPanel.tsx`  
- **Действие:** blob download  
- **Проверка:** CSV открывается в Excel


**83 · S · Документация plugin-authoring** — уровень 3
- **Цель:** гайд автора плагина: схема tool, пример `.js`, hot-reload  
- **Файлы:** `docs/plugin-authoring.md`, ссылка в `README.md`  
- **Действие:** минимальный working example + ограничения (только `.js`)  
- **Проверка:** файл существует; README ссылается на него


**84 · M · Провайдер Mistral** — уровень 3
- **Цель:** `modelProvider: 'mistral'` через Mistral API  
- **Файлы:** `mistralProvider.ts`, `modelRuntime.ts`, `constants.ts`  
- **Действие:** `StreamingChatProvider` + список моделей  
- **Проверка:** unit-тест stream parser


**85 · M · Bitbucket: create_pull_request** — уровень 3
- **Цель:** tool `create_bitbucket_pr` через REST API 2.0  
- **Файлы:** `bitbucketTools.ts`, `agentTools/integrations.ts`, `IntegrationsTab.tsx`  
- **Действие:** token + workspace/repo в settings  
- **Проверка:** unit-тест с mock fetch


**86 · M · Azure DevOps: create_work_item** — уровень 3
- **Цель:** tool `create_ado_work_item` (PAT + org/project)  
- **Файлы:** `adoTools.ts`, `integrations.ts`, settings  
- **Действие:** WIQL/create work item REST  
- **Проверка:** mock API test


**87 · S · Discord webhook** — уровень 3
- **Цель:** `discordWebhookUrl` — уведомление «агент готов» в Discord  
- **Файлы:** `webhookNotify.ts`, `IntegrationsTab.tsx`, `settings.ts`  
- **Действие:** POST embed JSON  
- **Проверка:** unit-тест payload


**88 · S · Telegram Bot уведомления** — уровень 3
- **Цель:** `telegramBotToken` + `telegramChatId` в настройках  
- **Файлы:** `webhookNotify.ts`, `IntegrationsTab.tsx`  
- **Действие:** `sendMessage` API  
- **Проверка:** mock fetch test


**89 · M · lspClient — spawn language server** — уровень 3
- **Цель:** main-процесс запускает `typescript-language-server` / `pyright-langserver` по расширению файла  
- **Файлы:** `app/electron/main/lspClient.ts` (новый)  
- **Действие:** JSON-RPC over stdio; `didOpen`/`didChange`/`shutdown`  
- **Проверка:** unit-тест с mock child_process; лог «LSP ready» для `.ts`


**90 · M · LSP hover и go-to-definition (TS/JS)** — уровень 3
- **Цель:** hover tooltip и Ctrl+click → переход к определению в `CodeEditorPanel` (п. 58)  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** IPC `lsp-request` → `textDocument/hover`, `textDocument/definition`  
- **Проверка:** Ctrl+click на символ → курсор на определении в том же файле


**91 · M · LSP pyright для Python** — уровень 3
- **Цель:** те же hover/definition для `.py` через pyright-langserver  
- **Файлы:** `lspClient.ts`  
- **Действие:** ветка выбора сервера по `languageFromPath`; инициализация pyright  
- **Проверка:** Ctrl+click на `def foo` в `.py` → переход к определению


**92 · M · Fetch remote skill manifest** — уровень 3
- **Цель:** список навыков с GitHub raw URL или индекс-файла  
- **Файлы:** `app/electron/main/skills.ts`, `registerMiscIpc.ts`  
- **Действие:** `list-remote-skills(url)` → `{ name, description, url }[]`  
- **Проверка:** unit-тест с mock fetch на тестовый manifest.json


**93 · M · import-remote-skill UI** — уровень 3
- **Цель:** кнопка «Импорт из каталога» в SkillsPanel  
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`  
- **Действие:** выбор из списка → download SKILL.md → локальный skill  
- **Проверка:** импорт skill из URL появляется в списке навыков


**94 · M · AutomationRule в settings** — уровень 3
- **Цель:** тип `{ id, cron, prompt, enabled }` + Zod-массив в настройках  
- **Файлы:** `settings.ts`, `types.ts`  
- **Действие:** `automations: AutomationRule[]` с default `[]`  
- **Проверка:** `npm run typecheck`; сохранение массива в settings.json


**95 · M · automationScheduler в main** — уровень 3
- **Цель:** таймер проверяет cron-выражения и ставит промпт в очередь чата  
- **Файлы:** `app/electron/main/automationScheduler.ts`, `index.ts`  
- **Действие:** `node-cron` или setInterval + parse; emit в default chat  
- **Проверка:** unit-тест: rule `* * * * *` + mock time → enqueue вызван


**96 · M · AutomationsTab в настройках** — уровень 3
- **Цель:** CRUD автоматизаций: cron, промпт, вкл/выкл  
- **Файлы:** `SettingsModal/AutomationsTab.tsx`, `SettingsModal/index.tsx`  
- **Действие:** форма добавления; список с удалением  
- **Проверка:** созданная автоматизация сохраняется и видна после reopen settings


**97 · M · Дублировать промпт во второй чат** — уровень 3
- **Цель:** кнопка «Сравнить с другой моделью» копирует промпт в новый чат  
- **Файлы:** `ChatPanel/index.tsx`, `ChatHistoryPanel.tsx`  
- **Действие:** `createChat` + тот же `input` + подсказка выбрать модель  
- **Проверка:** два чата с одинаковым первым сообщением пользователя


**98 · M · SplitChatView** — уровень 3
- **Цель:** два чата side-by-side для сравнения ответов  
- **Файлы:** `app/src/App.tsx`, `SplitChatView.tsx`  
- **Действие:** режим «Сравнение» — два `ChatPanel` с общим projectPath  
- **Проверка:** оба чата видны одновременно; отправка в каждый независима


**99 · M · docker-compose для server/p2p** — уровень 3
- **Цель:** one-click деплой сигнального сервера + Redis  
- **Файлы:** `server/p2p/docker-compose.yml`, `server/p2p/README.md`, `docs/integrations.md`  
- **Действие:** сервисы `p2p` + `redis`; env-шаблон `.env.example`  
- **Проверка:** `docker compose up` → `GET /health` → 200


**100 · M · Dashboard статуса узлов** — уровень 3
- **Цель:** `GET /admin/dashboard` — онлайн-узлы, задачи, кредиты (auth)  
- **Файлы:** `server/p2p/src/routes/admin.ts`  
- **Действие:** JSON `{ nodes, activeTasks, totalCredits }`  
- **Проверка:** интеграционный тест с mock-узлами


**101 · M · Рейтинг узлов по latency** — уровень 3
- **Цель:** `router.ts` предпочитает узлы с меньшим средним RTT  
- **Файлы:** `server/p2p/src/router.ts`, `server/p2p/src/credits.ts`  
- **Действие:** хранить `avgLatencyMs` per node; сортировка при route  
- **Проверка:** unit-тест: два узла → выбирается с меньшей latency


**102 · M · Reconnect с backoff** — уровень 3
- **Файлы:** `p2pClient.ts`  
- **Действие:** exponential delay 1s→30s при обрыве WSS  
- **Проверка:** unit-тест reconnect attempts


**103 · S · Чип P2P offline** — уровень 3
- **Файлы:** `AgentStatusBar.tsx`, `p2pClient.ts`  
- **Действие:** «P2P offline» при disconnect  
- **Проверка:** виден при остановленном сервере


**104 · M · История P2P-задач** — уровень 3
- **Файлы:** `P2pHistoryPanel.tsx`, local NDJSON или settings  
- **Проверка:** последние 20 relay в UI


**105 · S · Масштаб шрифта UI** — уровень 3
- **Цель:** `uiFontScale: 0.9 | 1 | 1.1 | 1.25` в настройках → `document.documentElement.style.fontSize`  
- **Файлы:** `PerformanceTab.tsx`, `settings.ts`, `App.tsx`  
- **Действие:** select в PerformanceTab; применение при загрузке  
- **Проверка:** 1.25 — текст чата крупнее


**106 · S · Избранные чаты** — уровень 3
- **Цель:** звезда ⭐ на чате → секция «Избранное» вверху истории  
- **Файлы:** `SavedChat` + `chats.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** `starred?: boolean`; сортировка starred first  
- **Проверка:** избранный чат остаётся наверху


### 🟢 Уровень 4 — низкий приоритет

> Голос, рефакторинг монолитов, i18n, Docker, polish. Пункты **112–154** — когда уровни 1–3 закрыты.

**107 · M · STT — кнопка микрофона** — уровень 4
- **Цель:** диктовка в поле ввода через Web Speech API (`SpeechRecognition`)  
- **Файлы:** `app/src/components/ChatPanel/ChatInput.tsx`  
- **Действие:** кнопка 🎤 → `recognition.start()` → текст в `onInputChange`  
- **Проверка:** диктовка вставляет распознанный текст в поле


**108 · M · TTS — кнопка «Озвучить»** — уровень 4
- **Цель:** озвучка последнего ответа ассистента через `speechSynthesis`  
- **Файлы:** `app/src/components/MessageBody.tsx` (или `MessageRow.tsx`)  
- **Действие:** кнопка «🔊» на сообщении assistant → `SpeechSynthesisUtterance`  
- **Проверка:** нажатие воспроизводит текст ответа


**109 · M · Разбивка App.tsx** — уровень 4
- **Цель:** вынести layout и модалки из ~1000-строчного `App.tsx`  
- **Файлы:** `app/src/App.tsx` → `AppLayout.tsx`, `useAppModals.ts`  
- **Действие:** перенести JSX layout + state модалок без изменения поведения  
- **Проверка:** `npm run typecheck`; E2E или ручной smoke UI


**110 · M · Разбивка agent.ts** — уровень 4
- **Цель:** отделить цикл ReAct от dispatch инструментов  
- **Файлы:** `agent.ts` → `agentLoop.ts`, `agentStreamHandler.ts`  
- **Действие:** `AgentRunner.run()` делегирует в `runAgentLoop()`  
- **Проверка:** `npm run typecheck`; существующие agent-тесты зелёные


**111 · M · Хук useChatPanelState** — уровень 4
- **Цель:** сократить `ChatPanel/index.tsx` — state и refs в отдельный хук  
- **Файлы:** `app/src/components/ChatPanel/index.tsx`, `useChatPanelState.ts`  
- **Действие:** перенести useState/useRef блоки в хук; index — только композиция  
- **Проверка:** `npm run typecheck`; отправка сообщения в UI работает


**112 · M · ChatPanel: вынести MessagesPane state** — уровень 4
- **Цель:** `ChatPanelMessagesPane` + хук `useChatMessagesPane` из `index.tsx`  
- **Файлы:** `ChatPanel/index.tsx` (~980 строк)  
- **Проверка:** `index.tsx` < 600 строк


**113 · M · ChatHistoryPanel: виртуализированный список** — уровень 4
- **Цель:** JSX рендера `FlatItem` и virtualizer — в `ChatHistoryList.tsx`  
- **Файлы:** `ChatHistoryPanel.tsx` → `ChatHistoryList.tsx`  
- **Действие:** props: `items`, `activeChatId`, `onSelect`; панель — композиция + toolbar  
- **Проверка:** скролл длинной истории чатов без регрессий


**114 · M · ChatHistoryPanel: DnD и диалоги** — уровень 4
- **Цель:** drag-and-drop, Prompt/Confirm state — в `useChatHistoryDnD.ts`  
- **Файлы:** `ChatHistoryPanel.tsx`, `useChatHistoryDnD.ts`  
- **Действие:** хук возвращает handlers и dialog state; панель < 400 строк  
- **Проверка:** перетаскивание чата в папку работает


**115 · M · types.ts: доменные модули** — уровень 4
- **Цель:** разнести ~720 строк на `types/chat.ts`, `types/settings.ts`, `types/memory.ts`, `types/api.ts`  
- **Файлы:** `app/src/types/` (новая папка), `types.ts` — re-export  
- **Действие:** `CodeViperAPI` в `api.ts`; `AgentSettings` в `settings.ts`  
- **Проверка:** `npm run typecheck`; нет циклических импортов


**116 · M · agentContext: RAG-hints** — уровень 4
- **Цель:** grep-nudge и `maybeAppendRagSearchHintAfterEmptyGrep` — в `agentContextRag.ts`  
- **Файлы:** `agentContext.ts` → `agentContextRag.ts`  
- **Действие:** re-export из `agentContext.ts`  
- **Проверка:** `npm test` — существующие тесты RAG-hint зелёные


**117 · M · agentContext: preview и prepare** — уровень 4
- **Цель:** `buildAgentContextPreview`, `prepareAgentRunContext`, `summarizeChatHistory` — в `agentContextBuild.ts`  
- **Файлы:** `agentContext.ts` → `agentContextBuild.ts`  
- **Действие:** `agentContext.ts` < 150 строк, только re-export и `OllamaMessage`  
- **Проверка:** `npm run typecheck`; превью контекста в UI открывается


**118 · M · useAgentStream: обработчики событий** — уровень 4
- **Цель:** switch по `AgentStreamEvent.type` — в `agentStreamHandlers.ts`  
- **Файлы:** `useAgentStream.ts` → `agentStreamHandlers.ts`  
- **Действие:** чистые функции `(event, ctx) => partialState`; хук — подписка и setState  
- **Проверка:** `npm run typecheck`; стрим агента в UI без регрессий


**119 · M · preload: группы API** — уровень 4
- **Цель:** `codeviper` object разбить на `preload/agentApi.ts`, `preload/chatApi.ts`, `preload/fileApi.ts`  
- **Файлы:** `electron/preload/index.ts`, `electron/preload/*.ts`  
- **Действие:** `Object.assign` или spread в `contextBridge.exposeInMainWorld`  
- **Проверка:** `npm run typecheck`; `window.codeviper.*` доступен в renderer


**120 · M · agentTools/core: files / git / package** — уровень 4
- **Цель:** `FILE_TOOLS`, `GIT_TOOLS`, `PACKAGE_TOOLS` — в отдельные файлы (~200 строк каждый)  
- **Файлы:** `agentTools/core.ts` → `coreFiles.ts`, `coreGit.ts`, `corePackage.ts`; `core.ts` — сборка  
- **Действие:** `getAgentTools()` без изменений снаружи  
- **Проверка:** `npm run typecheck`; список инструментов агента тот же


**121 · M · BehaviorTab: автоматизация и git** — уровень 4
- **Цель:** вынести секции автокоммита и git-sync в `BehaviorAutomationSection.tsx`  
- **Файлы:** `BehaviorTab.tsx` (~580 строк)  
- **Проверка:** `BehaviorTab.tsx` < 350 строк


**122 · M · BehaviorTab: инструменты и промпты** — уровень 4
- **Цель:** `disabledTools`, `promptTemplates`, permissions — в `BehaviorToolsSection.tsx`  
- **Файлы:** `BehaviorTab.tsx`  
- **Проверка:** typecheck; настройки сохраняются


**123 · M · IntegrationsTab: MCP секция** — уровень 4
- **Файлы:** `IntegrationsTab.tsx` → `McpIntegrationsSection.tsx`  
- **Проверка:** MCP CRUD в UI работает


**124 · M · IntegrationsTab: P2P и webhooks** — уровень 4
- **Файлы:** `IntegrationsTab.tsx` → `P2pIntegrationsSection.tsx`, `WebhookSection.tsx`  
- **Проверка:** тумблер P2P и webhook URL сохраняются


**125 · M · vectorStore: Qdrant / Milvus** — уровень 4
- **Файлы:** `vectorStore.ts` → `qdrantStore.ts`, `milvusStore.ts`  
- **Проверка:** `search_knowledge_base` без регрессий


**126 · M · memory.ts: локальная vs контекстная сборка** — уровень 4
- **Файлы:** `memory.ts` → `memoryStore.ts`, `memoryContext.ts`  
- **Проверка:** `npm test -- memory`


**127 · M · collectiveMemorySync: pull / push** — уровень 4
- **Файлы:** `collectiveMemorySync.ts` — два модуля  
- **Проверка:** `npm test -- collectiveMemorySync`


**128 · M · agentTools/integrations: GitHub + GitLab** — уровень 4
- **Файлы:** `integrationsGitHub.ts`, `integrationsGitLab.ts`  
- **Проверка:** tool names в `AGENT_TOOL_NAMES` на месте


**129 · M · agentTools/integrations: memory + skills + web** — уровень 4
- **Файлы:** `integrationsMemory.ts`, `integrationsWeb.ts`  
- **Проверка:** typecheck


**130 · M · defaultSkills: данные в JSON** — уровень 4
- **Цель:** SKILL markdown из `resources/default-skills/*.md` вместо строк в TS  
- **Файлы:** `defaultSkills.ts`, `resources/default-skills/`  
- **Проверка:** `npm test -- defaultSkills`


**131 · M · useMessageQueue: обработчики стрима** — уровень 4
- **Файлы:** `useMessageQueue.ts` → `messageQueueHandlers.ts`  
- **Проверка:** отправка и danger-block работают


**132 · M · agentContextManager: выбор провайдера** — уровень 4
- **Файлы:** `agentContextManager.ts` (~350) → `providerResolver.ts`  
- **Проверка:** cloud/ollama routing tests


**133 · S · Режим высокой контрастности** — уровень 4
- **Цель:** класс `high-contrast` на `:root` для слабовидящих  
- **Файлы:** `styles.css`, `PerformanceTab.tsx`, `settings.ts`  
- **Действие:** тумблер + контрастные CSS-переменные  
- **Проверка:** границы панелей и кнопок заметно контрастнее


**134 · S · Цвет папки чатов** — уровень 4
- **Цель:** `ChatFolder.color?: string` — цветная полоска у заголовка папки  
- **Файлы:** `types.ts`, `chats.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** picker в контекстном меню папки  
- **Проверка:** цвет виден и сохраняется


**135 · M · Drag-drop папок в чат** — уровень 4
- **Цель:** перетаскивание директории → `@path` или attachment как у файлов  
- **Файлы:** `ChatPanel/ChatInput.tsx`, `registerFileIpc.ts`  
- **Действие:** resolve directory path; лимит вложенных файлов  
- **Проверка:** drop папки добавляет путь в чат


**136 · M · Mermaid в ответах агента** — уровень 4
- **Цель:** блоки ` ```mermaid ` рендерятся как SVG  
- **Файлы:** `MessageBody.tsx`, dependency `mermaid`  
- **Действие:** lazy import mermaid; sandboxed render  
- **Проверка:** диаграмма из примера отображается


**137 · M · E2E: дерево проекта** — уровень 4
- **Файлы:** `e2e/project-tree.test.ts`  
- **Действие:** открыть tree → клик файл  
- **Проверка:** e2e green


**138 · M · E2E: DiffPreviewModal** — уровень 4
- **Файлы:** `e2e/diff-preview.test.ts`  
- **Действие:** mock preview_edit event  
- **Проверка:** e2e green


**139 · S · Фильтр по тегам в SkillsPanel** — уровень 4
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`  
- **Действие:** теги из frontmatter SKILL.md  
- **Проверка:** фильтр по тегу работает


**140 · S · Сохранение последнего benchmark** — уровень 4
- **Файлы:** `settings.ts`, `ModelTab.tsx`  
- **Действие:** `lastBenchmark: BenchmarkResult` после прогона  
- **Проверка:** результат виден после reopen settings


**141 · S · Dependabot для npm** — уровень 4
- **Файлы:** `.github/dependabot.yml`  
- **Действие:** weekly `app/` и root  
- **Проверка:** файл валиден по schema dependabot


**142 · M · WSL: перевод путей проекта** — уровень 4
- **Цель:** `\\wsl$\...` ↔ `/mnt/...` при выборе папки на Windows  
- **Файлы:** `fsUtil.ts`, `registerFileIpc.ts`  
- **Проверка:** unit-тест path normalize


**143 · S · Long paths на Windows** — уровень 4
- **Файлы:** `package.json` build manifest / `electron-builder`  
- **Действие:** `requestedExecutionLevel` + known issue doc  
- **Проверка:** проект с путём >260 символов открывается


**144 · L · Открепить чат в отдельное окно** — уровень 4
- **Цель:** второй `BrowserWindow` с тем же chatId через IPC sync  
- **Файлы:** `index.ts`, `App.tsx`, `registerAppIpc.ts`  
- **Действие:** «Открыть в новом окне» в меню чата  
- **Проверка:** два окна — один чат синхронизирован


**145 · M · Инфраструктура i18n** — уровень 4
- **Цель:** функция `t(key)` + `locales/ru.json` (текущие строки) + `en.json`  
- **Файлы:** `app/src/i18n/index.ts`, `app/src/i18n/locales/`  
- **Действие:** React context `I18nProvider`; fallback на ключ  
- **Проверка:** `t('settings.title')` возвращает строку на обоих языках


**146 · M · Переключатель языка в настройках** — уровень 4
- **Цель:** `locale: 'ru' | 'en'` в settings + UI в BehaviorTab  
- **Файлы:** `settings.ts`, `BehaviorTab.tsx`, `App.tsx`  
- **Действие:** select «Язык»; `I18nProvider` читает settings.locale  
- **Проверка:** смена на en → хотя бы один переведённый заголовок меняется


**147 · M · i18n: строки App и шапки** — уровень 4
- **Цель:** вынести строки `App.tsx` (кнопки, заголовки панелей) в locale-файлы  
- **Файлы:** `App.tsx`, `locales/ru.json`, `locales/en.json`  
- **Действие:** заменить литералы на `t('…')`  
- **Проверка:** en locale — шапка и «Настройки» на английском


**148 · M · i18n: SettingsModal** — уровень 4
- **Цель:** перевести вкладки и подписи настроек  
- **Файлы:** `SettingsModal/*.tsx`, locale-файлы  
- **Действие:** ключи `settings.model.*`, `settings.behavior.*` и т.д.  
- **Проверка:** en locale — названия вкладок на английском


**149 · M · i18n: ChatPanel и сообщения UI** — уровень 4
- **Цель:** перевести placeholder, кнопки отправки, статус-бар  
- **Файлы:** `ChatPanel/`, `AgentStatusBar.tsx`, locale-файлы  
- **Действие:** ключи `chat.*`, `status.*`  
- **Проверка:** en locale — placeholder поля ввода на английском


**150 · M · Docker dev-окружение** — уровень 4
- **Цель:** Dockerfile Node 20 + Ollama; compose с hot reload  
- **Файлы:** `Dockerfile`, `docker-compose.yml`, `README.md`  
- **Действие:** образ + том исходников + `npm run dev`  
- **Проверка:** `docker compose up` поднимает приложение

---

## ✅ Сделано
- MCP enabledTools: выборочное включение инструментов MCP-сервера (`enabledTools` в конфиге, чекбоксы в IntegrationsTab, фильтр в getAgentTools)
- MUTATING_TOOLS: GitHub и файловые ops — create_issue, create_pr, trigger_github_workflow, copy_file, rename_folder, copy_folder в Set
- ignore в grep_files / find_files: walkProjectFiles фильтрует по .gitignore/.cursorignore/.codeviperignore как list_directory
- git_checkout: git switch/checkout с блокировкой dirty tree без force=true
- git_stash / git_stash_pop: stash push -m и stash pop через spawn; подтверждение в acceptEdits; unit-тест round-trip в temp repo
- git_push: push с опциональным remote/branch, spawn без shell, подсказка при non-fast-forward; permissionMode acceptEdits
- git_commit: инструмент git commit -m через spawn (без shell); только внутри projectPath; подтверждение в acceptEdits
- Coverage electron/main: vitest include agentLoopGuard, runCheckpoint, commandRunner; glob thresholds 50% branches; commandRunner.ts выделен из services.ts
- Unit-тесты parallel tool execution: executeParallel с двумя mock handler и wall time < sum в agentToolExecutor.test.ts
- Unit-тесты runCheckpoint: mock git stash create + reset --hard rollback; интеграционные сценарии в app/tests/runCheckpoint.test.ts

- Unit-тесты agentLoopGuard: `MAX_CONSECUTIVE_SAME_TOOL`, `MAX_SAME_TOOL_TOTAL`, сброс при смене signature

- Чистка кода: `loadPlugins` через `readdirSync({ withFileTypes: true })` без `statSync`; контекстное меню — Cut в одном условии `isEditable && selectionText`

- pluginLoader: `delete require.cache` перед `require` + перезагрузка плагинов при каждом `getPluginTools()`; отпечаток плагинов в ключе `transformedToolsCache` — правки `.js` видны без перезапуска

- pluginLoader: `statSync` внутри `try/catch` — ENOENT при исчезновении файла плагина не прерывает загрузку остальных

- Дашборд метрик агента: `agentLogger.readMetrics(days)` парсит NDJSON-логи → агрегация по моделям (прогоны, % успеха, токены, стоимость, инструменты); IPC `get-agent-metrics`; `MetricsPanel.tsx` с карточками сводки, таблицей по моделям и топ-10 инструментов; кнопка «Метрики» в шапке; `status: ok|error` в событии `run_end`

- Повтор прогона с шага из TracePanel: кнопка ↩ на `llm_request`-событиях трейса → реконструкция истории до выбранного шага → `replayRun` в `useMessageQueue`; `replayFromStep` в `ChatPanelHandle`

- isInsideProject регистрозависимость: toLowerCase только на win32; unit-тесты для Windows и не-Windows платформ

- AgentRunner options-объект: интерфейс `AgentRunnerOptions` + деструктуризация в конструкторе; удалён мёртвый параметр `_summarizeModel`; убран `resolveSummarizeModel` из registerAgentIpc; обновлены все call sites (agent.ts P2P, registerAgentIpc.ts, тесты)

- Лимит буфера runCommand: `COMMAND_OUTPUT_BUFFER_LIMIT_BYTES = 10 МБ` в `constants.ts`; счётчик байт в обработчиках `data` → `killProcessTree` + сообщение «вывод обрезан» при превышении; unit-тест в `services.test.ts`

- Библиотека промптов / слэш-шаблоны: `PromptTemplate` в типах + Zod-schema; `matchSlashCommands`/`expandSlashCommand` принимают пользовательские шаблоны (с приоритетом над встроенными); CRUD-секция в BehaviorTab (добавить/удалить), ChatPanel передаёт `settings.promptTemplates`
- ErrorBoundary в renderer: `ErrorBoundary` class-компонент с `getDerivedStateFromError` + fallback «Перезагрузить» обёртывает корень App — белый экран при исключении заменён информативным UI
- Сокращение any + порог coverage в CI: убраны ~60 явных `args: any` из всех agentHandlers-файлов (контекстуальный вывод от `Partial<ToolHandlers>`); v8-coverage с порогами 60/50/60/60% для `shared/` и `services.ts` в `vitest.config.ts`; CI запускает `npm test -- --coverage`
- Vision-ввод (скриншоты в чат): Ctrl+V / drag-drop изображений → передача как image-блоков в Claude, OpenAI и Gemini через `userImages` параметр в IPC-цепочке; data URL не встраивается в текст, хранится в `message.images`
- Разбивка регистрации IPC: 1034-строчный index.ts разнесён на 9 файлов-регистраторов в ipc/ (registerAgentIpc, registerChatsIpc, registerFileIpc, registerMemoryIpc, registerModelsIpc, registerSettingsIpc, registerGithubIpc, registerMiscIpc, registerAppIpc) + IpcContext; index.ts — только инициализация окна и жизненный цикл app
- Разбивка SettingsModal.tsx: 2855-строчный монолит разнесён на `SettingsModal/index.tsx` + 6 вкладок (`ModelTab`, `BehaviorTab`, `PerformanceTab`, `MemoryTab`, `IntegrationsTab`, `PluginsTab`) + `shared.tsx`
**Коллективная память**
- Mutex при push: `async-mutex` сериализует merge+push; retry при конфликте с remote; unit-тест concurrent flush
- Семантический dedup: cosine similarity > 0.95 через embedding queue; дубли не попадают в collective memory

**Технический долг**
- ChatPanel: монолит разбит на `ChatPanel/` (`index.tsx`, `ChatMessages`, `ChatInput`, `ChatStatusBar`, `ChatInputMeta`, `MessageRow`, `helpers`)

**Архитектура**
- Разбивка agentTools.ts на модули: `core.ts` (файловые/git/package), `integrations.ts` (GitHub/GitLab/Jira/Linear/Web/Memory/Skills/Todo), `mcp.ts` (CodeViper/Ollama/индексация/субагенты), `index.ts` (сборка + ToolArgs + ToolHandlers + getAgentTools)
- Claude и Gemini → StreamingChatProvider: единый 429-backoff через `resolveRetryDelayMs`; убрана ручная retry-петля Gemini; Claude переведён с SDK на raw HTTP; 16 новых тестов провайдеров

**UX**
- Экспорт трейса агента: кнопка «Экспортировать» в TracePanel → `%APPDATA%/CodeViper/traces/<timestamp>.json` (папка данных приложения)
- Cherry-pick hunks в DiffPreviewModal: `parseDiffHunks` + `applySelectedHunks` в `shared/diffPreview.ts`; чекбоксы ханков в `DiffPreviewModal`; кнопка «Применить выбранное»; IPC `AGENT_PREVIEW_HUNK_SELECTION`; `hunkSelectionFn` в `ToolExecutor`

**Надёжность агентного цикла**
- Fallback на Ollama при circuit open: `pingOllama()` при `CircuitBreakerOpenError`; событие `ollama_fallback_offer` → диалог в App.tsx → переключение `modelProvider: 'ollama'`
- Unit-тест Ollama fallback: `agentFallback.test.ts` — mock `CircuitBreakerOpenError` → emit `ollama_fallback_offer` с `ollamaFallbackUrl`
- Per-step таймаут: `AGENT_STEP_TIMEOUT_MS = 120_000`; `Promise.race([ctx.chat(...), stepTimeout])` — зависший LLM-запрос прерывается с понятным сообщением
- Логирование ошибок субагентов: `catch (err)` → `console.error` + `error` в emit для оркестратора и explorer; поле `error?` в `AgentStreamPayload`

**Безопасность**
- encryptApiKey fallback: при ошибке шифрования возвращает `''` + `console.error` вместо plaintext; unit-тест с mock `safeStorage.encryptString throws`
- validateCommand нормализация: `normalizeCommand()` декодирует `\xNN`/`\uNNNN`/`%NN` перед блок-листом; `safeCreateFile` использует флаг `fileExists` + errno вместо string-сравнения; unit-тесты hex/unicode/url-обфускации

**CI и качество**
- E2E на Linux/macOS: матрица `ubuntu-latest`/`macos-latest`, отдельный job `e2e`; `--no-sandbox` on Linux; `CODEVIPER_E2E=1` пропускает git-sync
- Авто-цикл «тесты → почини»: `run_tests` — авто-определение runner, парсинг падений, агент сам переиспользует инструмент
- Песочница `run_script`: Docker `--network none --memory 512m`, fallback на локальный запуск
- Счётчик стоимости облачных запросов: `MODEL_PRICING`, `estimatedCostUsd`, чип `~$X.XXX` в AgentStatusBar

**Субагенты**
- Контракт субагента: `shared/subagent.ts`, `subagentRunner.ts`, 12 unit-тестов
- Explorer: автоматический запуск при сложной задаче, сводка в системный промпт, чип «Разведываю…»
- Editor: `delegate_to_editor`, до 20 шагов, защита от повторного делегирования, чип «Редактирую…»

**Обучение и знания**
- Рейтинг коллективных знаний: upvote/downvote в MemoryPanel; ≤ −2 → скрыть и не пушить
- Экспорт урока в навык: кнопка «🎓 Сохранить как навык» в меню ответа агента

**Каналы обновлений**
- `updateChannel: 'stable' | 'beta'`; тумблер «Beta-версии» в настройках

**P2P-вычисления** (`server/p2p/` — деплой VPS вручную; см. `docs/integrations.md`)
- Кредиты P2P в UI — `credits.ts` на сервере; `GET /credits/balance`; ±N при relay; IPC `get-p2p-credits`; чип в `AgentStatusBar`
- Маршрутизация задач на сервере — `router.ts`, `POST /tasks/route`; свободный онлайн-узел с моделью (мин. CPU), иначе `{ fallback: true }`; интеграционный тест с 2 mock-узлами
- TLS + шифрование промптов — HTTPS/WSS на сигнальном сервере (`TLS_KEY_PATH`/`TLS_CERT_PATH`); ECDH X25519 + AES-256-GCM (`app/shared/p2pCrypto.ts`); relay `/tasks/relay` и WSS `/nodes/ws` без plaintext в логах
- Лимит 3 входящих P2P-задач — `acquireP2pTaskSlot` / `releaseP2pTaskSlot`, очередь 60 с, сверх лимита → 503; `reserveIncomingP2pTask` в `runIncomingP2pTask`
- Пауза P2P при нагрузке — CPU&gt;15% или GPU&gt;20% → `tryAcceptIncomingP2pTask` / `runIncomingP2pTask`; пороги в `constants.ts`, unit-тесты с моком `systeminformation`
- Диалог согласия P2P — `P2PConsentModal.tsx`; показывается при первом включении тумблера; «Принимаю» → `p2pConsentGiven: true` + `shareCompute: true`; «Отказаться» оставляет тумблер выключенным
- REST API сигнального сервера (`server/p2p/`) — Fastify 5 + ioredis, TTL-реестр узлов, in-memory fallback
- Auth на сервере — email/bcrypt + JWT + GitHub OAuth, rate limit, middleware `requireAuth`
- Тумблер «Поделиться мощностью» — `p2pClient.ts`, IPC `register-p2p-node`, UI на вкладке «Интеграции»

**Оркестратор (node-llama-cpp)**
- `nodeLlama.ts` — обёртка node-llama-cpp v3, ленивый singleton, unit + интеграционные тесты
- `orchestratorModel.ts` — `analyze()` → `{plan, rephrased, isComplex}`, 10 unit-тестов
- Выбор и скачивание GGUF — IPC `select-gguf-file` / `download-gguf`, прогресс + отмена в UI
- UI секция «Оркестратор» — тумблер, `minMessageLength`, кнопка удалить модель
- Интеграция в AgentRunner — `analyze()` перед запуском, чип «Планирую…», план в системный промпт

**Коллективное обучение** (ветка `agent/self-improve`, `docs/collective/ViperMemory.md`, чип ☁️ в статус-баре)
- `AgentLearningPanel` — синхронизация pending-записей, кнопка «Создать PR», автообновление
- Collective ViperMemory + ViperSkills — pull при старте, фильтр дублей/коротких записей
- MemoryPanel — раздельные секции локальных и коллективных записей, бейдж 📚

**Установщик и самообновление**
- NSIS — клонирование репо при установке, `git pull` при обновлении, ярлыки, удаление исходников
- POSIX-лаунчер `CodeViper.sh` для Linux/macOS
- CI матрица windows/ubuntu/macos, публикация в GitHub Releases

**Инструменты агента**
- GitLab: `list_gitlab_mrs`, `create_gitlab_mr`, `get_gitlab_pipeline`
- Jira: `create_jira_issue` через REST API
- Linear: `create_linear_issue` через GraphQL API
- Панель выбора задачи из ROADMAP, slash-команды (/test, /commit, /review, /roadmap…)
- `disabledTools`, `commandBlocklist`, `commandAllowlist`, per-chat `projectPath`

**Качество и производительность**
- Nudge «используй RAG»: после пустого grep — system-hint вызвать `search_knowledge_base` (Qdrant `codeviper_project`)
- Символьный индекс: `find_symbol` / `find_references` — AST (TypeScript compiler) для ts/js, парсер для py; `path:line:col`
- SHA-256 верификация при pull Ollama
- Rebase при конфликте push в `selfCommit.ts`
- Автопроверка после саморедактирования (typecheck + test)
- Бенчмарк моделей (tok/s, latency, tool call)
- Автоиндексация проекта в Qdrant при открытии
- Маскирование секретов: `secretRedaction.ts` — логи, контекст провайдера, collective memory

**UI и настройки**
- Иконка в системном трее — `tray.ts`, сворачивание в трей при закрытии окна, tooltip при работе агента
- Прогресс автообновления — `UpdateBanner`: %, объём, скорость, ETA; надёжный `quitAndInstall` на Windows
- Уведомление «агент закончил»: системный toast + звук при `soundNotifications`; фаза `idle` после busy
- Side-by-side diff: `DiffPreviewModal` — переключатель unified / side-by-side, подсветка синтаксиса в `preview_edit`
- Дерево файлов проекта: `ProjectTreePanel` — IPC `get-project-tree`, клик открывает файл, ПКМ «Спросить агента» вставляет `@path`
- @-упоминание файлов в поле ввода чата (`ChatInput`, `FileMentionPopover`, IPC `get-project-tree`)
- Webhook «агент готов», режим инкогнито, редактор правил проекта `.codeviper/rules.md`
- Чеклист плана самоулучшения (`SelfImprovePlanPanel`)

**Ядро**
- Провайдеры: Claude, Gemini, Groq, Together AI, OpenRouter; TRON-сжатие; RAG Qdrant/Milvus
- Prompt caching Claude: system + tools через `cache_control: ephemeral` в `claudeProvider.ts`
- Чекпоинт прогона: `git stash create` перед mutating tools, кнопка «Откатить всё» в чате
- Плагины: `~/.codeviper/plugins/`, esbuild + worker_thread изоляция
- Рефакторинг агента на 6 модулей; параллельное выполнение инструментов; LRU-кэши

**UI и настройки**
- Шаблоны чатов: 3 шаблона (Рефакторинг, Новый модуль, Code review), кнопка «▾» в ChatHistoryPanel
- Авто-PR collective: тумблер «Авто-PR после sync»; после push → `createCodeViperPr()`; «уже существует» не ошибка

**Рефакторинг**
- Разбивка agentHandlersProject.ts: файловые → `agentHandlersProjectFile.ts`, поисковые → `agentHandlersProjectSearch.ts`, терминальные → `agentHandlersProjectTerminal.ts`; общий контекст в `agentHandlersProjectContext.ts`; IPC-контракт не изменился

- Health-check MCP при старте: ping серверов из настроек при запуске (5 с таймаут), toast при недоступности, статус в Интеграции

**Документация**
- CONTRIBUTING.md: диаграмма ReAct (mermaid), таблица ключевых модулей, пошаговый гайд добавления инструмента
- Шаблоны GitHub Issues (баг, идея, вопрос, docs) и Pull Request (feature, bugfix, self-improvement)
- TypeDoc + GitHub Pages — `npm run docs`, workflow `.github/workflows/docs.yml`
- README «Примеры запросов» — 7 готовых диалогов; GIF в `docs/media/`

**Файлы проекта**
- `.codeviperignore`: glob-паттерны для агента (после `.cursorignore`); `list_directory` и дерево проекта; `docs/codeviperignore.md`

**CI**
- `npm audit --audit-level=high` в job `build` после `npm ci` — падение при high/critical в `app/`

**Отладка**
- `debugAgent`: тумблер в Поведение → Автоматизация; полный tool I/O в `agent-*.ndjson` + verbose `console` в main

**Плагины**
- Zod-валидация схемы tool при загрузке: невалидный `.js`-плагин логируется и пропускается, остальные загружаются

**Инструменты проекта**
- `list_directory` / `project_stats`: относительный `path` резолвится от корня проекта, а не от cwd установки
- Экспорт трейса: `userData/traces/` вместо `{проект}/.codeviper/traces/`

**Настройки**
- Удалён deprecated `cloudApiKey`: миграция в per-provider keys при загрузке; UI облачного провайдера использует ключ выбранного провайдера
