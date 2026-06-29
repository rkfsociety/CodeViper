# Дорожная карта CodeViper

Задачи для самоулучшения агента. Выполненное — [ROADMAP_DONE.md](ROADMAP_DONE.md). Назад в [README](README.md).

### Формат задач для самообучения агента

Каждый пункт следует **одному шаблону** — агент читает `ROADMAP.md` и строит `set_self_improvement_plan`.

**Шаблон пункта:**

```text
N · [S/M/L/XL] · Краткое название — уровень 1|2|3|4
- Цель: один измеримый результат
- Файлы: конкретные пути (app/electron/main/…, app/src/…)
- Действие: одна атомарная правка
- Проверка: npm run typecheck | npm test -- … | сценарий в UI
```

**Промпт:** `Выполни пункт N из ROADMAP.md — самоулучшение CodeViper.`

**Правила:** пункты **1…212**; внутри цепочки — строго по порядку.

## 📋 В планах

> Пункты **1…212**. Цепочки 🔗 — строгий порядок внутри группы: split/preview (готово), plan **10–11**, onboarding **12–14**, редактор **24–25**, worktree **49–51**, LSP **73–75**, i18n **129–133**.

### 🟠 Уровень 2 — высокая польза

> Ежедневный UX, превью, onboarding, провайдеры, субагенты (Architect/Documenter/Security), ROADMAP-автоматизация, E2E, ModelTab. Пункты **5–45** — выполнять сверху вниз; цепочки см. шапку раздела.






















**1 · S · Ручная переиндексация** — уровень 2
- **Цель:** кнопка в `ProjectTreePanel` ПКМ → «Переиндексировать»  
- **Файлы:** `ProjectTreePanel.tsx`, IPC вызов `index_project`  
- **Действие:** пункт меню → `index_project` для текущего `projectPath`  
- **Проверка:** индексация запускается


**2 · M · Аудит focus trap в модалках** — уровень 2
- **Цель:** все `role="dialog"` используют `useModalA11y` + Tab cycle  
- **Файлы:** модалки без хука (`MetricsPanel`, `TracePanel`, …)  
- **Действие:** подключить `useModalA11y`; initial focus на первый интерактивный элемент  
- **Проверка:** Tab не уходит за пределы открытой модалки


**3 · S · aria-live для статуса агента** — уровень 2
- **Цель:** screen reader объявляет «Агент работает» / «Готово»  
- **Файлы:** `AgentStatusBar.tsx`  
- **Действие:** `aria-live="polite"` region с текстом фазы  
- **Проверка:** accessibility inspector показывает live region


**4 · M · Просмотр NDJSON-логов агента** — уровень 2
- **Цель:** вкладка или панель «Логи» — tail `agent-*.ndjson`  
- **Файлы:** `agentLogger.ts`, `LogViewerPanel.tsx`, IPC `read-agent-logs`  
- **Действие:** фильтр по event type; последние 500 строк  
- **Проверка:** после прогона логи видны в UI


**5 · S · Подтверждение внешних ссылок** — уровень 2
- **Цель:** клик по `http(s)` в MessageBody → ConfirmDialog перед `openExternal`  
- **Файлы:** `MessageBody.tsx`, `App.tsx`  
- **Действие:** перехват click на `<a>`  
- **Проверка:** без подтверждения браузер не открывается


**6 · M · Клик по пути в code block → открыть файл** — уровень 2
- **Цель:** `src/foo.ts:12` в коде → открыть в превью (п. 8–10)  
- **Файлы:** `MessageBody.tsx`, `App.tsx`  
- **Действие:** regex path:line; IPC read + preview  
- **Проверка:** клик открывает файл на строке


**7 · M · Субагент Reviewer** — уровень 2
- **Цель:** `delegate_to_reviewer` — read-only обзор diff без правок  
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`, `agent.ts`  
- **Проверка:** unit-тест контракта; чип «Ревью…»


**8 · M · Субагент Tester** — уровень 2
- **Цель:** `delegate_to_tester` — только `run_tests` / `run_command` test  
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`  
- **Проверка:** не вызывает write_file


### 🔗 Дополнительные инструменты агента

**9 · M · git_blame и git_show** — уровень 2
- **Цель:** read-only `git_blame` (path, line?) и `git_show` (commit, path?)
- **Файлы:** `gitTools.ts`, `agentTools/core.ts`, `agentHandlersProject.ts`
- **Действие:** лимит строк вывода; только внутри projectPath
- **Проверка:** unit-тест temp git repo


**10 · M · diff_files** — уровень 2
- **Цель:** unified diff двух файлов проекта без git
- **Файлы:** `diffUtil.ts`, `agentTools/core.ts`, `agentHandlersProjectFile.ts`
- **Действие:** параметры `path_a`, `path_b`; оба внутри projectPath
- **Проверка:** unit-тест на два fixture-файла


**11 · M · read_agent_log** — уровень 2
- **Цель:** tool `read_agent_log` — tail `agent-*.ndjson` (до UI LogViewerPanel)
- **Файлы:** `agentLogger.ts`, `agentTools/integrations.ts`, handler
- **Действие:** параметры `lines?` (default 100), `event?`; NDJSON → текст
- **Проверка:** unit-тест на fixture log file


**12 · M · npm_install / add_package** — уровень 2
- **Цель:** безопасная установка зависимостей без произвольного `run_command`
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`, `commandRunner.ts`
- **Действие:** `npm_install` с `package`, `dev?`; блок `&&` и лишних флагов
- **Проверка:** unit-тест: опасная строка → отказ


**13 · S · create_pr vs create_codeviper_pr** — уровень 2
- **Цель:** агент не путает PR проекта и PR исходников CodeViper
- **Файлы:** `agentTools/integrations.ts`, `agentTools/mcp.ts`, `defaultSkills.ts`
- **Действие:** descriptions: `create_pr` — проект; `create_codeviper_pr` — CodeViper
- **Проверка:** grep descriptions содержит «проект» и «CodeViper»


**14 · M · E2E: smoke настройки и отправка** — уровень 2
- **Цель:** Playwright-тест: открыть настройки → закрыть → ввести промпт (mock LLM)  
- **Файлы:** `app/e2e/smoke.spec.ts`  
- **Действие:** `CODEVIPER_E2E=1`; stub agent-stream или пустой ответ  
- **Проверка:** `npm run test:e2e` — новый тест зелёный в CI


**15 · M · Component test MessageRow** — уровень 2
- **Цель:** vitest + @testing-library/react для pin/retry menu  
- **Файлы:** `tests/MessageRow.test.tsx`, vitest config jsdom  
- **Проверка:** `npm test -- MessageRow`


**16 · M · E2E: навигация по вкладкам настроек** — уровень 2
- **Файлы:** `e2e/settings.test.ts`  
- **Проверка:** `npm run test:e2e`


**17 · S · docs/troubleshooting.md** — уровень 2
- **Цель:** GPUCache, чёрный экран, plugins, portable Node  
- **Файлы:** `docs/troubleshooting.md`, ссылка в README  
- **Проверка:** README ссылается на troubleshooting


**18 · S · README: Linux и macOS в быстром старте** — уровень 2
- **Цель:** бейджи платформ, ссылки на AppImage/DMG и `CodeViper.sh` из релизов  
- **Файлы:** `README.md`  
- **Действие:** дополнить «Быстрый старт» установкой не только через Windows-установщик  
- **Проверка:** README содержит AppImage, dmg и POSIX-лаунчер


**19 · M · ModelTab: формы провайдеров** — уровень 2
- **Цель:** вынести JSX-блоки `provider === '…'` в `ModelTab/providers/*.tsx`  
- **Файлы:** `SettingsModal/ModelTab.tsx` → `SettingsModal/ModelTab/providers/` (Ollama, DeepSeek, Gemini, …)  
- **Действие:** каждый провайдер — отдельный компонент с props `{ settings, onSettingsChange }`; ModelTab — switch по `modelProvider`  
- **Проверка:** `npm run typecheck`; смена провайдера в настройках работает как раньше


**20 · M · ModelTab: оркестратор, бенчмарк, канал обновлений** — уровень 2
- **Цель:** вынести нижнюю часть ModelTab (~300 строк) в отдельные секции  
- **Файлы:** `OrchestratorSection.tsx`, `BenchmarkSection.tsx`, `UpdateChannelSection.tsx` в `SettingsModal/ModelTab/`  
- **Действие:** перенести GGUF-download, benchmark, orchestrator toggle, beta-channel без изменения логики  
- **Проверка:** бенчмарк и скачивание GGUF работают; `ModelTab.tsx` < 400 строк


**21 · M · Экспорт чата в Markdown** — уровень 2
- **Цель:** кнопка в меню чата → `.md` с ролями и код-блоками  
- **Файлы:** `ChatHistoryPanel.tsx`, `chats.ts`, `registerChatsIpc.ts`  
- **Действие:** `export-chat-markdown` IPC + save dialog  
- **Проверка:** файл читается в любом MD-viewer


**22 · M · IPC export-chat** — уровень 2
- **Цель:** экспорт сообщений и метаданных чата в JSON  
- **Файлы:** `chats.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** `export-chat` → `{ messages, settings, projectPath }`; save dialog  
- **Проверка:** экспорт → файл валидный JSON с messages


**23 · M · IPC import-chat** — уровень 2
- **Цель:** импорт чата из JSON в новый чат в store  
- **Файлы:** `chats.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** open dialog → parse → `createChat` с messages  
- **Проверка:** импортированный чат отображает историю


**24 · M · CodeEditorPanel на CodeMirror** — уровень 2
- **Цель:** редактируемая вкладка файла вместо read-only `FilePreviewPanel` (п. 9)  
- **Файлы:** `app/src/components/CodeEditorPanel.tsx`, `app/package.json`  
- **Действие:** зависимость `@codemirror/*`; обёртка с темой под тёмный UI  
- **Проверка:** файл открывается в редакторе; курсор и правка работают


**25 · M · Сохранение из редактора** — уровень 2
- **Цель:** Ctrl+S / кнопка «Сохранить» пишет файл через существующий IPC  
- **Файлы:** `CodeEditorPanel.tsx`, `app/electron/main/ipc/registerFileIpc.ts`  
- **Действие:** `window.codeviper.writeFile(path, content)`; индикатор «несохранено»  
- **Проверка:** правка + сохранение → содержимое на диске изменилось

**26 · M · Subagent Architect — анализ структуры проекта** — уровень 2
- **Цель:** read-only анализ архитектуры: циклы импортов, крупные модули
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** tool `delegate_to_architect`
- **Проверка:** unit-тест: архитектурный отчёт без write_file


**27 · M · Subagent Documenter — генерация документации** — уровень 2
- **Цель:** read-only генерация README/API-доков
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`
- **Действие:** tool `delegate_to_documenter`
- **Проверка:** unit-тест: генерируется MD-текст


**28 · M · Subagent Security — поиск секретов и unsafe команд** — уровень 2
- **Цель:** read-only security-review проекта
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`
- **Действие:** tool `delegate_to_security`
- **Проверка:** unit-тест: находит секреты в фикстуре


**29 · S · Авто-архивация выполненных пунктов ROADMAP** — уровень 2
- **Цель:** при `complete_self_improvement_item` переносить блок в ROADMAP_DONE.md
- **Файлы:** `agentTools/mcp.ts`, `read_roadmap_item.ts`
- **Действие:** append в DONE
- **Проверка:** DONE содержит новый пункт


**30 · M · Авто-генерация новых пунктов ROADMAP** — уровень 2
- **Цель:** tool `suggest_new_roadmap_items` на основе trace ошибок
- **Файлы:** `agentTools/mcp.ts`, `agentLogger.ts`
- **Действие:** генерация S/M задач
- **Проверка:** новые пункты появляются в конце уровня


**31 · M · Self-Improvement Queue Panel** — уровень 2
- **Цель:** UI-панель очереди самоулучшения
- **Файлы:** `SelfImprovePanel.tsx`, `AgentStatusBar.tsx`
- **Действие:** список пунктов 1…134 + статус
- **Проверка:** очередь видна в UI


**32 · S · Авто-приоритизация ROADMAP** — уровень 2
- **Цель:** tool `prioritize_roadmap_items`
- **Файлы:** `agentTools/mcp.ts`
- **Действие:** сортировка по пользе/риску
- **Проверка:** вывод приоритета в UI


**33 · M · Авто-цепочки задач** — уровень 2
- **Цель:** tool `plan_task_chain` → разбиение промпта на шаги
- **Файлы:** `agent.ts`, `agentContext.ts`
- **Действие:** цепочка шагов в trace
- **Проверка:** trace содержит план


**34 · S · Авто-делегирование шагов субагентам** — уровень 2
- **Цель:** шаги типа «ревью» → Reviewer, «тесты» → Tester
- **Файлы:** `agent.ts`, `subagentRunner.ts`
- **Действие:** автоматический выбор субагента
- **Проверка:** trace показывает делегирование


**35 · M · Граф архитектуры проекта** — уровень 2
- **Цель:** визуализация импортов и модулей
- **Файлы:** `ArchitecturePanel.tsx`, `agentHandlersProjectSearch.ts`
- **Действие:** построение графа
- **Проверка:** UI показывает граф


**36 · S · Авто-обнаружение циклов импортов** — уровень 2
- **Цель:** предупреждение в чате
- **Файлы:** `symbolIndex.ts`, `ArchitecturePanel.tsx`
- **Действие:** поиск циклов
- **Проверка:** цикл отображается


**37 · M · Авто-генерация тестов для новых файлов** — уровень 2
- **Цель:** tool `generate_tests_for_file`
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectFile.ts`
- **Действие:** генерация тестов
- **Проверка:** тесты создаются


**38 · M · Авто-документирование новых функций** — уровень 2
- **Цель:** tool `generate_docstring`
- **Файлы:** `agentTools/core.ts`
- **Действие:** вставка docstring
- **Проверка:** docstring появляется


**39 · M · Авто-оптимизация больших файлов** — уровень 2
- **Цель:** tool `refactor_large_file`
- **Файлы:** `agentTools/core.ts`
- **Действие:** разбиение файла
- **Проверка:** файл разделён


**40 · S · Авто-обнаружение медленных участков** — уровень 2
- **Цель:** tool `find_slow_code`
- **Файлы:** `agentTools/core.ts`
- **Действие:** анализ AST
- **Проверка:** отчёт в чате


**41 · M · Авто-обновление зависимостей** — уровень 2
- **Цель:** безопасный `update_dependencies`
- **Файлы:** `agentHandlersProjectTerminal.ts`, `commandRunner.ts`
- **Действие:** обновление minor/patch
- **Проверка:** зависимости обновлены


**42 · S · Авто-проверка CVE** — уровень 2
- **Цель:** tool `check_cve`
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** запрос CVE API
- **Проверка:** отчёт в чате


**43 · M · Авто-генерация CHANGELOG** — уровень 2
- **Цель:** tool `generate_changelog`
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** MD-файл
- **Проверка:** CHANGELOG.md создан


**44 · S · Авто-форматирование проекта** — уровень 2
- **Цель:** tool `format_project`
- **Файлы:** `agentTools/core.ts`
- **Действие:** prettier/black
- **Проверка:** форматирование прошло


**45 · M · Авто-проверка лицензий** — уровень 2
- **Цель:** tool `check_licenses`
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** анализ зависимостей
- **Проверка:** отчёт в чате


### 🟡 Уровень 3 — средняя польза

> Символы, worktree, рефакторинг IPC/services, интеграции, LSP, автоматизации, P2P. Пункты **46–90**.

**46 · M · find_symbol для Go** — уровень 3
- **Цель:** `find_symbol` / `find_references` для `.go` через `go/ast` или tree-sitter  
- **Файлы:** `app/electron/main/symbolIndex.ts`, `agentHandlersProjectSearch.ts`  
- **Действие:** парсер Go → символы с `path:line:col`  
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.go` файлом


**47 · M · find_symbol для Rust** — уровень 3
- **Цель:** символы для `.rs` (tree-sitter-rust или синтаксический обход)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** расширить `walkProjectForSymbols` для `.rs`  
- **Проверка:** unit-тест: `fn main` и `struct Foo` находятся по имени


**48 · M · find_symbol для Java** — уровень 3
- **Цель:** символы для `.java` (class/method)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** regex или tree-sitter-java для объявлений top-level  
- **Проверка:** unit-тест на простом `.java` с `public class Bar`


**49 · M · gitWorktree.ts** — уровень 3
- **Цель:** create / remove / list worktrees через `git worktree`  
- **Файлы:** `app/electron/main/gitWorktree.ts` (новый), `gitTools.ts`  
- **Действие:** `createWorktree(repoPath, branch)` → путь worktree; `removeWorktree`  
- **Проверка:** unit-тест с temp git repo; `git worktree list` содержит запись


**50 · M · worktreePath в чате + IPC** — уровень 3
- **Цель:** поле `worktreePath?` в persisted chat; IPC `create-chat-worktree`  
- **Файлы:** `chats.ts`, `types.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** кнопка «Изолировать в worktree» в меню чата  
- **Проверка:** новый чат получает отдельную папку worktree


**51 · M · AgentRunner — корень worktree** — уровень 3
- **Цель:** если у чата есть `worktreePath`, агент работает в нём, а не в `projectPath`  
- **Файлы:** `agent.ts`, `registerAgentIpc.ts`, `agentHandlersProjectContext.ts`  
- **Действие:** `resolveProjectRoot(chat)` → `worktreePath ?? projectPath`  
- **Проверка:** правка файла в изолированном чате не затрагивает основную копию


**52 · M · ipcContracts: Zod-схемы данных** — уровень 3
- **Цель:** схемы `ChatMessage`, `AgentSettings`, `SavedChat` и др. — в `shared/ipc/schemas.ts`  
- **Файлы:** `shared/ipcContracts.ts` → `shared/ipc/schemas.ts`  
- **Действие:** re-export из `ipcContracts.ts` для обратной совместимости импортов  
- **Проверка:** `npm run typecheck`; импорты `ChatMessageSchema` не сломаны


**53 · M · ipcContracts: IPC enum и Contracts** — уровень 3
- **Цель:** объект `IPC` и `Contracts` — в `shared/ipc/channels.ts`  
- **Файлы:** `shared/ipcContracts.ts` → `shared/ipc/channels.ts`  
- **Действие:** `ipcContracts.ts` — barrel re-export; `parseIpcArgs` остаётся рядом с Contracts  
- **Проверка:** `npm run typecheck`; preload и register*Ipc компилируются


**54 · M · services.ts: файловые операции** — уровень 3
- **Цель:** `safeRead*`, `safeWrite*`, `buildFileTree`, кэши — в `fileServices.ts`  
- **Файлы:** `services.ts` → `fileServices.ts`  
- **Действие:** `services.ts` re-export для handler-импортов  
- **Проверка:** `npm test -- services` зелёный


**55 · M · services.ts: runCommand** — уровень 3
- **Цель:** `validateCommand`, `normalizeCommand`, `runCommand`, лимит буфера — в `commandRunner.ts`  
- **Файлы:** `services.ts` → `commandRunner.ts`  
- **Действие:** handlers импортируют из `commandRunner.ts` или barrel `services.ts`  
- **Проверка:** `npm test -- services.test` — validateCommand и buffer limit


**56 · S · Поиск в MemoryPanel** — уровень 3
- **Файлы:** `MemoryPanel.tsx`  
- **Действие:** filter по тексту и category  
- **Проверка:** поиск сужает список


**57 · M · Импорт skill из файла** — уровень 3
- **Цель:** кнопка «Импорт .md» → copy в skills dir  
- **Файлы:** `SkillsPanel.tsx`, IPC `import-skill-file`  
- **Проверка:** skill появляется в списке


**58 · S · Шаблоны MCP-серверов** — уровень 3
- **Цель:** кнопки «+ filesystem», «+ fetch» с готовым JSON конфигом  
- **Файлы:** `IntegrationsTab.tsx`, `docs/integrations.md`  
- **Проверка:** шаблон добавляет запись в settings


**59 · S · Slash /lint** — уровень 3
- **Файлы:** `shared/slashCommands.ts`  
- **Действие:** expand → `npm run lint` + исправить  
- **Проверка:** `/lint` в меню slash


**60 · S · Slash /build** — уровень 3
- **Файлы:** `shared/slashCommands.ts`  
- **Действие:** expand → `npm run build` + исправить ошибки  
- **Проверка:** `/build` в автодополнении


**61 · S · Slash /security** — уровень 3
- **Файлы:** `shared/slashCommands.ts`  
- **Действие:** expand → review на секреты, injection, unsafe commands  
- **Проверка:** `/security` в списке


**62 · S · Ctrl+Shift+T — экспорт трейса** — уровень 3
- **Файлы:** `App.tsx`, `TracePanel.tsx`  
- **Действие:** если trace open → export; иначе открыть TracePanel  
- **Проверка:** shortcut в модалке `?`


**63 · S · Кнопка «Очистить» в терминале** — уровень 3
- **Файлы:** `TerminalPanel.tsx`  
- **Проверка:** output сбрасывается


**64 · S · Очередь: удалить элемент** — уровень 3
- **Цель:** кнопка ✕ у каждого сообщения в очереди (`AgentStatusBar` / queue UI)  
- **Файлы:** `AgentStatusBar.tsx`, `QueueContext.tsx`  
- **Действие:** `removeFromQueue(index)` IPC или context  
- **Проверка:** элемент исчезает, остальные выполняются


**65 · S · Skip link «К содержимому»** — уровень 3
- **Цель:** скрытая ссылка в начале `App.tsx` → `#main-chat`  
- **Файлы:** `App.tsx`, `styles.css`  
- **Действие:** `:focus` показывает ссылку  
- **Проверка:** Tab с первого элемента → skip → фокус в чате


**66 · S · Экспорт метрик в CSV** — уровень 3
- **Цель:** кнопка в `MetricsPanel` → CSV byModel + topTools  
- **Файлы:** `MetricsPanel.tsx`  
- **Действие:** blob download  
- **Проверка:** CSV открывается в Excel


**67 · S · Документация plugin-authoring** — уровень 3
- **Цель:** гайд автора плагина: схема tool, пример `.js`, hot-reload  
- **Файлы:** `docs/plugin-authoring.md`, ссылка в `README.md`  
- **Действие:** минимальный working example + ограничения (только `.js`)  
- **Проверка:** файл существует; README ссылается на него


**68 · M · Провайдер Mistral** — уровень 3
- **Цель:** `modelProvider: 'mistral'` через Mistral API  
- **Файлы:** `mistralProvider.ts`, `modelRuntime.ts`, `constants.ts`  
- **Действие:** `StreamingChatProvider` + список моделей  
- **Проверка:** unit-тест stream parser


**69 · M · Bitbucket: create_pull_request** — уровень 3
- **Цель:** tool `create_bitbucket_pr` через REST API 2.0  
- **Файлы:** `bitbucketTools.ts`, `agentTools/integrations.ts`, `IntegrationsTab.tsx`  
- **Действие:** token + workspace/repo в settings  
- **Проверка:** unit-тест с mock fetch


**70 · M · Azure DevOps: create_work_item** — уровень 3
- **Цель:** tool `create_ado_work_item` (PAT + org/project)  
- **Файлы:** `adoTools.ts`, `integrations.ts`, settings  
- **Действие:** WIQL/create work item REST  
- **Проверка:** mock API test


**71 · S · Discord webhook** — уровень 3
- **Цель:** `discordWebhookUrl` — уведомление «агент готов» в Discord  
- **Файлы:** `webhookNotify.ts`, `IntegrationsTab.tsx`, `settings.ts`  
- **Действие:** POST embed JSON  
- **Проверка:** unit-тест payload


**72 · S · Telegram Bot уведомления** — уровень 3
- **Цель:** `telegramBotToken` + `telegramChatId` в настройках  
- **Файлы:** `webhookNotify.ts`, `IntegrationsTab.tsx`  
- **Действие:** `sendMessage` API  
- **Проверка:** mock fetch test


**73 · M · lspClient — spawn language server** — уровень 3
- **Цель:** main-процесс запускает `typescript-language-server` / `pyright-langserver` по расширению файла  
- **Файлы:** `app/electron/main/lspClient.ts` (новый)  
- **Действие:** JSON-RPC over stdio; `didOpen`/`didChange`/`shutdown`  
- **Проверка:** unit-тест с mock child_process; лог «LSP ready» для `.ts`


**74 · M · LSP hover и go-to-definition (TS/JS)** — уровень 3
- **Цель:** hover tooltip и Ctrl+click → переход к определению в `CodeEditorPanel` (п. 50)  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** IPC `lsp-request` → `textDocument/hover`, `textDocument/definition`  
- **Проверка:** Ctrl+click на символ → курсор на определении в том же файле


**75 · M · LSP pyright для Python** — уровень 3
- **Цель:** те же hover/definition для `.py` через pyright-langserver  
- **Файлы:** `lspClient.ts`  
- **Действие:** ветка выбора сервера по `languageFromPath`; инициализация pyright  
- **Проверка:** Ctrl+click на `def foo` в `.py` → переход к определению


**76 · M · Fetch remote skill manifest** — уровень 3
- **Цель:** список навыков с GitHub raw URL или индекс-файла  
- **Файлы:** `app/electron/main/skills.ts`, `registerMiscIpc.ts`  
- **Действие:** `list-remote-skills(url)` → `{ name, description, url }[]`  
- **Проверка:** unit-тест с mock fetch на тестовый manifest.json


**77 · M · import-remote-skill UI** — уровень 3
- **Цель:** кнопка «Импорт из каталога» в SkillsPanel  
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`  
- **Действие:** выбор из списка → download SKILL.md → локальный skill  
- **Проверка:** импорт skill из URL появляется в списке навыков


**78 · M · AutomationRule в settings** — уровень 3
- **Цель:** тип `{ id, cron, prompt, enabled }` + Zod-массив в настройках  
- **Файлы:** `settings.ts`, `types.ts`  
- **Действие:** `automations: AutomationRule[]` с default `[]`  
- **Проверка:** `npm run typecheck`; сохранение массива в settings.json


**79 · M · automationScheduler в main** — уровень 3
- **Цель:** таймер проверяет cron-выражения и ставит промпт в очередь чата  
- **Файлы:** `app/electron/main/automationScheduler.ts`, `index.ts`  
- **Действие:** `node-cron` или setInterval + parse; emit в default chat  
- **Проверка:** unit-тест: rule `* * * * *` + mock time → enqueue вызван


**80 · M · AutomationsTab в настройках** — уровень 3
- **Цель:** CRUD автоматизаций: cron, промпт, вкл/выкл  
- **Файлы:** `SettingsModal/AutomationsTab.tsx`, `SettingsModal/index.tsx`  
- **Действие:** форма добавления; список с удалением  
- **Проверка:** созданная автоматизация сохраняется и видна после reopen settings


**81 · M · Дублировать промпт во второй чат** — уровень 3
- **Цель:** кнопка «Сравнить с другой моделью» копирует промпт в новый чат  
- **Файлы:** `ChatPanel/index.tsx`, `ChatHistoryPanel.tsx`  
- **Действие:** `createChat` + тот же `input` + подсказка выбрать модель  
- **Проверка:** два чата с одинаковым первым сообщением пользователя


**82 · M · SplitChatView** — уровень 3
- **Цель:** два чата side-by-side для сравнения ответов  
- **Файлы:** `app/src/App.tsx`, `SplitChatView.tsx`  
- **Действие:** режим «Сравнение» — два `ChatPanel` с общим projectPath  
- **Проверка:** оба чата видны одновременно; отправка в каждый независима


**83 · M · docker-compose для server/p2p** — уровень 3
- **Цель:** one-click деплой сигнального сервера + Redis  
- **Файлы:** `server/p2p/docker-compose.yml`, `server/p2p/README.md`, `docs/integrations.md`  
- **Действие:** сервисы `p2p` + `redis`; env-шаблон `.env.example`  
- **Проверка:** `docker compose up` → `GET /health` → 200


**84 · M · Dashboard статуса узлов** — уровень 3
- **Цель:** `GET /admin/dashboard` — онлайн-узлы, задачи, кредиты (auth)  
- **Файлы:** `server/p2p/src/routes/admin.ts`  
- **Действие:** JSON `{ nodes, activeTasks, totalCredits }`  
- **Проверка:** интеграционный тест с mock-узлами


**85 · M · Рейтинг узлов по latency** — уровень 3
- **Цель:** `router.ts` предпочитает узлы с меньшим средним RTT  
- **Файлы:** `server/p2p/src/router.ts`, `server/p2p/src/credits.ts`  
- **Действие:** хранить `avgLatencyMs` per node; сортировка при route  
- **Проверка:** unit-тест: два узла → выбирается с меньшей latency


**86 · M · Reconnect с backoff** — уровень 3
- **Файлы:** `p2pClient.ts`  
- **Действие:** exponential delay 1s→30s при обрыве WSS  
- **Проверка:** unit-тест reconnect attempts


**87 · S · Чип P2P offline** — уровень 3
- **Файлы:** `AgentStatusBar.tsx`, `p2pClient.ts`  
- **Действие:** «P2P offline» при disconnect  
- **Проверка:** виден при остановленном сервере


**88 · M · История P2P-задач** — уровень 3
- **Файлы:** `P2pHistoryPanel.tsx`, local NDJSON или settings  
- **Проверка:** последние 20 relay в UI


**89 · S · Масштаб шрифта UI** — уровень 3
- **Цель:** `uiFontScale: 0.9 | 1 | 1.1 | 1.25` в настройках → `document.documentElement.style.fontSize`  
- **Файлы:** `PerformanceTab.tsx`, `settings.ts`, `App.tsx`  
- **Действие:** select в PerformanceTab; применение при загрузке  
- **Проверка:** 1.25 — текст чата крупнее


**90 · S · Избранные чаты** — уровень 3
- **Цель:** звезда ⭐ на чате → секция «Избранное» вверху истории  
- **Файлы:** `SavedChat` + `chats.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** `starred?: boolean`; сортировка starred first  
- **Проверка:** избранный чат остаётся наверху


### 🟢 Уровень 4 — низкий приоритет

> Голос, рефакторинг монолитов, i18n, Docker, polish. Пункты **91–134** — когда уровни 1–3 закрыты.

**91 · M · STT — кнопка микрофона** — уровень 4
- **Цель:** диктовка в поле ввода через Web Speech API (`SpeechRecognition`)  
- **Файлы:** `app/src/components/ChatPanel/ChatInput.tsx`  
- **Действие:** кнопка 🎤 → `recognition.start()` → текст в `onInputChange`  
- **Проверка:** диктовка вставляет распознанный текст в поле


**92 · M · TTS — кнопка «Озвучить»** — уровень 4
- **Цель:** озвучка последнего ответа ассистента через `speechSynthesis`  
- **Файлы:** `app/src/components/MessageBody.tsx` (или `MessageRow.tsx`)  
- **Действие:** кнопка «🔊» на сообщении assistant → `SpeechSynthesisUtterance`  
- **Проверка:** нажатие воспроизводит текст ответа


**93 · M · Разбивка App.tsx** — уровень 4
- **Цель:** вынести layout и модалки из ~1000-строчного `App.tsx`  
- **Файлы:** `app/src/App.tsx` → `AppLayout.tsx`, `useAppModals.ts`  
- **Действие:** перенести JSX layout + state модалок без изменения поведения  
- **Проверка:** `npm run typecheck`; E2E или ручной smoke UI


**94 · M · Разбивка agent.ts** — уровень 4
- **Цель:** отделить цикл ReAct от dispatch инструментов  
- **Файлы:** `agent.ts` → `agentLoop.ts`, `agentStreamHandler.ts`  
- **Действие:** `AgentRunner.run()` делегирует в `runAgentLoop()`  
- **Проверка:** `npm run typecheck`; существующие agent-тесты зелёные


**95 · M · Хук useChatPanelState** — уровень 4
- **Цель:** сократить `ChatPanel/index.tsx` — state и refs в отдельный хук  
- **Файлы:** `app/src/components/ChatPanel/index.tsx`, `useChatPanelState.ts`  
- **Действие:** перенести useState/useRef блоки в хук; index — только композиция  
- **Проверка:** `npm run typecheck`; отправка сообщения в UI работает


**96 · M · ChatPanel: вынести MessagesPane state** — уровень 4
- **Цель:** `ChatPanelMessagesPane` + хук `useChatMessagesPane` из `index.tsx`  
- **Файлы:** `ChatPanel/index.tsx` (~980 строк)  
- **Проверка:** `index.tsx` < 600 строк


**97 · M · ChatHistoryPanel: виртуализированный список** — уровень 4
- **Цель:** JSX рендера `FlatItem` и virtualizer — в `ChatHistoryList.tsx`  
- **Файлы:** `ChatHistoryPanel.tsx` → `ChatHistoryList.tsx`  
- **Действие:** props: `items`, `activeChatId`, `onSelect`; панель — композиция + toolbar  
- **Проверка:** скролл длинной истории чатов без регрессий


**98 · M · ChatHistoryPanel: DnD и диалоги** — уровень 4
- **Цель:** drag-and-drop, Prompt/Confirm state — в `useChatHistoryDnD.ts`  
- **Файлы:** `ChatHistoryPanel.tsx`, `useChatHistoryDnD.ts`  
- **Действие:** хук возвращает handlers и dialog state; панель < 400 строк  
- **Проверка:** перетаскивание чата в папку работает


**99 · M · types.ts: доменные модули** — уровень 4
- **Цель:** разнести ~720 строк на `types/chat.ts`, `types/settings.ts`, `types/memory.ts`, `types/api.ts`  
- **Файлы:** `app/src/types/` (новая папка), `types.ts` — re-export  
- **Действие:** `CodeViperAPI` в `api.ts`; `AgentSettings` в `settings.ts`  
- **Проверка:** `npm run typecheck`; нет циклических импортов


**100 · M · agentContext: RAG-hints** — уровень 4
- **Цель:** grep-nudge и `maybeAppendRagSearchHintAfterEmptyGrep` — в `agentContextRag.ts`  
- **Файлы:** `agentContext.ts` → `agentContextRag.ts`  
- **Действие:** re-export из `agentContext.ts`  
- **Проверка:** `npm test` — существующие тесты RAG-hint зелёные


**101 · M · agentContext: preview и prepare** — уровень 4
- **Цель:** `buildAgentContextPreview`, `prepareAgentRunContext`, `summarizeChatHistory` — в `agentContextBuild.ts`  
- **Файлы:** `agentContext.ts` → `agentContextBuild.ts`  
- **Действие:** `agentContext.ts` < 150 строк, только re-export и `OllamaMessage`  
- **Проверка:** `npm run typecheck`; превью контекста в UI открывается


**102 · M · useAgentStream: обработчики событий** — уровень 4
- **Цель:** switch по `AgentStreamEvent.type` — в `agentStreamHandlers.ts`  
- **Файлы:** `useAgentStream.ts` → `agentStreamHandlers.ts`  
- **Действие:** чистые функции `(event, ctx) => partialState`; хук — подписка и setState  
- **Проверка:** `npm run typecheck`; стрим агента в UI без регрессий


**103 · M · preload: группы API** — уровень 4
- **Цель:** `codeviper` object разбить на `preload/agentApi.ts`, `preload/chatApi.ts`, `preload/fileApi.ts`  
- **Файлы:** `electron/preload/index.ts`, `electron/preload/*.ts`  
- **Действие:** `Object.assign` или spread в `contextBridge.exposeInMainWorld`  
- **Проверка:** `npm run typecheck`; `window.codeviper.*` доступен в renderer


**104 · M · agentTools/core: files / git / package** — уровень 4
- **Цель:** `FILE_TOOLS`, `GIT_TOOLS`, `PACKAGE_TOOLS` — в отдельные файлы (~200 строк каждый)  
- **Файлы:** `agentTools/core.ts` → `coreFiles.ts`, `coreGit.ts`, `corePackage.ts`; `core.ts` — сборка  
- **Действие:** `getAgentTools()` без изменений снаружи  
- **Проверка:** `npm run typecheck`; список инструментов агента тот же


**105 · M · BehaviorTab: автоматизация и git** — уровень 4
- **Цель:** вынести секции автокоммита и git-sync в `BehaviorAutomationSection.tsx`  
- **Файлы:** `BehaviorTab.tsx` (~580 строк)  
- **Проверка:** `BehaviorTab.tsx` < 350 строк


**106 · M · BehaviorTab: инструменты и промпты** — уровень 4
- **Цель:** `disabledTools`, `promptTemplates`, permissions — в `BehaviorToolsSection.tsx`  
- **Файлы:** `BehaviorTab.tsx`  
- **Проверка:** typecheck; настройки сохраняются


**107 · M · IntegrationsTab: MCP секция** — уровень 4
- **Файлы:** `IntegrationsTab.tsx` → `McpIntegrationsSection.tsx`  
- **Проверка:** MCP CRUD в UI работает


**108 · M · IntegrationsTab: P2P и webhooks** — уровень 4
- **Файлы:** `IntegrationsTab.tsx` → `P2pIntegrationsSection.tsx`, `WebhookSection.tsx`  
- **Проверка:** тумблер P2P и webhook URL сохраняются


**109 · M · vectorStore: Qdrant / Milvus** — уровень 4
- **Файлы:** `vectorStore.ts` → `qdrantStore.ts`, `milvusStore.ts`  
- **Проверка:** `search_knowledge_base` без регрессий


**110 · M · memory.ts: локальная vs контекстная сборка** — уровень 4
- **Файлы:** `memory.ts` → `memoryStore.ts`, `memoryContext.ts`  
- **Проверка:** `npm test -- memory`


**111 · M · collectiveMemorySync: pull / push** — уровень 4
- **Файлы:** `collectiveMemorySync.ts` — два модуля  
- **Проверка:** `npm test -- collectiveMemorySync`


**112 · M · agentTools/integrations: GitHub + GitLab** — уровень 4
- **Файлы:** `integrationsGitHub.ts`, `integrationsGitLab.ts`  
- **Проверка:** tool names в `AGENT_TOOL_NAMES` на месте


**113 · M · agentTools/integrations: memory + skills + web** — уровень 4
- **Файлы:** `integrationsMemory.ts`, `integrationsWeb.ts`  
- **Проверка:** typecheck


**114 · M · defaultSkills: данные в JSON** — уровень 4
- **Цель:** SKILL markdown из `resources/default-skills/*.md` вместо строк в TS  
- **Файлы:** `defaultSkills.ts`, `resources/default-skills/`  
- **Проверка:** `npm test -- defaultSkills`


**115 · M · useMessageQueue: обработчики стрима** — уровень 4
- **Файлы:** `useMessageQueue.ts` → `messageQueueHandlers.ts`  
- **Проверка:** отправка и danger-block работают


**116 · M · agentContextManager: выбор провайдера** — уровень 4
- **Файлы:** `agentContextManager.ts` (~350) → `providerResolver.ts`  
- **Проверка:** cloud/ollama routing tests


**117 · S · Режим высокой контрастности** — уровень 4
- **Цель:** класс `high-contrast` на `:root` для слабовидящих  
- **Файлы:** `styles.css`, `PerformanceTab.tsx`, `settings.ts`  
- **Действие:** тумблер + контрастные CSS-переменные  
- **Проверка:** границы панелей и кнопок заметно контрастнее


**118 · S · Цвет папки чатов** — уровень 4
- **Цель:** `ChatFolder.color?: string` — цветная полоска у заголовка папки  
- **Файлы:** `types.ts`, `chats.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** picker в контекстном меню папки  
- **Проверка:** цвет виден и сохраняется


**119 · M · Drag-drop папок в чат** — уровень 4
- **Цель:** перетаскивание директории → `@path` или attachment как у файлов  
- **Файлы:** `ChatPanel/ChatInput.tsx`, `registerFileIpc.ts`  
- **Действие:** resolve directory path; лимит вложенных файлов  
- **Проверка:** drop папки добавляет путь в чат


**120 · M · Mermaid в ответах агента** — уровень 4
- **Цель:** блоки ` ```mermaid ` рендерятся как SVG  
- **Файлы:** `MessageBody.tsx`, dependency `mermaid`  
- **Действие:** lazy import mermaid; sandboxed render  
- **Проверка:** диаграмма из примера отображается


**121 · M · E2E: дерево проекта** — уровень 4
- **Файлы:** `e2e/project-tree.test.ts`  
- **Действие:** открыть tree → клик файл  
- **Проверка:** e2e green


**122 · M · E2E: DiffPreviewModal** — уровень 4
- **Файлы:** `e2e/diff-preview.test.ts`  
- **Действие:** mock preview_edit event  
- **Проверка:** e2e green


**123 · S · Фильтр по тегам в SkillsPanel** — уровень 4
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`  
- **Действие:** теги из frontmatter SKILL.md  
- **Проверка:** фильтр по тегу работает


**124 · S · Сохранение последнего benchmark** — уровень 4
- **Файлы:** `settings.ts`, `ModelTab.tsx`  
- **Действие:** `lastBenchmark: BenchmarkResult` после прогона  
- **Проверка:** результат виден после reopen settings


**125 · S · Dependabot для npm** — уровень 4
- **Файлы:** `.github/dependabot.yml`  
- **Действие:** weekly `app/` и root  
- **Проверка:** файл валиден по schema dependabot


**126 · M · WSL: перевод путей проекта** — уровень 4
- **Цель:** `\\wsl$\...` ↔ `/mnt/...` при выборе папки на Windows  
- **Файлы:** `fsUtil.ts`, `registerFileIpc.ts`  
- **Проверка:** unit-тест path normalize


**127 · S · Long paths на Windows** — уровень 4
- **Файлы:** `package.json` build manifest / `electron-builder`  
- **Действие:** `requestedExecutionLevel` + known issue doc  
- **Проверка:** проект с путём >260 символов открывается


**128 · L · Открепить чат в отдельное окно** — уровень 4
- **Цель:** второй `BrowserWindow` с тем же chatId через IPC sync  
- **Файлы:** `index.ts`, `App.tsx`, `registerAppIpc.ts`  
- **Действие:** «Открыть в новом окне» в меню чата  
- **Проверка:** два окна — один чат синхронизирован


**129 · M · Инфраструктура i18n** — уровень 4
- **Цель:** функция `t(key)` + `locales/ru.json` (текущие строки) + `en.json`  
- **Файлы:** `app/src/i18n/index.ts`, `app/src/i18n/locales/`  
- **Действие:** React context `I18nProvider`; fallback на ключ  
- **Проверка:** `t('settings.title')` возвращает строку на обоих языках


**130 · M · Переключатель языка в настройках** — уровень 4
- **Цель:** `locale: 'ru' | 'en'` в settings + UI в BehaviorTab  
- **Файлы:** `settings.ts`, `BehaviorTab.tsx`, `App.tsx`  
- **Действие:** select «Язык»; `I18nProvider` читает settings.locale  
- **Проверка:** смена на en → хотя бы один переведённый заголовок меняется


**131 · M · i18n: строки App и шапки** — уровень 4
- **Цель:** вынести строки `App.tsx` (кнопки, заголовки панелей) в locale-файлы  
- **Файлы:** `App.tsx`, `locales/ru.json`, `locales/en.json`  
- **Действие:** заменить литералы на `t('…')`  
- **Проверка:** en locale — шапка и «Настройки» на английском


**132 · M · i18n: SettingsModal** — уровень 4
- **Цель:** перевести вкладки и подписи настроек  
- **Файлы:** `SettingsModal/*.tsx`, locale-файлы  
- **Действие:** ключи `settings.model.*`, `settings.behavior.*` и т.д.  
- **Проверка:** en locale — названия вкладок на английском


**133 · M · i18n: ChatPanel и сообщения UI** — уровень 4
- **Цель:** перевести placeholder, кнопки отправки, статус-бар  
- **Файлы:** `ChatPanel/`, `AgentStatusBar.tsx`, locale-файлы  
- **Действие:** ключи `chat.*`, `status.*`  
- **Проверка:** en locale — placeholder поля ввода на английском


**134 · M · Docker dev-окружение** — уровень 4
- **Цель:** Dockerfile Node 20 + Ollama; compose с hot reload  
- **Файлы:** `Dockerfile`, `docker-compose.yml`, `README.md`  
- **Действие:** образ + том исходников + `npm run dev`  
- **Проверка:** `docker compose up` поднимает приложение


**135 · M · find_symbol для C#** — уровень 3
- **Цель:** `find_symbol` / `find_references` для `.cs` (class/method/property)  
- **Файлы:** `symbolIndex.ts`, `agentHandlersProjectSearch.ts`  
- **Действие:** парсер C# → символы с `path:line:col`  
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.cs` файлом


**136 · M · find_symbol для PHP** — уровень 3
- **Цель:** символы для `.php` (class/function/namespace)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** расширить `walkProjectForSymbols` для `.php`  
- **Проверка:** unit-тест: `class Foo` и `function bar` находятся по имени


**137 · M · find_symbol для Kotlin** — уровень 3
- **Цель:** символы для `.kt` / `.kts` (class/fun/object)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** tree-sitter-kotlin или синтаксический обход объявлений  
- **Проверка:** unit-тест на `fun main` и `class Bar`


**138 · M · find_symbol для Swift** — уровень 3
- **Цель:** символы для `.swift` (struct/class/func)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** парсер Swift → top-level и nested объявления  
- **Проверка:** unit-тест: `struct Foo` и `func bar` находятся по имени


**139 · M · LSP для Go** — уровень 3
- **Цель:** hover и go-to-definition для `.go` через `gopls`  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** ветка выбора сервера для Go; инициализация `gopls`  
- **Проверка:** Ctrl+click на символ в `.go` → переход к определению


**140 · M · LSP для Rust** — уровень 3
- **Цель:** hover/definition для `.rs` через `rust-analyzer`  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn `rust-analyzer`; `textDocument/hover`, `textDocument/definition`  
- **Проверка:** Ctrl+click на `fn` в `.rs` → переход к определению


**141 · M · LSP для Java** — уровень 3
- **Цель:** hover/definition для `.java` через jdtls или аналог  
- **Файлы:** `lspClient.ts`  
- **Действие:** ветка Java language server; didOpen/didChange  
- **Проверка:** Ctrl+click на метод в `.java` → переход к определению


**142 · M · LSP для C#** — уровень 3
- **Цель:** hover/definition для `.cs` через OmniSharp / csharp-ls  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn C# language server по расширению `.cs`  
- **Проверка:** Ctrl+click на класс в `.cs` → переход к определению


**143 · M · LSP для PHP** — уровень 3
- **Цель:** hover/definition для `.php` через intelephense / phpactor  
- **Файлы:** `lspClient.ts`  
- **Действие:** ветка PHP language server  
- **Проверка:** Ctrl+click на `function` в `.php` → переход к определению


**144 · M · LSP для Swift** — уровень 3
- **Цель:** hover/definition для `.swift` через sourcekit-lsp  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn `sourcekit-lsp`; IPC `lsp-request`  
- **Проверка:** Ctrl+click на `func` в `.swift` → переход к определению


**145 · M · Авто-генерация UML диаграмм** — уровень 3
- **Цель:** tool `generate_uml_diagram` → Mermaid class/component diagram в чате  
- **Файлы:** `agentTools/core.ts`, `MessageBody.tsx`  
- **Действие:** анализ символов проекта → Mermaid-блок  
- **Проверка:** диаграмма рендерится в ответе агента


**146 · S · Авто-генерация диаграмм зависимостей** — уровень 3
- **Цель:** tool `generate_dependency_diagram` — граф импортов между модулями  
- **Файлы:** `agentHandlersProjectSearch.ts`, `ArchitecturePanel.tsx`  
- **Действие:** обход import/require → Mermaid graph  
- **Проверка:** диаграмма зависимостей в чате или панели


**147 · M · Авто-генерация ER-диаграмм** — уровень 3
- **Цель:** tool `generate_er_diagram` из ORM-схем / SQL / Prisma  
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectSearch.ts`  
- **Действие:** парсинг моделей → Mermaid erDiagram  
- **Проверка:** ER-диаграмма для fixture-схемы


**148 · S · Авто-генерация диаграмм классов** — уровень 3
- **Цель:** class diagram по символам TS/Java/C# проекта  
- **Файлы:** `symbolIndex.ts`, `agentTools/core.ts`  
- **Действие:** tool `generate_class_diagram` → Mermaid classDiagram  
- **Проверка:** unit-тест: fixture-классы → валидный Mermaid


**149 · M · Авто-генерация sequence-диаграмм** — уровень 3
- **Цель:** tool `generate_sequence_diagram` по вызовам между модулями  
- **Файлы:** `agentTools/core.ts`, `agentContext.ts`  
- **Действие:** статический обход call graph → Mermaid sequenceDiagram  
- **Проверка:** sequence-диаграмма в ответе агента


**150 · M · Авто-генерация диаграмм состояний** — уровень 3
- **Цель:** tool `generate_state_diagram` для state machines / reducers  
- **Файлы:** `agentTools/core.ts`  
- **Действие:** поиск enum/state → Mermaid stateDiagram-v2  
- **Проверка:** диаграмма состояний для fixture reducer


**151 · S · Авто-генерация диаграмм потоков данных** — уровень 3
- **Цель:** tool `generate_dataflow_diagram` — DFD уровня модуля  
- **Файлы:** `agentTools/core.ts`, `ArchitecturePanel.tsx`  
- **Действие:** Mermaid flowchart по IPC/HTTP/FS потокам  
- **Проверка:** DFD отображается в чате


**152 · M · Авто-генерация архитектурных отчётов** — уровень 3
- **Цель:** tool `generate_architecture_report` — MD-отчёт: модули, слои, риски  
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`  
- **Действие:** read-only сбор метрик + шаблон отчёта  
- **Проверка:** unit-тест: отчёт без write_file


**153 · S · Авто-генерация метрик проекта** — уровень 3
- **Цель:** tool `generate_project_metrics` — LOC, файлы, языки, сложность  
- **Файлы:** `agentHandlersProjectSearch.ts`, `MetricsPanel.tsx`  
- **Действие:** агрегация по дереву проекта → текст/Markdown  
- **Проверка:** метрики в чате совпадают с fixture-проектом


**154 · M · Авто-генерация отчёта по качеству кода** — уровень 3
- **Цель:** tool `generate_code_quality_report` — дубли, большие файлы, TODO, lint  
- **Файлы:** `agentTools/core.ts`, `agentTools/integrations.ts`  
- **Действие:** read-only анализ + сводка в MD  
- **Проверка:** отчёт содержит найденные проблемы из fixture


**155 · M · STT улучшенный режим (VAD + шумоподавление)** — уровень 4
- **Цель:** диктовка с voice activity detection и подавлением фонового шума  
- **Файлы:** `ChatPanel/ChatInput.tsx`, `settings.ts`  
- **Действие:** опциональный режим «Улучшенный STT»; Web Audio API или WASM-фильтр перед `SpeechRecognition`  
- **Проверка:** в шумной среде меньше ложных срабатываний; unit-тест VAD-порога


**156 · M · TTS с выбором голоса** — уровень 4
- **Цель:** выбор голоса `speechSynthesis` в настройках  
- **Файлы:** `MessageBody.tsx`, `PerformanceTab.tsx`, `settings.ts`  
- **Действие:** `ttsVoiceUri?: string`; select из `getVoices()`  
- **Проверка:** озвучка использует выбранный голос после reopen settings


**157 · S · Авто-озвучка ошибок агента** — уровень 4
- **Цель:** при ошибке прогона — краткое TTS-уведомление  
- **Файлы:** `useAgentStream.ts`, `settings.ts`  
- **Действие:** тумблер `autoSpeakErrors`; `speechSynthesis` на `agent-stream` error  
- **Проверка:** при mock-ошибке слышен короткий сигнал/фраза


**158 · S · Авто-озвучка успешного завершения** — уровень 4
- **Цель:** TTS «Готово» при `stop_reason` без ошибки  
- **Файлы:** `useAgentStream.ts`, `AgentStatusBar.tsx`, `settings.ts`  
- **Действие:** тумблер `autoSpeakDone`; озвучка только если вкладка не в фокусе (опционально)  
- **Проверка:** успешный прогон → озвучка при включённой настройке


**159 · M · Docker-режим для агента** — уровень 4
- **Цель:** изолированный прогон shell-команд в контейнере проекта  
- **Файлы:** `commandRunner.ts`, `agentHandlersProjectTerminal.ts`, `settings.ts`  
- **Действие:** `dockerAgentMode?: boolean`; `run_command` → `docker run` с mount projectPath  
- **Проверка:** команда выполняется в контейнере; хост не затронут


**160 · M · Авто-сборка Docker-образов проекта** — уровень 4
- **Цель:** tool `build_docker_image` — `docker build` с валидацией Dockerfile  
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`, `commandRunner.ts`  
- **Действие:** параметры `tag?`, `context?`; блок опасных флагов  
- **Проверка:** unit-тест: mock docker → успешный build


**161 · S · Авто-публикация Docker-образов** — уровень 4
- **Цель:** tool `publish_docker_image` — push в registry  
- **Файлы:** `agentTools/integrations.ts`, `commandRunner.ts`  
- **Действие:** `docker push` после login; требует подтверждения в ask-mode  
- **Проверка:** mock: push вызывается с правильным tag


**162 · M · Авто-деплой на сервер** — уровень 4
- **Цель:** tool `deploy_to_server` — SSH/rsync или scp артефактов  
- **Файлы:** `agentTools/integrations.ts`, `settings.ts`  
- **Действие:** параметры host, path, key; лимит команд  
- **Проверка:** unit-тест с mock SSH; без реального деплоя в CI


**163 · S · Авто-деплой на Vercel/Netlify** — уровень 4
- **Цель:** tool `deploy_vercel` / `deploy_netlify` через CLI или API  
- **Файлы:** `agentTools/integrations.ts`, `IntegrationsTab.tsx`  
- **Действие:** token в settings; preview vs production  
- **Проверка:** mock API → URL деплоя в ответе агента


**164 · M · Авто-деплой на Kubernetes** — уровень 4
- **Цель:** tool `deploy_kubernetes` — `kubectl apply` манифестов проекта  
- **Файлы:** `agentTools/integrations.ts`, `commandRunner.ts`  
- **Действие:** dry-run по умолчанию; `--context` из settings  
- **Проверка:** unit-тест: `kubectl apply --dry-run=client` парсится


**165 · S · Авто-генерация Helm-чартов** — уровень 4
- **Цель:** tool `generate_helm_chart` — Chart.yaml + templates из Dockerfile/compose  
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectFile.ts`  
- **Действие:** шаблон chart в `charts/<name>/`  
- **Проверка:** `helm template` на сгенерированном chart без ошибок


**166 · M · Авто-генерация Terraform-конфигов** — уровень 4
- **Цель:** tool `generate_terraform` — main.tf + variables для типового стека  
- **Файлы:** `agentTools/core.ts`  
- **Действие:** провайдер AWS/GCP/Azure по выбору; без секретов в файлах  
- **Проверка:** `terraform validate` на fixture-конфиге


**167 · S · Авто-генерация Ansible-ролей** — уровень 4
- **Цель:** tool `generate_ansible_role` — tasks/handlers/templates  
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectFile.ts`  
- **Действие:** роль в `ansible/roles/<name>/`  
- **Проверка:** `ansible-playbook --syntax-check` на playbook


**168 · M · Авто-генерация CI/CD pipelines** — уровень 4
- **Цель:** tool `generate_cicd_pipeline` — универсальный шаблон под стек проекта  
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectSearch.ts`  
- **Действие:** detect npm/go/rust → соответствующий pipeline YAML  
- **Проверка:** сгенерированный YAML валиден по schema CI платформы


**169 · S · Авто-генерация GitHub Actions** — уровень 4
- **Цель:** tool `generate_github_actions` → `.github/workflows/ci.yml`  
- **Файлы:** `agentTools/integrations.ts`, `agentHandlersProjectFile.ts`  
- **Действие:** typecheck + test + build по обнаруженным скриптам package.json  
- **Проверка:** workflow YAML парсится; шаги совпадают с `npm run test`


**170 · S · Авто-генерация GitLab CI** — уровень 4
- **Цель:** tool `generate_gitlab_ci` → `.gitlab-ci.yml`  
- **Файлы:** `agentTools/integrations.ts`  
- **Действие:** stages build/test/deploy из шаблона  
- **Проверка:** fixture `.gitlab-ci.yml` проходит lint CI


**171 · S · Авто-генерация Azure Pipelines** — уровень 4
- **Цель:** tool `generate_azure_pipelines` → `azure-pipelines.yml`  
- **Файлы:** `agentTools/integrations.ts`  
- **Действие:** pool vmImage + steps npm/ci  
- **Проверка:** YAML валиден по Azure schema


**172 · S · Авто-генерация Bitbucket Pipelines** — уровень 4
- **Цель:** tool `generate_bitbucket_pipelines` → `bitbucket-pipelines.yml`  
- **Файлы:** `agentTools/integrations.ts`  
- **Действие:** image node + script steps  
- **Проверка:** сгенерированный файл валиден


**173 · M · Авто-генерация release-notes** — уровень 4
- **Цель:** tool `generate_release_notes` — MD из git log между тегами  
- **Файлы:** `agentTools/integrations.ts`, `gitTools.ts`  
- **Действие:** `git log vA..vB --pretty`; группировка feat/fix/breaking  
- **Проверка:** unit-тест на fixture git history → RELEASE_NOTES.md


**174 · M · Subagent Refactorer — автоматический рефакторинг** — уровень 2
- **Цель:** read-only анализ + предложения по рефакторингу крупных модулей  
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`  
- **Действие:** tool `delegate_to_refactorer`  
- **Проверка:** unit-тест: отчёт без write_file


**175 · M · Авто-генерация Roadmap Chains** — уровень 2
- **Цель:** tool `generate_roadmap_chain` → объединение связанных пунктов  
- **Файлы:** `agentTools/mcp.ts`  
- **Действие:** цепочка из 3–5 пунктов  
- **Проверка:** chain отображается в UI


**176 · S · Авто-обнаружение «мертвого кода»** — уровень 3
- **Цель:** tool `find_dead_code`  
- **Файлы:** `agentTools/core.ts`  
- **Действие:** анализ AST  
- **Проверка:** отчёт в чате


**177 · M · Авто-обнаружение дублирующихся функций** — уровень 3
- **Цель:** tool `find_duplicate_functions`  
- **Файлы:** `agentTools/core.ts`  
- **Действие:** поиск похожих AST  
- **Проверка:** список дубликатов


**178 · S · Авто-обнаружение «магических чисел»** — уровень 3
- **Цель:** tool `find_magic_numbers`  
- **Файлы:** `agentTools/core.ts`  
- **Действие:** поиск литералов  
- **Проверка:** отчёт в чате


**179 · M · Авто-обнаружение неиспользуемых зависимостей** — уровень 3
- **Цель:** tool `find_unused_dependencies`  
- **Файлы:** `agentHandlersProjectTerminal.ts`  
- **Действие:** анализ import graph  
- **Проверка:** список зависимостей


**180 · M · Авто-обнаружение устаревших API** — уровень 3
- **Цель:** tool `find_deprecated_api`  
- **Файлы:** `agentTools/integrations.ts`  
- **Действие:** проверка по базе API  
- **Проверка:** отчёт


**181 · S · Авто-обнаружение небезопасных регулярных выражений** — уровень 3
- **Цель:** tool `find_unsafe_regex`  
- **Файлы:** `agentTools/core.ts`  
- **Действие:** поиск catastrophic backtracking  
- **Проверка:** отчёт


**182 · M · Авто-обнаружение потенциальных утечек памяти** — уровень 3
- **Цель:** tool `find_memory_leaks`  
- **Файлы:** `agentTools/core.ts`  
- **Действие:** анализ JS/TS паттернов  
- **Проверка:** отчёт


**183 · M · Авто-обнаружение неправильных async-паттернов** — уровень 3
- **Цель:** tool `find_async_issues`  
- **Файлы:** `agentTools/core.ts`  
- **Действие:** поиск забытых await  
- **Проверка:** отчёт


**184 · S · Авто-обнаружение неправильных типов** — уровень 3
- **Цель:** tool `find_type_mismatches`  
- **Файлы:** `agentTools/core.ts`  
- **Действие:** анализ TS типов  
- **Проверка:** отчёт


**185 · M · Авто-обнаружение циклов в логике** — уровень 3
- **Цель:** tool `find_logic_cycles`  
- **Файлы:** `agentTools/core.ts`  
- **Действие:** анализ CFG  
- **Проверка:** отчёт


**186 · M · Авто-обнаружение неэффективных структур данных** — уровень 3
- **Цель:** tool `find_data_structure_issues`  
- **Файлы:** `agentTools/core.ts`  
- **Действие:** анализ AST  
- **Проверка:** отчёт


**187 · S · Авто-обнаружение неправильных импортов** — уровень 3
- **Цель:** tool `find_import_issues`  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** поиск несуществующих путей  
- **Проверка:** отчёт


**188 · M · Авто-обнаружение неправильных путей в UI** — уровень 3
- **Цель:** tool `find_ui_path_issues`  
- **Файлы:** `app/src/components/*`  
- **Действие:** анализ JSX  
- **Проверка:** отчёт


**189 · M · Авто-обнаружение неправильных IPC вызовов** — уровень 3
- **Цель:** tool `find_ipc_mismatches`  
- **Файлы:** `register*Ipc.ts`  
- **Действие:** проверка схем  
- **Проверка:** отчёт


**190 · S · Авто-обнаружение неправильных hotkeys** — уровень 3
- **Цель:** tool `find_hotkey_conflicts`  
- **Файлы:** `App.tsx`  
- **Действие:** поиск конфликтов  
- **Проверка:** отчёт


**191 · M · Авто-обнаружение неправильных настроек** — уровень 3
- **Цель:** tool `find_settings_issues`  
- **Файлы:** `settings.ts`  
- **Действие:** проверка схем  
- **Проверка:** отчёт


**192 · M · Авто-обнаружение неправильных тем UI** — уровень 3
- **Цель:** tool `find_theme_issues`  
- **Файлы:** `styles.css`  
- **Действие:** анализ CSS  
- **Проверка:** отчёт


**193 · M · find_symbol для Scala** — уровень 3
- **Цель:** `find_symbol` / `find_references` для `.scala` (class/object/trait/def)  
- **Файлы:** `symbolIndex.ts`, `agentHandlersProjectSearch.ts`  
- **Действие:** парсер Scala → символы с `path:line:col`  
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.scala` файлом


**194 · M · find_symbol для Elixir** — уровень 3
- **Цель:** символы для `.ex` / `.exs` (defmodule/def)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** расширить `walkProjectForSymbols` для Elixir  
- **Проверка:** unit-тест: `defmodule Foo` и `def bar` находятся по имени


**195 · M · find_symbol для Haskell** — уровень 3
- **Цель:** символы для `.hs` (module/data/type/function)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** синтаксический обход объявлений top-level  
- **Проверка:** unit-тест: `main` и `data Foo` находятся по имени


**196 · M · find_symbol для OCaml** — уровень 3
- **Цель:** символы для `.ml` / `.mli` (module/type/let)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** парсер OCaml → объявления с позицией  
- **Проверка:** unit-тест на `let foo` и `module Bar`


**197 · M · find_symbol для Lua** — уровень 3
- **Цель:** символы для `.lua` (function/local)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** regex или tree-sitter-lua для объявлений  
- **Проверка:** unit-тест: `function foo` находится по имени


**198 · M · find_symbol для Perl** — уровень 3
- **Цель:** символы для `.pl` / `.pm` (package/sub)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход `package` / `sub` объявлений  
- **Проверка:** unit-тест: `sub foo` в `.pm` находится по имени


**199 · M · find_symbol для R** — уровень 3
- **Цель:** символы для `.r` / `.R` (function/assignment)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** парсер R → top-level bindings  
- **Проверка:** unit-тест: `foo <- function` находится по имени


**200 · M · find_symbol для MATLAB** — уровень 3
- **Цель:** символы для `.m` (function/class)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** regex для `function` / `classdef`  
- **Проверка:** unit-тест: `function foo` находится по имени


**201 · M · find_symbol для Julia** — уровень 3
- **Цель:** символы для `.jl` (function/struct/module)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход объявлений Julia  
- **Проверка:** unit-тест: `function foo` и `struct Bar` находятся по имени


**202 · M · find_symbol для Shell-скриптов** — уровень 3
- **Цель:** символы для `.sh` / `.bash` (function)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** поиск `function name` / `name()`  
- **Проверка:** unit-тест: shell-функция находится по имени


**203 · M · LSP для Scala** — уровень 3
- **Цель:** hover и go-to-definition для `.scala` через Metals  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn Metals; `textDocument/hover`, `textDocument/definition`  
- **Проверка:** Ctrl+click на символ в `.scala` → переход к определению


**204 · M · LSP для Elixir** — уровень 3
- **Цель:** hover/definition для `.ex` через elixir-ls  
- **Файлы:** `lspClient.ts`  
- **Действие:** ветка Elixir language server  
- **Проверка:** Ctrl+click на `def` в `.ex` → переход к определению


**205 · M · LSP для Haskell** — уровень 3
- **Цель:** hover/definition для `.hs` через haskell-language-server  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn HLS по расширению `.hs`  
- **Проверка:** Ctrl+click на функцию в `.hs` → переход к определению


**206 · M · LSP для OCaml** — уровень 3
- **Цель:** hover/definition для `.ml` через ocaml-lsp  
- **Файлы:** `lspClient.ts`  
- **Действие:** инициализация ocaml-lsp; didOpen/didChange  
- **Проверка:** Ctrl+click на `let` в `.ml` → переход к определению


**207 · M · LSP для Lua** — уровень 3
- **Цель:** hover/definition для `.lua` через lua-language-server  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn lua-language-server  
- **Проверка:** Ctrl+click на `function` в `.lua` → переход к определению


**208 · M · LSP для Perl** — уровень 3
- **Цель:** hover/definition для `.pl` / `.pm` через Perl::LanguageServer или аналог  
- **Файлы:** `lspClient.ts`  
- **Действие:** ветка Perl language server  
- **Проверка:** Ctrl+click на `sub` в `.pm` → переход к определению


**209 · M · LSP для R** — уровень 3
- **Цель:** hover/definition для `.r` через languageserver (R)  
- **Файлы:** `lspClient.ts`  
- **Действие:** spawn R languageserver  
- **Проверка:** Ctrl+click на функцию в `.R` → переход к определению


**210 · M · LSP для MATLAB** — уровень 3
- **Цель:** hover/definition для `.m` через MATLAB Language Server (если установлен)  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** опциональный spawn; graceful fallback если сервер недоступен  
- **Проверка:** при наличии LSP — Ctrl+click на `function` в `.m` работает


**211 · M · LSP для Julia** — уровень 3
- **Цель:** hover/definition для `.jl` через LanguageServer.jl  
- **Файлы:** `lspClient.ts`  
- **Действие:** spawn julia + LanguageServer  
- **Проверка:** Ctrl+click на `function` в `.jl` → переход к определению


**212 · M · LSP для Shell-скриптов** — уровень 3
- **Цель:** hover/definition для `.sh` через bash-language-server  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn bash-language-server; shellcheck diagnostics (опционально)  
- **Проверка:** Ctrl+click на shell-функцию → переход к определению
