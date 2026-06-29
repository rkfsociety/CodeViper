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

**Правила:** пункты **1…514**; внутри цепочки — строго по порядку.

## 📋 В планах

> Пункты **1…514**. Цепочки 🔗 — строгий порядок внутри группы: split/preview (готово), plan **10–11**, onboarding **12–14**, редактор **24–25**, worktree **49–51**, LSP **73–75**, i18n **129–133**.

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


**213 · M · Авто-генерация аудио-версии README** — уровень 4
- **Цель:** tool `generate_readme_audio` — TTS-озвучка README.md  
- **Файлы:** `agentTools/integrations.ts`, `MessageBody.tsx`  
- **Действие:** MD → текст без разметки → `speechSynthesis` или внешний TTS API; сохранение `.mp3`/`.wav`  
- **Проверка:** аудиофайл создаётся и воспроизводится


**214 · S · Авто-генерация аудио-версии CHANGELOG** — уровень 4
- **Цель:** tool `generate_changelog_audio` — озвучка CHANGELOG.md  
- **Файлы:** `agentTools/integrations.ts`  
- **Действие:** парсинг секций CHANGELOG → TTS по релизам  
- **Проверка:** аудио соответствует тексту fixture CHANGELOG


**215 · M · Авто-генерация видео-обзора проекта** — уровень 4
- **Цель:** tool `generate_project_video` — скринкаст + TTS по README  
- **Файлы:** `agentTools/integrations.ts`, `commandRunner.ts`  
- **Действие:** ffmpeg + скриншоты UI; опционально Playwright record  
- **Проверка:** `.mp4` создаётся из fixture-проекта (mock ffmpeg в unit-тесте)


**216 · S · Авто-генерация GIF-демонстраций** — уровень 4
- **Цель:** tool `generate_demo_gif` — короткая GIF из сценария UI  
- **Файлы:** `agentTools/integrations.ts`, `docs/demos.md`  
- **Действие:** Playwright/Puppeteer capture → gifencoder или ffmpeg  
- **Проверка:** GIF в `docs/` открывается в браузере


**217 · M · Авто-генерация UI-скриншотов** — уровень 4
- **Цель:** tool `generate_ui_screenshots` — снимки ключевых экранов  
- **Файлы:** `agentTools/integrations.ts`, `e2e/`  
- **Действие:** E2E-сценарий → PNG в `docs/screenshots/`  
- **Проверка:** скриншоты совпадают с baseline (pixel diff tolerance)


**218 · S · Авто-генерация UI-тестов** — уровень 4
- **Цель:** tool `generate_ui_tests` — Playwright spec из описания сценария  
- **Файлы:** `agentTools/core.ts`, `e2e/`  
- **Действие:** промпт → `*.spec.ts`; шаблон smoke  
- **Проверка:** сгенерированный тест компилируется; `npm run test:e2e` — зелёный на mock


**219 · M · Авто-генерация UX-отчётов** — уровень 4
- **Цель:** tool `generate_ux_report` — эвристики UX по UI-компонентам  
- **Файлы:** `agentTools/core.ts`, `app/src/components/`  
- **Действие:** read-only: кнопки без label, контраст, размер touch-target  
- **Проверка:** отчёт в MD без write_file


**220 · S · Авто-генерация accessibility-отчётов** — уровень 4
- **Цель:** tool `generate_a11y_report` — axe-core / эвристики a11y  
- **Файлы:** `agentTools/integrations.ts`, `e2e/`  
- **Действие:** статический обход JSX + опционально axe в E2E  
- **Проверка:** отчёт содержит найденные a11y-проблемы из fixture


**221 · M · Авто-генерация цветовых тем** — уровень 4
- **Цель:** tool `generate_color_theme` — CSS-переменные из палитры/бренда  
- **Файлы:** `styles.css`, `PerformanceTab.tsx`, `settings.ts`  
- **Действие:** генерация `:root` theme block; preview в UI  
- **Проверка:** тема применяется без поломки контраста основных панелей


**222 · S · Авто-генерация иконок** — уровень 4
- **Цель:** tool `generate_icons` — SVG/PNG иконки для UI  
- **Файлы:** `agentTools/integrations.ts`, `app/resources/`  
- **Действие:** prompt → SVG; размеры 16/24/32  
- **Проверка:** иконки валидный SVG; отображаются в UI


**223 · M · Авто-генерация логотипов** — уровень 4
- **Цель:** tool `generate_logo` — логотип проекта (SVG)  
- **Файлы:** `agentTools/integrations.ts`, `README.md`  
- **Действие:** генерация SVG + опционально PNG; не перезаписывать без подтверждения  
- **Проверка:** SVG открывается; README может ссылаться на файл


**224 · S · Авто-генерация splash-screen** — уровень 4
- **Цель:** splash при старте Electron из сгенерированного asset  
- **Файлы:** `index.ts`, `agentTools/integrations.ts`, `app/resources/`  
- **Действие:** PNG/SVG splash; `BrowserWindow` splash option  
- **Проверка:** при запуске виден splash до ready-to-show


**225 · M · Авто-генерация маркетинговых материалов** — уровень 4
- **Цель:** tool `generate_marketing_assets` — баннеры, тексты для соцсетей  
- **Файлы:** `agentTools/integrations.ts`, `docs/`  
- **Действие:** MD + PNG шаблоны из README/features  
- **Проверка:** пакет файлов в `docs/marketing/`


**226 · S · Авто-генерация релизных баннеров** — уровень 4
- **Цель:** tool `generate_release_banner` — изображение к тегу `vX.Y.Z`  
- **Файлы:** `agentTools/integrations.ts`, `gitTools.ts`  
- **Действие:** CHANGELOG summary → баннер PNG/SVG  
- **Проверка:** баннер для fixture-тега создаётся


**227 · M · Авто-генерация документации для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_docs` — MD из схемы plugin tool  
- **Файлы:** `agentTools/core.ts`, `docs/plugin-authoring.md`  
- **Действие:** scan plugins dir → API reference  
- **Проверка:** документация покрывает fixture-плагин


**228 · S · Авто-генерация примеров для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_examples` — working `.js` примеры  
- **Файлы:** `docs/plugin-authoring.md`, `agentHandlersProjectFile.ts`  
- **Действие:** шаблон plugin + sample tool handler  
- **Проверка:** пример загружается hot-reload без ошибок


**229 · M · Авто-генерация обучающих материалов** — уровень 4
- **Цель:** tool `generate_tutorial` — пошаговый tutorial MD из структуры проекта  
- **Файлы:** `agentTools/integrations.ts`, `docs/`  
- **Действие:** оглавление + шаги + code snippets  
- **Проверка:** tutorial читается; ссылки на файлы валидны


**230 · S · Авто-генерация FAQ** — уровень 4
- **Цель:** tool `generate_faq` — FAQ.md из issues/traces/частых вопросов  
- **Файлы:** `agentTools/integrations.ts`, `docs/troubleshooting.md`  
- **Действие:** агрегация → Q/A секции  
- **Проверка:** FAQ.md создан; минимум 5 пар Q/A


**231 · M · Авто-генерация руководства пользователя** — уровень 4
- **Цель:** tool `generate_user_guide` — полное user guide из UI и вики  
- **Файлы:** `agentTools/integrations.ts`, `docs/`  
- **Действие:** разделы: установка, чат, настройки, интеграции  
- **Проверка:** `docs/user-guide.md` покрывает основные сценарии


**232 · S · Авто-генерация руководства разработчика** — уровень 4
- **Цель:** tool `generate_dev_guide` — CONTRIBUTING + architecture summary  
- **Файлы:** `agentTools/integrations.ts`, `CONTRIBUTING.md`  
- **Действие:** из `CLAUDE.md`/структуры repo → dev guide MD  
- **Проверка:** guide содержит команды typecheck/build/test из `app/`

**233 · M · Subagent Performance — анализ производительности проекта** — уровень 2
- **Цель:** выявлять медленные функции, тяжёлые модули, узкие места
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`
- **Действие:** tool `delegate_to_performance`
- **Проверка:** отчёт без write_file


**234 · M · Авто-оптимизация импортов** — уровень 3
- **Цель:** заменять `import *` на точечные импорты
- **Файлы:** `agentTools/core.ts`
- **Действие:** анализ AST
- **Проверка:** отчёт


**235 · S · Авто-обнаружение «тяжёлых» зависимостей** — уровень 3
- **Цель:** находить пакеты >1MB
- **Файлы:** `agentHandlersProjectTerminal.ts`
- **Действие:** анализ node_modules
- **Проверка:** список


**236 · M · Авто-обнаружение неправильных путей в тестах** — уровень 3
- **Цель:** находить тесты, которые не соответствуют структуре проекта
- **Файлы:** `agentHandlersProjectFile.ts`
- **Действие:** анализ путей
- **Проверка:** отчёт


**237 · S · Авто-обнаружение пропущенных тестов** — уровень 3
- **Цель:** находить файлы без тестов
- **Файлы:** `agentTools/core.ts`
- **Действие:** поиск по дереву
- **Проверка:** список


**238 · M · Авто-обнаружение неправильных типов в UI** — уровень 3
- **Цель:** проверка props компонентов
- **Файлы:** `app/src/components/*`
- **Действие:** анализ TS типов
- **Проверка:** отчёт


**239 · M · Авто-обнаружение неправильных ключей React** — уровень 3
- **Цель:** находить отсутствующие `key` в списках
- **Файлы:** `MessageRow.tsx`, `ChatPanel.tsx`
- **Действие:** анализ JSX
- **Проверка:** отчёт


**240 · S · Авто-обнаружение лишних ререндеров** — уровень 3
- **Цель:** находить компоненты без мемоизации
- **Файлы:** `app/src/components/*`
- **Действие:** анализ React hooks
- **Проверка:** отчёт


**241 · M · Авто-обнаружение неправильных зависимостей useEffect** — уровень 3
- **Цель:** находить пропущенные зависимости
- **Файлы:** `app/src/components/*`
- **Действие:** анализ AST
- **Проверка:** отчёт


**242 · M · Авто-обнаружение неправильных IPC-ответов** — уровень 3
- **Цель:** проверка схем IPC
- **Файлы:** `register*Ipc.ts`
- **Действие:** сравнение с Zod
- **Проверка:** отчёт


**243 · S · Авто-обнаружение неправильных путей в settings.json** — уровень 3
- **Цель:** проверка валидности путей
- **Файлы:** `settings.ts`
- **Действие:** проверка существования
- **Проверка:** отчёт


**244 · M · Авто-обнаружение неправильных тем в CSS** — уровень 3
- **Цель:** находить конфликтующие цвета
- **Файлы:** `styles.css`
- **Действие:** анализ CSS
- **Проверка:** отчёт


**245 · M · Авто-обнаружение неправильных шрифтов** — уровень 3
- **Цель:** проверка доступности шрифтов
- **Файлы:** `styles.css`
- **Действие:** анализ `font-family`
- **Проверка:** отчёт


**246 · S · Авто-обнаружение неправильных aria-атрибутов** — уровень 3
- **Цель:** проверка доступности
- **Файлы:** `MessageBody.tsx`, `App.tsx`
- **Действие:** анализ JSX
- **Проверка:** отчёт


**247 · M · Авто-обнаружение неправильных hotkeys в модалках** — уровень 3
- **Цель:** проверка конфликтов
- **Файлы:** `SettingsModal/*`
- **Действие:** анализ keydown
- **Проверка:** отчёт


**248 · M · Авто-обнаружение неправильных размеров файлов** — уровень 3
- **Цель:** находить файлы >500KB
- **Файлы:** `agentHandlersProjectFile.ts`
- **Действие:** анализ размера
- **Проверка:** отчёт


**249 · S · Авто-обнаружение неправильных путей в интеграциях** — уровень 3
- **Цель:** проверка GitHub/GitLab/Jira путей
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** проверка URL
- **Проверка:** отчёт


**250 · M · Авто-обнаружение неправильных токенов интеграций** — уровень 3
- **Цель:** проверка формата токенов
- **Файлы:** `settings.ts`
- **Действие:** regex
- **Проверка:** отчёт


**251 · S · Авто-обнаружение неправильных cron-выражений** — уровень 3
- **Цель:** проверка `AutomationRule`
- **Файлы:** `automationScheduler.ts`
- **Действие:** parse cron
- **Проверка:** отчёт


**252 · M · Авто-обнаружение неправильных worktree путей** — уровень 3
- **Цель:** проверка `worktreePath`
- **Файлы:** `gitWorktree.ts`
- **Действие:** проверка существования
- **Проверка:** отчёт


**253 · M · Авто-обнаружение неправильных веток Git** — уровень 3
- **Цель:** проверка branch names
- **Файлы:** `gitTools.ts`
- **Действие:** regex
- **Проверка:** отчёт


**254 · S · Авто-обнаружение неправильных merge-конфликтов** — уровень 3
- **Цель:** поиск `<<<<<<<`
- **Файлы:** `agentHandlersProjectFile.ts`
- **Действие:** grep
- **Проверка:** отчёт


**255 · M · Авто-обнаружение неправильных PR описаний** — уровень 3
- **Цель:** проверка шаблонов PR
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** анализ текста
- **Проверка:** отчёт


**256 · S · Авто-обнаружение неправильных commit-сообщений** — уровень 3
- **Цель:** проверка conventional commits
- **Файлы:** `gitTools.ts`
- **Действие:** regex
- **Проверка:** отчёт


**257 · M · Авто-обнаружение неправильных веток CI** — уровень 3
- **Цель:** проверка workflows
- **Файлы:** `.github/workflows/*`
- **Действие:** анализ YAML
- **Проверка:** отчёт


**258 · M · Авто-обнаружение неправильных зависимостей CI** — уровень 3
- **Цель:** проверка actions
- **Файлы:** `.github/workflows/*`
- **Действие:** анализ версий
- **Проверка:** отчёт


**259 · S · Авто-обнаружение неправильных Docker-портов** — уровень 3
- **Цель:** проверка портов
- **Файлы:** `docker-compose.yml`
- **Действие:** анализ YAML
- **Проверка:** отчёт


**260 · M · Авто-обнаружение неправильных Docker-volumes** — уровень 3
- **Цель:** проверка volumes
- **Файлы:** `docker-compose.yml`
- **Действие:** анализ YAML
- **Проверка:** отчёт


**261 · S · Авто-обнаружение неправильных Docker-env** — уровень 3
- **Цель:** проверка env
- **Файлы:** `.env`
- **Действие:** анализ
- **Проверка:** отчёт


**262 · M · Авто-обнаружение неправильных P2P-узлов** — уровень 3
- **Цель:** проверка узлов
- **Файлы:** `server/p2p/router.ts`
- **Действие:** анализ latency
- **Проверка:** отчёт


**263 · S · Авто-обнаружение неправильных P2P-кредитов** — уровень 3
- **Цель:** проверка кредитов
- **Файлы:** `server/p2p/credits.ts`
- **Действие:** анализ
- **Проверка:** отчёт


**264 · M · Авто-обнаружение неправильных P2P-маршрутов** — уровень 3
- **Цель:** проверка маршрутизации
- **Файлы:** `server/p2p/router.ts`
- **Действие:** анализ
- **Проверка:** отчёт


**265 · S · Авто-обнаружение неправильных P2P-подключений** — уровень 3
- **Цель:** проверка WSS
- **Файлы:** `p2pClient.ts`
- **Действие:** анализ
- **Проверка:** отчёт


**266 · M · Авто-обнаружение неправильных плагинов** — уровень 3
- **Цель:** проверка plugin API
- **Файлы:** `docs/plugin-authoring.md`, `plugins/*`
- **Действие:** анализ
- **Проверка:** отчёт


**267 · S · Авто-обнаружение неправильных skill-файлов** — уровень 3
- **Цель:** проверка SKILL.md
- **Файлы:** `skills.ts`
- **Действие:** анализ
- **Проверка:** отчёт


**268 · M · Авто-обнаружение неправильных RAG-индексов** — уровень 3
- **Цель:** проверка Qdrant/Milvus
- **Файлы:** `rag.ts`
- **Действие:** анализ
- **Проверка:** отчёт


**269 · S · Авто-обнаружение неправильных символьных индексов** — уровень 3
- **Цель:** проверка ts/js/py
- **Файлы:** `symbolIndex.ts`
- **Действие:** анализ
- **Проверка:** отчёт


**270 · M · Авто-обнаружение неправильных fallback-моделей** — уровень 3
- **Цель:** проверка `fallbackModels[]`
- **Файлы:** `BehaviorTab.tsx`, `settings.ts`
- **Действие:** анализ
- **Проверка:** отчёт


**271 · S · Авто-обнаружение неправильных prompt-templates** — уровень 3
- **Цель:** проверка шаблонов
- **Файлы:** `docs/example-prompts.md`
- **Действие:** анализ
- **Проверка:** отчёт


**272 · M · Авто-обнаружение неправильных onboarding-шагов** — уровень 3
- **Цель:** проверка визарда
- **Файлы:** `OnboardingWizard.tsx`
- **Действие:** анализ
- **Проверка:** отчёт


**273 · S · Авто-обнаружение неправильных toast-уведомлений** — уровень 3
- **Цель:** проверка уведомлений
- **Файлы:** `App.tsx`
- **Действие:** анализ
- **Проверка:** отчёт


**274 · M · Авто-обнаружение неправильных trace-панелей** — уровень 3
- **Цель:** проверка TracePanel
- **Файлы:** `TracePanel.tsx`
- **Действие:** анализ
- **Проверка:** отчёт

**275 · M · find_symbol для COBOL** — уровень 3
- **Цель:** `find_symbol` / `find_references` для `.cob` / `.cbl` (program/paragraph)  
- **Файлы:** `symbolIndex.ts`, `agentHandlersProjectSearch.ts`  
- **Действие:** парсер COBOL → символы с `path:line:col`  
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.cob` файлом


**276 · M · find_symbol для Fortran** — уровень 3
- **Цель:** символы для `.f` / `.f90` (subroutine/function/module)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** расширить `walkProjectForSymbols` для Fortran  
- **Проверка:** unit-тест: `subroutine foo` находится по имени


**277 · M · find_symbol для Erlang** — уровень 3
- **Цель:** символы для `.erl` / `.hrl` (module/function)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход `-module` / `-export` объявлений  
- **Проверка:** unit-тест: `foo()` в `.erl` находится по имени


**278 · M · find_symbol для F#** — уровень 3
- **Цель:** символы для `.fs` / `.fsx` (module/let/type)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** синтаксический обход объявлений F#  
- **Проверка:** unit-тест: `let foo` и `type Bar` находятся по имени


**279 · M · find_symbol для Prolog** — уровень 3
- **Цель:** символы для `.pl` / `.pro` (predicate)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** regex для `name(` предикатов  
- **Проверка:** unit-тест: предикат находится по имени


**280 · M · find_symbol для Scheme** — уровень 3
- **Цель:** символы для `.scm` / `.ss` (define/lambda)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход `(define` форм  
- **Проверка:** unit-тест: `(define foo` находится по имени


**281 · M · find_symbol для Lisp** — уровень 3
- **Цель:** символы для `.lisp` / `.cl` (defun/defclass)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход Common Lisp объявлений  
- **Проверка:** unit-тест: `defun foo` находится по имени


**282 · M · find_symbol для Solidity** — уровень 3
- **Цель:** символы для `.sol` (contract/function/event)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** парсер Solidity → объявления с позицией  
- **Проверка:** unit-тест: `contract Foo` и `function bar` находятся по имени


**283 · M · find_symbol для VHDL** — уровень 3
- **Цель:** символы для `.vhd` / `.vhdl` (entity/architecture)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** regex для `entity` / `architecture`  
- **Проверка:** unit-тест: entity находится по имени


**284 · M · find_symbol для Verilog** — уровень 3
- **Цель:** символы для `.v` / `.sv` (module)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход `module` объявлений  
- **Проверка:** unit-тест: `module foo` находится по имени


**285 · M · LSP для COBOL** — уровень 3
- **Цель:** hover и go-to-definition для COBOL через language server (если установлен)  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** опциональный spawn; graceful fallback  
- **Проверка:** при наличии LSP — переход к определению в `.cob`


**286 · M · LSP для Fortran** — уровень 3
- **Цель:** hover/definition для `.f90` через fortls или аналог  
- **Файлы:** `lspClient.ts`  
- **Действие:** ветка Fortran language server  
- **Проверка:** Ctrl+click на subroutine → переход к определению


**287 · M · LSP для Erlang** — уровень 3
- **Цель:** hover/definition для `.erl` через erlang_ls  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn erlang_ls  
- **Проверка:** Ctrl+click на функцию в `.erl` → переход к определению


**288 · M · LSP для F#** — уровень 3
- **Цель:** hover/definition для `.fs` через FsAutoComplete  
- **Файлы:** `lspClient.ts`  
- **Действие:** spawn FsAutoComplete / Ionide backend  
- **Проверка:** Ctrl+click на `let` в `.fs` → переход к определению


**289 · M · LSP для Prolog** — уровень 3
- **Цель:** hover/definition для `.pl` через SWI-Prolog LSP или аналог  
- **Файлы:** `lspClient.ts`  
- **Действие:** опциональный spawn Prolog language server  
- **Проверка:** при наличии LSP — переход к предикату


**290 · M · LSP для Scheme** — уровень 3
- **Цель:** hover/definition для `.scm` через racket/langserver или аналог  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** ветка Scheme language server  
- **Проверка:** Ctrl+click на define → переход к определению


**291 · M · LSP для Lisp** — уровень 3
- **Цель:** hover/definition для `.lisp` через alive-lsp / clangd аналог для CL  
- **Файлы:** `lspClient.ts`  
- **Действие:** spawn Lisp language server если доступен  
- **Проверка:** при наличии LSP — переход к `defun`


**292 · M · LSP для Solidity** — уровень 3
- **Цель:** hover/definition для `.sol` через solidity language server  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn nomicfoundation/solidity-language-server  
- **Проверка:** Ctrl+click на contract/function → переход к определению


**293 · M · LSP для VHDL** — уровень 3
- **Цель:** hover/definition для `.vhd` через vhdl_ls  
- **Файлы:** `lspClient.ts`  
- **Действие:** spawn vhdl language server  
- **Проверка:** Ctrl+click на entity → переход к определению


**294 · M · LSP для Verilog** — уровень 3
- **Цель:** hover/definition для `.v` через verible или svls  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn Verilog/SystemVerilog language server  
- **Проверка:** Ctrl+click на module → переход к определению


**295 · M · Авто-генерация диаграмм потоков управления** — уровень 3
- **Цель:** tool `generate_cfg_diagram` — CFG функции/модуля в Mermaid  
- **Файлы:** `agentTools/core.ts`, `MessageBody.tsx`  
- **Действие:** статический обход AST → flowchart  
- **Проверка:** диаграмма рендерится для fixture-функции


**296 · M · Авто-генерация диаграмм зависимостей модулей** — уровень 3
- **Цель:** tool `generate_module_dependency_diagram` — граф модулей проекта  
- **Файлы:** `agentHandlersProjectSearch.ts`, `ArchitecturePanel.tsx`  
- **Действие:** import graph → Mermaid graph TD  
- **Проверка:** диаграмма отображается в UI или чате


**297 · M · Авто-генерация диаграмм взаимодействия компонентов** — уровень 3
- **Цель:** tool `generate_component_interaction_diagram` — React/Electron компоненты  
- **Файлы:** `agentTools/core.ts`, `app/src/components/`  
- **Действие:** props/callbacks → sequence или component diagram  
- **Проверка:** Mermaid-блок для fixture-компонентов


**298 · M · Авто-генерация диаграмм API** — уровень 3
- **Цель:** tool `generate_api_diagram` — IPC и REST endpoints  
- **Файлы:** `shared/ipc/channels.ts`, `agentTools/core.ts`  
- **Действие:** scan IPC + routes → Mermaid  
- **Проверка:** диаграмма покрывает fixture IPC-каналы


**299 · M · Авто-генерация диаграмм тестового покрытия** — уровень 3
- **Цель:** tool `generate_coverage_diagram` — файлы vs тесты  
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectFile.ts`  
- **Действие:** сопоставление `src` ↔ `tests` → heatmap Mermaid  
- **Проверка:** отчёт показывает непокрытые модули из fixture


**300 · M · Авто-генерация диаграмм Git-истории** — уровень 3
- **Цель:** tool `generate_git_history_diagram` — ветки и merge по `git log`  
- **Файлы:** `gitTools.ts`, `agentTools/integrations.ts`  
- **Действие:** `git log --graph` → Mermaid gitGraph или flowchart  
- **Проверка:** unit-тест на fixture repo


**301 · M · Авто-генерация диаграмм CI/CD** — уровень 3
- **Цель:** tool `generate_cicd_diagram` — pipeline из workflow YAML  
- **Файлы:** `agentTools/integrations.ts`, `.github/workflows/*`  
- **Действие:** parse YAML jobs/steps → Mermaid flowchart  
- **Проверка:** диаграмма соответствует fixture workflow


**302 · M · Авто-генерация диаграмм P2P-узлов** — уровень 3
- **Цель:** tool `generate_p2p_topology_diagram` — узлы и relay  
- **Файлы:** `server/p2p/router.ts`, `p2pClient.ts`, `ArchitecturePanel.tsx`  
- **Действие:** mock/live nodes → Mermaid graph  
- **Проверка:** диаграмма для fixture topology


**303 · M · Авто-генерация диаграмм плагинов** — уровень 3
- **Цель:** tool `generate_plugin_diagram` — plugin → tools mapping  
- **Файлы:** `agentTools/core.ts`, `docs/plugin-authoring.md`  
- **Действие:** scan plugins → component diagram  
- **Проверка:** fixture plugin отображён на диаграмме


**304 · M · Авто-генерация диаграмм IPC-каналов** — уровень 3
- **Цель:** tool `generate_ipc_diagram` — main ↔ renderer IPC  
- **Файлы:** `shared/ipc/channels.ts`, `electron/preload/`  
- **Действие:** каналы + handlers → sequence diagram  
- **Проверка:** диаграмма содержит fixture IPC-канал


**305 · M · Авто-генерация отчёта по архитектуре UI** — уровень 3
- **Цель:** tool `generate_ui_architecture_report` — MD: компоненты, state, routing  
- **Файлы:** `app/src/components/`, `agentTools/core.ts`  
- **Действие:** read-only обход React-дерева + контексты  
- **Проверка:** отчёт без write_file; покрывает App/ChatPanel


**306 · M · Авто-генерация отчёта по архитектуре backend** — уровень 3
- **Цель:** tool `generate_backend_architecture_report` — main process модули  
- **Файлы:** `app/electron/main/`, `agentTools/core.ts`  
- **Действие:** слои handlers/services/providers  
- **Проверка:** отчёт описывает agent.ts и IPC


**307 · M · Авто-генерация отчёта по архитектуре агента** — уровень 3
- **Цель:** tool `generate_agent_architecture_report` — ReAct loop, tools, context  
- **Файлы:** `agent.ts`, `agentContext.ts`, `agentTools/`  
- **Действие:** схема цикла + список tool groups  
- **Проверка:** unit-тест: отчёт содержит `AgentRunner` и tools


**308 · M · Авто-генерация отчёта по архитектуре плагинов** — уровень 3
- **Цель:** tool `generate_plugin_architecture_report` — plugin API и lifecycle  
- **Файлы:** `docs/plugin-authoring.md`, `plugins/`  
- **Действие:** MD-отчёт: загрузка, hot-reload, ограничения  
- **Проверка:** отчёт без write_file


**309 · M · Авто-генерация отчёта по архитектуре интеграций** — уровень 3
- **Цель:** tool `generate_integrations_architecture_report` — GitHub, MCP, webhooks  
- **Файлы:** `agentTools/integrations.ts`, `IntegrationsTab.tsx`  
- **Действие:** карта интеграций + settings keys  
- **Проверка:** отчёт перечисляет основные integration tools


**310 · M · Авто-генерация отчёта по архитектуре CI/CD** — уровень 3
- **Цель:** tool `generate_cicd_architecture_report` — workflows, jobs, артефакты  
- **Файлы:** `.github/workflows/*`, `agentTools/integrations.ts`  
- **Действие:** parse workflows → MD summary  
- **Проверка:** отчёт описывает ci.yml из репозитория


**311 · M · Авто-генерация отчёта по архитектуре P2P** — уровень 3
- **Цель:** tool `generate_p2p_architecture_report` — router, credits, WSS  
- **Файлы:** `server/p2p/`, `p2pClient.ts`  
- **Действие:** MD: узлы, relay, маршрутизация  
- **Проверка:** отчёт без write_file


**312 · M · Авто-генерация отчёта по архитектуре RAG** — уровень 3
- **Цель:** tool `generate_rag_architecture_report` — индекс, embed, search  
- **Файлы:** `rag.ts`, `vectorStore.ts`, `agentContextRag.ts`  
- **Действие:** схема pipeline RAG в MD  
- **Проверка:** отчёт описывает `search_knowledge_base`


**313 · M · Авто-генерация отчёта по архитектуре символьного индекса** — уровень 3
- **Цель:** tool `generate_symbol_index_architecture_report` — языки, walk, cache  
- **Файлы:** `symbolIndex.ts`, `agentHandlersProjectSearch.ts`  
- **Действие:** MD: поддерживаемые расширения и flow индексации  
- **Проверка:** отчёт перечисляет ts/js/py из кода


**314 · M · Авто-генерация отчёта по архитектуре worktree** — уровень 3
- **Цель:** tool `generate_worktree_architecture_report` — git worktree + чаты  
- **Файлы:** `gitWorktree.ts`, `chats.ts`, `agent.ts`  
- **Действие:** MD: create/remove/list, `worktreePath` в чате  
- **Проверка:** отчёт описывает `resolveProjectRoot`

**315 · S · Авто-генерация аудио-версии документации** — уровень 4
- **Цель:** tool `generate_docs_audio` — TTS для `docs/*.md`  
- **Файлы:** `agentTools/integrations.ts`, `docs/`  
- **Действие:** обход docs → MP3/WAV по файлу или сводный трек  
- **Проверка:** аудио создаётся для fixture `docs/*.md`


**316 · S · Авто-генерация аудио-версии ROADMAP** — уровень 4
- **Цель:** tool `generate_roadmap_audio` — озвучка пунктов ROADMAP.md  
- **Файлы:** `roadmapParser.ts`, `agentTools/integrations.ts`  
- **Действие:** парсинг пунктов → TTS по номерам  
- **Проверка:** аудио содержит заголовки fixture-пунктов


**317 · S · Авто-генерация аудио-версии CHANGELOG** — уровень 4
- **Цель:** tool `generate_changelog_audio_v2` — озвучка по релизам (расширение п. 214)  
- **Файлы:** `agentTools/integrations.ts`  
- **Действие:** секции по версиям; настройка голоса из settings  
- **Проверка:** аудио соответствует CHANGELOG fixture


**318 · M · Авто-генерация видео-гайдов** — уровень 4
- **Цель:** tool `generate_video_guides` — серия коротких MP4 по разделам docs  
- **Файлы:** `agentTools/integrations.ts`, `commandRunner.ts`, `docs/`  
- **Действие:** скринкаст + TTS + титры; шаблон на раздел  
- **Проверка:** минимум один guide-ролик из fixture-сценария (mock ffmpeg)


**319 · M · Авто-генерация видео-демонстраций UI** — уровень 4
- **Цель:** tool `generate_ui_demo_videos` — запись ключевых экранов CodeViper  
- **Файлы:** `agentTools/integrations.ts`, `e2e/`  
- **Действие:** Playwright record → MP4 в `docs/demos/`  
- **Проверка:** видео открывается; показывает чат и настройки


**320 · S · Авто-генерация GIF-анимаций для README** — уровень 4
- **Цель:** tool `generate_readme_gifs` — GIF для быстрого старта в README  
- **Файлы:** `agentTools/integrations.ts`, `README.md`  
- **Действие:** capture сценариев → GIF; ссылки в README  
- **Проверка:** GIF в README рендерится на GitHub


**321 · M · Авто-генерация маркетинговых видео** — уровень 4
- **Цель:** tool `generate_marketing_video` — промо-ролик из features + CHANGELOG  
- **Файлы:** `agentTools/integrations.ts`, `docs/marketing/`  
- **Действие:** montage скриншотов + TTS + музыка (опционально)  
- **Проверка:** MP4 в `docs/marketing/` создаётся


**322 · S · Авто-генерация баннеров релизов** — уровень 4
- **Цель:** tool `generate_release_banners_v2` — набор баннеров к тегу (GitHub/social)  
- **Файлы:** `agentTools/integrations.ts`, `gitTools.ts`  
- **Действие:** размеры 1200×630, 1280×720; из release-notes  
- **Проверка:** PNG/SVG для fixture-тега


**323 · S · Авто-генерация иконок для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_icons` — SVG/PNG per plugin  
- **Файлы:** `agentTools/integrations.ts`, `plugins/`  
- **Действие:** prompt или шаблон → иконка 32/64px  
- **Проверка:** иконка отображается в списке плагинов


**324 · M · Авто-генерация тем оформления** — уровень 4
- **Цель:** tool `generate_ui_themes` — полные light/dark темы  
- **Файлы:** `styles.css`, `settings.ts`, `PerformanceTab.tsx`  
- **Действие:** набор CSS-переменных + переключатель в settings  
- **Проверка:** тема применяется без поломки layout


**325 · S · Авто-генерация цветовых схем** — уровень 4
- **Цель:** tool `generate_color_schemes` — палитры accent/surface  
- **Файлы:** `styles.css`, `agentTools/integrations.ts`  
- **Действие:** 3–5 схем из seed-цвета или бренда  
- **Проверка:** preview в PerformanceTab


**326 · S · Авто-генерация шрифтовых схем** — уровень 4
- **Цель:** tool `generate_font_schemes` — пары heading/body + scale  
- **Файлы:** `styles.css`, `settings.ts`  
- **Действие:** `font-family` stacks; связка с `uiFontScale`  
- **Проверка:** схема применяется; читаемость в чате


**327 · M · Авто-генерация UX-гайдов** — уровень 4
- **Цель:** tool `generate_ux_guides` — MD: паттерны, do/don't для UI проекта  
- **Файлы:** `agentTools/integrations.ts`, `docs/`  
- **Действие:** анализ компонентов → гайд с примерами  
- **Проверка:** `docs/ux-guide.md` создан


**328 · S · Авто-генерация onboarding-гайдов** — уровень 4
- **Цель:** tool `generate_onboarding_guides` — шаги визарда + скриншоты  
- **Файлы:** `OnboardingWizard.tsx`, `docs/`  
- **Действие:** MD + optional GIF per step  
- **Проверка:** гайд совпадает с шагами визарда


**329 · M · Авто-генерация developer-гайдов** — уровень 4
- **Цель:** tool `generate_developer_guides` — расширенный dev guide по модулям  
- **Файлы:** `CONTRIBUTING.md`, `agentTools/integrations.ts`  
- **Действие:** разделы: setup, agent, IPC, tests  
- **Проверка:** guide содержит команды из `app/package.json`


**330 · S · Авто-генерация user-гайдов** — уровень 4
- **Цель:** tool `generate_user_guides_v2` — сценарии для конечного пользователя  
- **Файлы:** `docs/`, `agentTools/integrations.ts`  
- **Действие:** установка, чат, интеграции, troubleshooting-ссылки  
- **Проверка:** `docs/user-guide-v2.md` покрывает 5+ сценариев


**331 · M · Авто-генерация документации по API плагинов** — уровень 4
- **Цель:** tool `generate_plugin_api_docs` — reference из plugin schema  
- **Файлы:** `docs/plugin-authoring.md`, `agentTools/core.ts`  
- **Действие:** scan plugins → OpenAPI-like MD или TypeDoc  
- **Проверка:** API fixture-плагина задокументирован


**332 · S · Авто-генерация документации по API субагентов** — уровень 4
- **Цель:** tool `generate_subagent_api_docs` — delegate_to_* контракты  
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`, `docs/`  
- **Действие:** список субагентов, вход/выход, read-only ограничения  
- **Проверка:** docs перечисляют Reviewer, Tester, Architect и др.

**333 · M · Subagent Compliance — проверка соответствия стандартам** — уровень 2
- **Цель:** read-only проверка проекта на соответствие корпоративным стандартам
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`
- **Действие:** tool `delegate_to_compliance`
- **Проверка:** отчёт без write_file


**334 · M · Авто-обнаружение неправильных feature-flags** — уровень 3
- **Цель:** проверка feature-флагов
- **Файлы:** `settings.ts`, `agentTools/core.ts`
- **Действие:** tool `find_feature_flag_issues`; анализ settings и кода
- **Проверка:** отчёт


**335 · S · Авто-обнаружение неправильных environment-переменных** — уровень 3
- **Цель:** проверка `.env`
- **Файлы:** `.env`, `settings.ts`
- **Действие:** tool `find_env_issues`; сравнение с Zod/settings
- **Проверка:** отчёт


**336 · M · Авто-обнаружение неправильных путей в RAG-документах** — уровень 3
- **Цель:** проверка RAG-источников
- **Файлы:** `rag.ts`
- **Действие:** tool `find_rag_source_issues`; проверка существования путей
- **Проверка:** отчёт


**337 · M · Авто-обнаружение неправильных chunk-размеров RAG** — уровень 3
- **Цель:** проверка `chunkSize`
- **Файлы:** `rag.ts`
- **Действие:** tool `find_rag_chunk_issues`; лимиты и рекомендации
- **Проверка:** отчёт


**338 · S · Авто-обнаружение неправильных моделей RAG** — уровень 3
- **Цель:** проверка embedding-моделей
- **Файлы:** `rag.ts`
- **Действие:** tool `find_rag_model_issues`; ping/list models
- **Проверка:** отчёт


**339 · M · Авто-обнаружение неправильных индексов Milvus/Qdrant** — уровень 3
- **Цель:** проверка конфигурации
- **Файлы:** `rag.ts`, `vectorStore.ts`
- **Действие:** tool `find_vector_index_issues`
- **Проверка:** отчёт


**340 · S · Авто-обнаружение неправильных параметров индексации** — уровень 3
- **Цель:** проверка параметров индексации
- **Файлы:** `rag.ts`
- **Действие:** tool `find_index_param_issues`
- **Проверка:** отчёт


**341 · M · Авто-обнаружение неправильных моделей fallback** — уровень 3
- **Цель:** проверка `fallbackModels[]`
- **Файлы:** `settings.ts`, `BehaviorTab.tsx`
- **Действие:** tool `find_fallback_model_issues`
- **Проверка:** отчёт


**342 · S · Авто-обнаружение неправильных настроек orchestrator** — уровень 3
- **Цель:** проверка orchestrator
- **Файлы:** `ModelTab.tsx`, `orchestratorModel.ts`
- **Действие:** tool `find_orchestrator_issues`
- **Проверка:** отчёт


**343 · M · Авто-обнаружение неправильных настроек GGUF-скачиваний** — уровень 3
- **Цель:** проверка GGUF-моделей
- **Файлы:** `ModelTab/providers/*`
- **Действие:** tool `find_gguf_download_issues`
- **Проверка:** отчёт


**344 · S · Авто-обнаружение неправильных настроек Vision-моделей** — уровень 3
- **Цель:** проверка vision-input
- **Файлы:** `MessageBody.tsx`, `settings.ts`
- **Действие:** tool `find_vision_model_issues`
- **Проверка:** отчёт


**345 · M · Авто-обнаружение неправильных настроек Editor-субагента** — уровень 3
- **Цель:** проверка Editor
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_editor_subagent_issues`
- **Проверка:** отчёт


**346 · S · Авто-обнаружение неправильных настроек Explorer-субагента** — уровень 3
- **Цель:** проверка Explorer
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_explorer_subagent_issues`
- **Проверка:** отчёт


**347 · M · Авто-обнаружение неправильных настроек Security-субагента** — уровень 3
- **Цель:** проверка Security
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_security_subagent_issues`
- **Проверка:** отчёт


**348 · S · Авто-обнаружение неправильных настроек Reviewer-субагента** — уровень 3
- **Цель:** проверка Reviewer
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_reviewer_subagent_issues`
- **Проверка:** отчёт


**349 · M · Авто-обнаружение неправильных настроек Tester-субагента** — уровень 3
- **Цель:** проверка Tester
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_tester_subagent_issues`
- **Проверка:** отчёт


**350 · S · Авто-обнаружение неправильных настроек Architect-субагента** — уровень 3
- **Цель:** проверка Architect
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_architect_subagent_issues`
- **Проверка:** отчёт


**351 · M · Авто-обнаружение неправильных настроек Documenter-субагента** — уровень 3
- **Цель:** проверка Documenter
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_documenter_subagent_issues`
- **Проверка:** отчёт


**352 · S · Авто-обнаружение неправильных настроек Performance-субагента** — уровень 3
- **Цель:** проверка Performance
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_performance_subagent_issues`
- **Проверка:** отчёт


**353 · M · Авто-обнаружение неправильных настроек Compliance-субагента** — уровень 3
- **Цель:** проверка Compliance
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_compliance_subagent_issues`
- **Проверка:** отчёт


**354 · S · Авто-обнаружение неправильных настроек collective memory** — уровень 3
- **Цель:** проверка `.codeviper/rules.md`
- **Файлы:** `AgentLearningPanel.tsx`, `collectiveMemorySync.ts`
- **Действие:** tool `find_collective_memory_issues`
- **Проверка:** отчёт


**355 · M · Авто-обнаружение неправильных правил самообучения** — уровень 3
- **Цель:** проверка SelfImprovePlan
- **Файлы:** `SelfImprovePanel.tsx`, `shared/selfImprovement.ts`
- **Действие:** tool `find_self_improve_plan_issues`
- **Проверка:** отчёт


**356 · S · Авто-обнаружение неправильных шаблонов чатов** — уровень 3
- **Цель:** проверка шаблонов
- **Файлы:** `ChatHistoryPanel.tsx`, `chats.ts`
- **Действие:** tool `find_chat_template_issues`
- **Проверка:** отчёт


**357 · M · Авто-обнаружение неправильных черновиков ввода** — уровень 3
- **Цель:** проверка localStorage drafts
- **Файлы:** `ChatPanel.tsx`, `ChatInput.tsx`
- **Действие:** tool `find_input_draft_issues`
- **Проверка:** отчёт


**358 · S · Авто-обнаружение неправильных split-layout настроек** — уровень 3
- **Цель:** проверка `ui-layout.json`
- **Файлы:** `App.tsx`, `settings.ts`
- **Действие:** tool `find_split_layout_issues`
- **Проверка:** отчёт


**359 · M · Авто-обнаружение неправильных темной/светлой темы** — уровень 3
- **Цель:** проверка `uiLightMode`
- **Файлы:** `settings.ts`, `styles.css`
- **Действие:** tool `find_theme_mode_issues`
- **Проверка:** отчёт


**360 · S · Авто-обнаружение неправильных quick-open результатов** — уровень 3
- **Цель:** проверка fuzzy-поиска
- **Файлы:** `QuickOpen.tsx`
- **Действие:** tool `find_quick_open_issues`
- **Проверка:** отчёт


**361 · M · Авто-обнаружение неправильных preview-панелей** — уровень 3
- **Цель:** проверка FilePreviewPanel
- **Файлы:** `FilePreviewPanel.tsx`
- **Действие:** tool `find_preview_panel_issues`
- **Проверка:** отчёт


**362 · S · Авто-обнаружение неправильных code-editor настроек** — уровень 3
- **Цель:** проверка CodeMirror
- **Файлы:** `CodeEditorPanel.tsx`
- **Действие:** tool `find_code_editor_issues`
- **Проверка:** отчёт


**363 · M · Авто-обнаружение неправильных hot-reload плагинов** — уровень 3
- **Цель:** проверка hot-reload
- **Файлы:** `plugins/*`
- **Действие:** tool `find_plugin_hotreload_issues`
- **Проверка:** отчёт


**364 · S · Авто-обнаружение неправильных MCP-серверов** — уровень 3
- **Цель:** проверка MCP
- **Файлы:** `IntegrationsTab.tsx`, `settings.ts`
- **Действие:** tool `find_mcp_server_issues`
- **Проверка:** отчёт


**365 · M · Авто-обнаружение неправильных health-checks MCP** — уровень 3
- **Цель:** проверка MCP health
- **Файлы:** `agentTools/mcp.ts`
- **Действие:** tool `find_mcp_health_issues`
- **Проверка:** отчёт


**366 · S · Авто-обнаружение неправильных enabledTools** — уровень 3
- **Цель:** проверка списка tools
- **Файлы:** `agentTools/core.ts`, `settings.ts`
- **Действие:** tool `find_enabled_tools_issues`
- **Проверка:** отчёт


**367 · M · Авто-обнаружение неправильных tool-schemas** — уровень 3
- **Цель:** проверка JSON-схем
- **Файлы:** `agentTools/*`
- **Действие:** tool `find_tool_schema_issues`
- **Проверка:** отчёт


**368 · S · Авто-обнаружение неправильных tool-описаний** — уровень 3
- **Цель:** проверка descriptions
- **Файлы:** `agentTools/*`
- **Действие:** tool `find_tool_description_issues`
- **Проверка:** отчёт


**369 · M · Авто-обнаружение неправильных tool-алиасов** — уровень 3
- **Цель:** проверка алиасов
- **Файлы:** `agentTools/*`, `shared/toolCalls.ts`
- **Действие:** tool `find_tool_alias_issues`
- **Проверка:** отчёт


**370 · S · Авто-обнаружение неправильных tool-параметров** — уровень 3
- **Цель:** проверка параметров
- **Файлы:** `agentTools/*`
- **Действие:** tool `find_tool_param_issues`
- **Проверка:** отчёт


**371 · M · Авто-обнаружение неправильных tool-результатов** — уровень 3
- **Цель:** проверка результатов
- **Файлы:** `agentTools/*`, `agent.ts`
- **Действие:** tool `find_tool_result_issues`
- **Проверка:** отчёт


**372 · S · Авто-обнаружение неправильных tool-ошибок** — уровень 3
- **Цель:** проверка ошибок
- **Файлы:** `agentTools/*`
- **Действие:** tool `find_tool_error_issues`
- **Проверка:** отчёт


**373 · M · Авто-обнаружение неправильных tool-timeouts** — уровень 3
- **Цель:** проверка таймаутов
- **Файлы:** `agentTools/*`, `shared/constants.ts`
- **Действие:** tool `find_tool_timeout_issues`
- **Проверка:** отчёт


**374 · S · Авто-обнаружение неправильных tool-fallbacks** — уровень 3
- **Цель:** проверка fallback
- **Файлы:** `agentTools/*`, `modelRuntime.ts`
- **Действие:** tool `find_tool_fallback_issues`
- **Проверка:** отчёт

**375 · M · find_symbol для Apex** — уровень 3
- **Цель:** `find_symbol` / `find_references` для `.cls` / `.trigger` (class/method)  
- **Файлы:** `symbolIndex.ts`, `agentHandlersProjectSearch.ts`  
- **Действие:** парсер Apex → символы с `path:line:col`  
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.cls` файлом


**376 · M · find_symbol для ABAP** — уровень 3
- **Цель:** символы для `.abap` (program/class/method)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход объявлений ABAP  
- **Проверка:** unit-тест: `CLASS` / `METHOD` находятся по имени


**377 · M · find_symbol для Dart** — уровень 3
- **Цель:** символы для `.dart` (class/function)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** tree-sitter-dart или синтаксический обход  
- **Проверка:** unit-тест: `class Foo` и `void main` находятся по имени


**378 · M · find_symbol для Nim** — уровень 3
- **Цель:** символы для `.nim` (proc/func/type)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход `proc` / `func` / `type` объявлений  
- **Проверка:** unit-тест: `proc foo` находится по имени


**379 · M · find_symbol для Crystal** — уровень 3
- **Цель:** символы для `.cr` (class/def/macro)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** парсер Crystal → top-level объявления  
- **Проверка:** unit-тест: `class Foo` и `def bar` находятся по имени


**380 · M · find_symbol для D** — уровень 3
- **Цель:** символы для `.d` (module/class/function)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход D объявлений  
- **Проверка:** unit-тест: `void main` и `class Bar` находятся по имени


**381 · M · find_symbol для Tcl** — уровень 3
- **Цель:** символы для `.tcl` (proc)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** regex для `proc name`  
- **Проверка:** unit-тест: `proc foo` находится по имени


**382 · M · find_symbol для PowerShell** — уровень 3
- **Цель:** символы для `.ps1` / `.psm1` (function/cmdlet)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход `function` / `filter` объявлений  
- **Проверка:** unit-тест: `function Get-Foo` находится по имени


**383 · M · find_symbol для Batch** — уровень 3
- **Цель:** символы для `.bat` / `.cmd` (labels/call targets)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** поиск `:label` и `call` целей  
- **Проверка:** unit-тест: label находится по имени


**384 · M · find_symbol для Puppet** — уровень 3
- **Цель:** символы для `.pp` (class/define/resource)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход Puppet DSL объявлений  
- **Проверка:** unit-тест: `class foo` и `define bar` находятся по имени


**385 · M · LSP для Apex** — уровень 3
- **Цель:** hover/definition для `.cls` через Apex language server (если установлен)  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** опциональный spawn; graceful fallback  
- **Проверка:** при наличии LSP — переход к определению в `.cls`


**386 · M · LSP для ABAP** — уровень 3
- **Цель:** hover/definition для `.abap` через abap language server  
- **Файлы:** `lspClient.ts`  
- **Действие:** ветка ABAP language server  
- **Проверка:** Ctrl+click на method → переход к определению


**387 · M · LSP для Dart** — уровень 3
- **Цель:** hover/definition для `.dart` через dart analysis server  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn `dart language-server`  
- **Проверка:** Ctrl+click на class → переход к определению


**388 · M · LSP для Nim** — уровень 3
- **Цель:** hover/definition для `.nim` через nimlangserver  
- **Файлы:** `lspClient.ts`  
- **Действие:** spawn nim language server  
- **Проверка:** Ctrl+click на `proc` → переход к определению


**389 · M · LSP для Crystal** — уровень 3
- **Цель:** hover/definition для `.cr` через crystalline  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn crystalline LSP  
- **Проверка:** Ctrl+click на `def` → переход к определению


**390 · M · LSP для D** — уровень 3
- **Цель:** hover/definition для `.d` через serve-d / dcd  
- **Файлы:** `lspClient.ts`  
- **Действие:** spawn D language server  
- **Проверка:** Ctrl+click на function → переход к определению


**391 · M · LSP для Tcl** — уровень 3
- **Цель:** hover/definition для `.tcl` через tcl language server  
- **Файлы:** `lspClient.ts`  
- **Действие:** опциональный spawn Tcl LSP  
- **Проверка:** при наличии LSP — переход к `proc`


**392 · M · LSP для PowerShell** — уровень 3
- **Цель:** hover/definition для `.ps1` через PowerShell Editor Services  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn PSES language server  
- **Проверка:** Ctrl+click на function → переход к определению


**393 · M · LSP для Batch** — уровень 3
- **Цель:** hover/definition для `.bat` — ограниченная поддержка (syntax + labels)  
- **Файлы:** `lspClient.ts`  
- **Действие:** базовый language service или fallback на grep  
- **Проверка:** отчёт о доступности; label navigation если LSP есть


**394 · M · LSP для Puppet** — уровень 3
- **Цель:** hover/definition для `.pp` через puppet-editor-services  
- **Файлы:** `lspClient.ts`  
- **Действие:** spawn Puppet language server  
- **Проверка:** Ctrl+click на `class` → переход к определению


**395 · M · Авто-генерация диаграмм Git-ветвления** — уровень 3
- **Цель:** tool `generate_git_branch_diagram` — дерево веток из `git branch -a`  
- **Файлы:** `gitTools.ts`, `agentTools/integrations.ts`  
- **Действие:** Mermaid gitGraph или flowchart  
- **Проверка:** unit-тест на fixture repo


**396 · M · Авто-генерация диаграмм Git-мерджей** — уровень 3
- **Цель:** tool `generate_git_merge_diagram` — merge commits и parents  
- **Файлы:** `gitTools.ts`, `MessageBody.tsx`  
- **Действие:** `git log --merges` → Mermaid  
- **Проверка:** диаграмма для fixture merge history


**397 · M · Авто-генерация диаграмм Git-конфликтов** — уровень 3
- **Цель:** tool `generate_git_conflict_diagram` — файлы/коммиты с конфликтами  
- **Файлы:** `gitTools.ts`, `agentHandlersProjectFile.ts`  
- **Действие:** scan `<<<<<<<` + git status → diagram  
- **Проверка:** отчёт показывает fixture conflict


**398 · M · Авто-генерация диаграмм Git-ревью** — уровень 3
- **Цель:** tool `generate_git_review_diagram` — PR/review timeline  
- **Файлы:** `agentTools/integrations.ts`, `gitTools.ts`  
- **Действие:** GitHub API mock → sequence diagram  
- **Проверка:** diagram для fixture PR events


**399 · M · Авто-генерация диаграмм Git-релизов** — уровень 3
- **Цель:** tool `generate_git_release_diagram` — теги и релизы по времени  
- **Файлы:** `gitTools.ts`, `agentTools/integrations.ts`  
- **Действие:** `git tag -l` + dates → timeline Mermaid  
- **Проверка:** диаграмма для fixture tags


**400 · M · Авто-генерация диаграмм Git-тегов** — уровень 3
- **Цель:** tool `generate_git_tag_diagram` — annotated vs lightweight tags  
- **Файлы:** `gitTools.ts`  
- **Действие:** parse tag refs → graph  
- **Проверка:** unit-тест на fixture tags


**401 · M · Авто-генерация диаграмм Git-коммитов** — уровень 3
- **Цель:** tool `generate_git_commit_diagram` — частота/объём коммитов  
- **Файлы:** `gitTools.ts`, `MetricsPanel.tsx`  
- **Действие:** `git shortlog` / log histogram → chart Mermaid  
- **Проверка:** диаграмма для fixture log


**402 · M · Авто-генерация диаграмм Git-авторов** — уровень 3
- **Цель:** tool `generate_git_author_diagram` — вклад по авторам  
- **Файлы:** `gitTools.ts`  
- **Действие:** `git shortlog -sn` → pie/bar Mermaid  
- **Проверка:** топ авторов из fixture repo


**403 · M · Авто-генерация диаграмм Git-активности** — уровень 3
- **Цель:** tool `generate_git_activity_diagram` — heatmap коммитов по дням  
- **Файлы:** `gitTools.ts`, `agentTools/integrations.ts`  
- **Действие:** log dates → calendar heatmap Mermaid  
- **Проверка:** активность за период в fixture


**404 · M · Авто-генерация диаграмм Git-статистики** — уровень 3
- **Цель:** tool `generate_git_stats_diagram` — LOC churn, files changed  
- **Файлы:** `gitTools.ts`  
- **Действие:** `git log --stat` aggregate → summary diagram  
- **Проверка:** stats совпадают с fixture `git log --shortstat`


**405 · M · Авто-генерация отчёта по качеству тестов** — уровень 3
- **Цель:** tool `generate_test_quality_report` — покрытие, flaky, missing tests  
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectFile.ts`  
- **Действие:** read-only анализ `tests/` vs `src/`  
- **Проверка:** отчёт без write_file; список непокрытых модулей


**406 · M · Авто-генерация отчёта по качеству документации** — уровень 3
- **Цель:** tool `generate_docs_quality_report` — битые ссылки, устаревшие разделы  
- **Файлы:** `agentTools/integrations.ts`, `docs/`  
- **Действие:** scan MD links + vs код  
- **Проверка:** отчёт находит broken link в fixture


**407 · M · Авто-генерация отчёта по качеству UI** — уровень 3
- **Цель:** tool `generate_ui_quality_report` — консистентность компонентов  
- **Файлы:** `app/src/components/`, `agentTools/core.ts`  
- **Действие:** эвристики: дубли стилей, огромные компоненты  
- **Проверка:** отчёт без write_file


**408 · M · Авто-генерация отчёта по качеству UX** — уровень 3
- **Цель:** tool `generate_ux_quality_report` — friction points, a11y gaps  
- **Файлы:** `agentTools/core.ts`, `App.tsx`  
- **Действие:** чеклист UX + ссылки на компоненты  
- **Проверка:** отчёт содержит findings из fixture UI


**409 · M · Авто-генерация отчёта по качеству интеграций** — уровень 3
- **Цель:** tool `generate_integrations_quality_report` — tokens, endpoints, errors  
- **Файлы:** `agentTools/integrations.ts`, `IntegrationsTab.tsx`  
- **Действие:** валидация settings + tool health  
- **Проверка:** отчёт перечисляет проблемы fixture settings


**410 · M · Авто-генерация отчёта по качеству плагинов** — уровень 3
- **Цель:** tool `generate_plugins_quality_report` — schema, errors, reload  
- **Файлы:** `plugins/`, `docs/plugin-authoring.md`  
- **Действие:** scan plugins → MD summary  
- **Проверка:** fixture plugin issues в отчёте


**411 · M · Авто-генерация отчёта по качеству CI/CD** — уровень 3
- **Цель:** tool `generate_cicd_quality_report` — jobs, caches, secrets hygiene  
- **Файлы:** `.github/workflows/*`, `agentTools/integrations.ts`  
- **Действие:** YAML lint + best practices  
- **Проверка:** отчёт для fixture workflow


**412 · M · Авто-генерация отчёта по качеству P2P** — уровень 3
- **Цель:** tool `generate_p2p_quality_report` — latency, credits, disconnects  
- **Файлы:** `server/p2p/`, `p2pClient.ts`  
- **Действие:** метрики + рекомендации  
- **Проверка:** отчёт без write_file


**413 · M · Авто-генерация отчёта по качеству RAG** — уровень 3
- **Цель:** tool `generate_rag_quality_report` — chunk quality, retrieval hits  
- **Файлы:** `rag.ts`, `vectorStore.ts`  
- **Действие:** sample queries + index stats  
- **Проверка:** отчёт описывает fixture index


**414 · M · Авто-генерация отчёта по качеству символьного индекса** — уровень 3
- **Цель:** tool `generate_symbol_index_quality_report` — coverage, stale, misses  
- **Файлы:** `symbolIndex.ts`, `agentHandlersProjectSearch.ts`  
- **Действие:** языки, cache age, failed parses  
- **Проверка:** отчёт перечисляет unsupported extensions в fixture

**415 · S · Авто-генерация аудио-версии архитектурных отчётов** — уровень 4
- **Цель:** tool `generate_architecture_report_audio` — TTS для arch-отчётов (п. 305–314)  
- **Файлы:** `agentTools/integrations.ts`, `subagentRunner.ts`  
- **Действие:** MD-отчёт → аудио MP3/WAV по разделам  
- **Проверка:** аудио создаётся из fixture architecture report


**416 · S · Авто-генерация аудио-версии тестовых отчётов** — уровень 4
- **Цель:** tool `generate_test_report_audio` — озвучка test/quality reports  
- **Файлы:** `agentTools/integrations.ts`  
- **Действие:** summary тестов → TTS  
- **Проверка:** аудио соответствует fixture test quality report


**417 · S · Авто-генерация аудио-версии UX-отчётов** — уровень 4
- **Цель:** tool `generate_ux_report_audio` — озвучка UX/a11y findings  
- **Файлы:** `agentTools/integrations.ts`, `MessageBody.tsx`  
- **Действие:** UX report MD → TTS  
- **Проверка:** аудио для fixture UX report


**418 · M · Авто-генерация видео-обзоров архитектуры** — уровень 4
- **Цель:** tool `generate_architecture_video` — скринкаст + озвучка arch-диаграмм  
- **Файлы:** `agentTools/integrations.ts`, `ArchitecturePanel.tsx`  
- **Действие:** Mermaid/diagrams + TTS → MP4  
- **Проверка:** видео из fixture arch materials (mock ffmpeg)


**419 · M · Авто-генерация видео-обзоров CI/CD** — уровень 4
- **Цель:** tool `generate_cicd_video` — обзор pipeline и workflow  
- **Файлы:** `agentTools/integrations.ts`, `.github/workflows/*`  
- **Действие:** diagram CI/CD + TTS + terminal capture  
- **Проверка:** MP4 описывает fixture workflow


**420 · S · Авто-генерация GIF-анимаций архитектуры** — уровень 4
- **Цель:** tool `generate_architecture_gifs` — GIF для ArchitecturePanel / docs  
- **Файлы:** `ArchitecturePanel.tsx`, `docs/`  
- **Действие:** capture graph interaction → GIF  
- **Проверка:** GIF в docs открывается


**421 · M · Авто-генерация маркетинговых материалов для релизов** — уровень 4
- **Цель:** tool `generate_release_marketing_pack` — тексты + visuals к `vX.Y.Z`  
- **Файлы:** `agentTools/integrations.ts`, `gitTools.ts`, `docs/marketing/`  
- **Действие:** CHANGELOG + features → social copy + images  
- **Проверка:** пакет файлов для fixture-тега


**422 · S · Авто-генерация баннеров для релизов** — уровень 4
- **Цель:** tool `generate_release_banners_v3` — баннеры под GitHub Release assets  
- **Файлы:** `agentTools/integrations.ts`  
- **Действие:** размеры release cover + social; из release-notes  
- **Проверка:** PNG для fixture release


**423 · S · Авто-генерация иконок для субагентов** — уровень 4
- **Цель:** tool `generate_subagent_icons` — SVG/PNG per delegate_to_*  
- **Файлы:** `subagentRunner.ts`, `AgentStatusBar.tsx`  
- **Действие:** иконка 24px для Reviewer, Tester, Architect, …  
- **Проверка:** чипы субагентов показывают иконки


**424 · M · Авто-генерация тем оформления для субагентов** — уровень 4
- **Цель:** tool `generate_subagent_themes` — accent color per subagent в UI  
- **Файлы:** `styles.css`, `subagentRunner.ts`, `AgentStatusBar.tsx`  
- **Действие:** CSS variables `--subagent-reviewer`, etc.  
- **Проверка:** делегирование визуально различимо по цвету


**425 · S · Авто-генерация цветовых схем для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_color_schemes` — палитра per plugin в UI  
- **Файлы:** `plugins/`, `styles.css`  
- **Действие:** optional badge color из plugin manifest  
- **Проверка:** fixture plugin имеет цвет в списке


**426 · S · Авто-генерация шрифтовых схем для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_font_schemes` — typography hints для plugin docs UI  
- **Файлы:** `plugins/`, `styles.css`  
- **Действие:** font stack в plugin settings schema  
- **Проверка:** preview применяет схему


**427 · M · Авто-генерация UX-гайдов для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_ux_guides` — UX patterns для plugin authors  
- **Файлы:** `docs/plugin-authoring.md`, `agentTools/integrations.ts`  
- **Действие:** MD: tool naming, errors, permissions  
- **Проверка:** `docs/plugin-ux-guide.md` создан


**428 · S · Авто-генерация onboarding-гайдов для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_onboarding` — первый plugin за 5 шагов  
- **Файлы:** `docs/plugin-authoring.md`, `SkillsPanel.tsx`  
- **Действие:** MD + optional GIF  
- **Проверка:** гайд совпадает с hot-reload flow


**429 · M · Авто-генерация developer-гайдов для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_dev_guides` — API, schema, debugging  
- **Файлы:** `docs/plugin-authoring.md`, `plugins/`  
- **Действие:** расширенный dev guide из fixture plugin  
- **Проверка:** guide содержит schema example


**430 · S · Авто-генерация user-гайдов для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_user_guides` — как установить/включить plugin  
- **Файлы:** `IntegrationsTab.tsx`, `docs/`  
- **Действие:** end-user MD без внутренних деталей  
- **Проверка:** 3+ шага для fixture plugin


**431 · M · Авто-генерация документации по API RAG** — уровень 4
- **Цель:** tool `generate_rag_api_docs` — index, search, embed API  
- **Файлы:** `rag.ts`, `vectorStore.ts`, `docs/`  
- **Действие:** reference из кода + settings keys  
- **Проверка:** docs описывают `search_knowledge_base`


**432 · S · Авто-генерация документации по API worktree** — уровень 4
- **Цель:** tool `generate_worktree_api_docs` — create/list/remove, chat binding  
- **Файлы:** `gitWorktree.ts`, `chats.ts`, `docs/`  
- **Действие:** MD: IPC, agent root resolution  
- **Проверка:** docs описывают `worktreePath` и `resolveProjectRoot`

**433 · M · Subagent Referee — сравнение двух решений** — уровень 2
- **Цель:** read-only сравнение двух вариантов кода или двух ответов агента
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`
- **Действие:** tool `delegate_to_referee`
- **Проверка:** отчёт без write_file


**434 · M · Авто-обнаружение «тяжёлых» циклов** — уровень 3
- **Цель:** находить циклы с высокой сложностью
- **Файлы:** `agentTools/core.ts`
- **Действие:** tool `find_heavy_loops`; анализ CFG
- **Проверка:** отчёт


**435 · S · Авто-обнаружение неправильных switch-конструкций** — уровень 3
- **Цель:** находить неполные switch
- **Файлы:** `agentTools/core.ts`
- **Действие:** tool `find_switch_issues`; анализ AST
- **Проверка:** отчёт


**436 · M · Авто-обнаружение неправильных try/catch блоков** — уровень 3
- **Цель:** находить пустые catch
- **Файлы:** `agentTools/core.ts`
- **Действие:** tool `find_try_catch_issues`
- **Проверка:** отчёт


**437 · S · Авто-обнаружение неправильных throw-выражений** — уровень 3
- **Цель:** проверка ошибок
- **Файлы:** `agentTools/core.ts`
- **Действие:** tool `find_throw_issues`
- **Проверка:** отчёт


**438 · M · Авто-обнаружение неправильных async-итераторов** — уровень 3
- **Цель:** проверка for-await
- **Файлы:** `agentTools/core.ts`
- **Действие:** tool `find_async_iterator_issues`
- **Проверка:** отчёт


**439 · M · Авто-обнаружение неправильных генераторов** — уровень 3
- **Цель:** проверка `function*`
- **Файлы:** `agentTools/core.ts`
- **Действие:** tool `find_generator_issues`
- **Проверка:** отчёт


**440 · S · Авто-обнаружение неправильных default-экспортов** — уровень 3
- **Цель:** проверка default export
- **Файлы:** `symbolIndex.ts`
- **Действие:** tool `find_default_export_issues`
- **Проверка:** отчёт


**441 · M · Авто-обнаружение неправильных named-экспортов** — уровень 3
- **Цель:** проверка named export
- **Файлы:** `symbolIndex.ts`
- **Действие:** tool `find_named_export_issues`
- **Проверка:** отчёт


**442 · S · Авто-обнаружение неправильных import-alias** — уровень 3
- **Цель:** проверка alias
- **Файлы:** `symbolIndex.ts`
- **Действие:** tool `find_import_alias_issues`
- **Проверка:** отчёт


**443 · M · Авто-обнаружение неправильных путей в CodeEditorPanel** — уровень 3
- **Цель:** проверка открытия файлов
- **Файлы:** `CodeEditorPanel.tsx`
- **Действие:** tool `find_code_editor_path_issues`
- **Проверка:** отчёт


**444 · S · Авто-обнаружение неправильных путей в FilePreviewPanel** — уровень 3
- **Цель:** проверка preview
- **Файлы:** `FilePreviewPanel.tsx`
- **Действие:** tool `find_file_preview_path_issues`
- **Проверка:** отчёт


**445 · M · Авто-обнаружение неправильных путей в ProjectTreePanel** — уровень 3
- **Цель:** проверка дерева файлов
- **Файлы:** `ProjectTreePanel.tsx`
- **Действие:** tool `find_project_tree_path_issues`
- **Проверка:** отчёт


**446 · S · Авто-обнаружение неправильных путей в ChatHistoryPanel** — уровень 3
- **Цель:** проверка путей чатов
- **Файлы:** `ChatHistoryPanel.tsx`
- **Действие:** tool `find_chat_history_path_issues`
- **Проверка:** отчёт


**447 · M · Авто-обнаружение неправильных путей в SettingsModal** — уровень 3
- **Цель:** проверка настроек
- **Файлы:** `SettingsModal/*`
- **Действие:** tool `find_settings_modal_path_issues`
- **Проверка:** отчёт


**448 · S · Авто-обнаружение неправильных путей в TracePanel** — уровень 3
- **Цель:** проверка trace
- **Файлы:** `TracePanel.tsx`
- **Действие:** tool `find_trace_panel_path_issues`
- **Проверка:** отчёт


**449 · M · Авто-обнаружение неправильных путей в MetricsPanel** — уровень 3
- **Цель:** проверка метрик
- **Файлы:** `MetricsPanel.tsx`
- **Действие:** tool `find_metrics_panel_path_issues`
- **Проверка:** отчёт


**450 · S · Авто-обнаружение неправильных путей в TerminalPanel** — уровень 3
- **Цель:** проверка терминала
- **Файлы:** `TerminalPanel.tsx`
- **Действие:** tool `find_terminal_panel_path_issues`
- **Проверка:** отчёт


**451 · M · Авто-обнаружение неправильных путей в WelcomePanel** — уровень 3
- **Цель:** проверка welcome
- **Файлы:** `WelcomePanel.tsx`
- **Действие:** tool `find_welcome_panel_path_issues`
- **Проверка:** отчёт


**452 · S · Авто-обнаружение неправильных путей в OnboardingWizard** — уровень 3
- **Цель:** проверка визарда
- **Файлы:** `OnboardingWizard.tsx`
- **Действие:** tool `find_onboarding_path_issues`
- **Проверка:** отчёт


**453 · M · Авто-обнаружение неправильных путей в IntegrationsTab** — уровень 3
- **Цель:** проверка интеграций
- **Файлы:** `IntegrationsTab.tsx`
- **Действие:** tool `find_integrations_tab_path_issues`
- **Проверка:** отчёт


**454 · S · Авто-обнаружение неправильных путей в AutomationsTab** — уровень 3
- **Цель:** проверка автоматизаций
- **Файлы:** `AutomationsTab.tsx`
- **Действие:** tool `find_automations_tab_path_issues`
- **Проверка:** отчёт


**455 · M · Авто-обнаружение неправильных путей в ModelTab** — уровень 3
- **Цель:** проверка моделей
- **Файлы:** `ModelTab.tsx`
- **Действие:** tool `find_model_tab_path_issues`
- **Проверка:** отчёт


**456 · S · Авто-обнаружение неправильных путей в BehaviorTab** — уровень 3
- **Цель:** проверка поведения агента
- **Файлы:** `BehaviorTab.tsx`
- **Действие:** tool `find_behavior_tab_path_issues`
- **Проверка:** отчёт


**457 · M · Авто-обнаружение неправильных путей в PerformanceTab** — уровень 3
- **Цель:** проверка производительности
- **Файлы:** `PerformanceTab.tsx`
- **Действие:** tool `find_performance_tab_path_issues`
- **Проверка:** отчёт


**458 · S · Авто-обнаружение неправильных путей в SkillsPanel** — уровень 3
- **Цель:** проверка skills
- **Файлы:** `SkillsPanel.tsx`
- **Действие:** tool `find_skills_panel_path_issues`
- **Проверка:** отчёт


**459 · M · Авто-обнаружение неправильных путей в MemoryPanel** — уровень 3
- **Цель:** проверка памяти
- **Файлы:** `MemoryPanel.tsx`
- **Действие:** tool `find_memory_panel_path_issues`
- **Проверка:** отчёт


**460 · S · Авто-обнаружение неправильных путей в SelfImprovePanel** — уровень 3
- **Цель:** проверка самообучения
- **Файлы:** `SelfImprovePanel.tsx`
- **Действие:** tool `find_self_improve_panel_path_issues`
- **Проверка:** отчёт


**461 · M · Авто-обнаружение неправильных путей в AgentStatusBar** — уровень 3
- **Цель:** проверка статуса
- **Файлы:** `AgentStatusBar.tsx`
- **Действие:** tool `find_agent_status_bar_path_issues`
- **Проверка:** отчёт


**462 · S · Авто-обнаружение неправильных путей в QueueContext** — уровень 3
- **Цель:** проверка очереди
- **Файлы:** `QueueContext.tsx`
- **Действие:** tool `find_queue_context_path_issues`
- **Проверка:** отчёт


**463 · M · Авто-обнаружение неправильных путей в agentLogger** — уровень 3
- **Цель:** проверка логов
- **Файлы:** `agentLogger.ts`
- **Действие:** tool `find_agent_logger_path_issues`
- **Проверка:** отчёт


**464 · S · Авто-обнаружение неправильных путей в agentContext** — уровень 3
- **Цель:** проверка контекста
- **Файлы:** `agentContext.ts`
- **Действие:** tool `find_agent_context_path_issues`
- **Проверка:** отчёт


**465 · M · Авто-обнаружение неправильных путей в agent.ts** — уровень 3
- **Цель:** проверка AgentRunner
- **Файлы:** `agent.ts`
- **Действие:** tool `find_agent_runner_path_issues`
- **Проверка:** отчёт


**466 · S · Авто-обнаружение неправильных путей в agentHandlersProject** — уровень 3
- **Цель:** проверка handlers
- **Файлы:** `agentHandlersProject/*`
- **Действие:** tool `find_project_handlers_path_issues`
- **Проверка:** отчёт


**467 · M · Авто-обнаружение неправильных путей в agentTools** — уровень 3
- **Цель:** проверка tools
- **Файлы:** `agentTools/*`
- **Действие:** tool `find_agent_tools_path_issues`
- **Проверка:** отчёт


**468 · S · Авто-обнаружение неправильных путей в modelRuntime** — уровень 3
- **Цель:** проверка runtime
- **Файлы:** `modelRuntime.ts`
- **Действие:** tool `find_model_runtime_path_issues`
- **Проверка:** отчёт


**469 · M · Авто-обнаружение неправильных путей в provider-модулях** — уровень 3
- **Цель:** проверка провайдеров
- **Файлы:** `providers/*`
- **Действие:** tool `find_provider_path_issues`
- **Проверка:** отчёт


**470 · S · Авто-обнаружение неправильных путей в commandRunner** — уровень 3
- **Цель:** проверка команд
- **Файлы:** `commandRunner.ts`
- **Действие:** tool `find_command_runner_path_issues`
- **Проверка:** отчёт


**471 · M · Авто-обнаружение неправильных путей в fileServices** — уровень 3
- **Цель:** проверка файловых операций
- **Файлы:** `fileServices.ts`
- **Действие:** tool `find_file_services_path_issues`
- **Проверка:** отчёт


**472 · S · Авто-обнаружение неправильных путей в ipcContracts** — уровень 3
- **Цель:** проверка IPC схем
- **Файлы:** `ipcContracts.ts`
- **Действие:** tool `find_ipc_contracts_path_issues`
- **Проверка:** отчёт


**473 · M · Авто-обнаружение неправильных путей в preload.ts** — уровень 3
- **Цель:** проверка preload
- **Файлы:** `electron/preload/index.ts`
- **Действие:** tool `find_preload_path_issues`
- **Проверка:** отчёт


**474 · S · Авто-обнаружение неправильных путей в main/index.ts** — уровень 3
- **Цель:** проверка main
- **Файлы:** `app/electron/main/index.ts`
- **Действие:** tool `find_main_index_path_issues`
- **Проверка:** отчёт

**475 · M · find_symbol для Q#** — уровень 3
- **Цель:** `find_symbol` / `find_references` для `.qs` (operation/function)  
- **Файлы:** `symbolIndex.ts`, `agentHandlersProjectSearch.ts`  
- **Действие:** парсер Q# → символы с `path:line:col`  
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.qs` файлом


**476 · M · find_symbol для Hack** — уровень 3
- **Цель:** символы для `.hack` (class/function)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход Hack/HHVM объявлений  
- **Проверка:** unit-тест: `class Foo` находится по имени


**477 · M · find_symbol для Mojo** — уровень 3
- **Цель:** символы для `.mojo` / `.🔥` (fn/struct)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** синтаксический обход Mojo объявлений  
- **Проверка:** unit-тест: `fn main` находится по имени


**478 · M · find_symbol для Zig** — уровень 3
- **Цель:** символы для `.zig` (fn/struct/const)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход Zig top-level объявлений  
- **Проверка:** unit-тест: `pub fn main` и `const Foo` находятся по имени


**479 · M · find_symbol для Red** — уровень 3
- **Цель:** символы для `.red` / `.reds` (function/entity)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** regex для Red dialect объявлений  
- **Проверка:** unit-тест: `func` находится по имени


**480 · M · find_symbol для ReScript** — уровень 3
- **Цель:** символы для `.res` / `.resi` (let/type/module)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** парсер ReScript → объявления с позицией  
- **Проверка:** unit-тест: `let foo` и `type bar` находятся по имени


**481 · M · find_symbol для Elm** — уровень 3
- **Цель:** символы для `.elm` (type/func/module)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход Elm module declarations  
- **Проверка:** unit-тест: `type Foo` находится по имени


**482 · M · find_symbol для Futhark** — уровень 3
- **Цель:** символы для `.fut` (entry/def)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход Futhark объявлений  
- **Проверка:** unit-тест: `entry main` находится по имени


**483 · M · find_symbol для Idris** — уровень 3
- **Цель:** символы для `.idr` (data/type/func)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** синтаксический обход Idris  
- **Проверка:** unit-тест: `foo :` и `data Bar` находятся по имени


**484 · M · find_symbol для Mercury** — уровень 3
- **Цель:** символы для `.m` (Mercury — predicate/type)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** обход `:- pred` / `:- type` объявлений  
- **Проверка:** unit-тест: predicate находится по имени


**485 · M · LSP для Q#** — уровень 3
- **Цель:** hover/definition для `.qs` через Q# language server  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn qsharp-lang или аналог  
- **Проверка:** при наличии LSP — переход к operation


**486 · M · LSP для Hack** — уровень 3
- **Цель:** hover/definition для `.hack` через HHVM IDE tools  
- **Файлы:** `lspClient.ts`  
- **Действие:** ветка Hack language server  
- **Проверка:** Ctrl+click на method → переход к определению


**487 · M · LSP для Mojo** — уровень 3
- **Цель:** hover/definition для `.mojo` через mojo LSP (если доступен)  
- **Файлы:** `lspClient.ts`  
- **Действие:** опциональный spawn; graceful fallback  
- **Проверка:** при наличии LSP — переход к `fn`


**488 · M · LSP для Zig** — уровень 3
- **Цель:** hover/definition для `.zig` через ZLS  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn zig language server  
- **Проверка:** Ctrl+click на `fn` → переход к определению


**489 · M · LSP для Red** — уровень 3
- **Цель:** hover/definition для `.red` — ограниченная поддержка  
- **Файлы:** `lspClient.ts`  
- **Действие:** syntax service или fallback  
- **Проверка:** отчёт о доступности LSP


**490 · M · LSP для ReScript** — уровень 3
- **Цель:** hover/definition для `.res` через rescript-language-server  
- **Файлы:** `lspClient.ts`  
- **Действие:** spawn ReScript LSP  
- **Проверка:** Ctrl+click на `let` → переход к определению


**491 · M · LSP для Elm** — уровень 3
- **Цель:** hover/definition для `.elm` через elm-language-server  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** spawn elm make LSP backend  
- **Проверка:** Ctrl+click на type → переход к определению


**492 · M · LSP для Futhark** — уровень 3
- **Цель:** hover/definition для `.fut` через futhark LSP (если установлен)  
- **Файлы:** `lspClient.ts`  
- **Действие:** опциональный spawn  
- **Проверка:** при наличии LSP — переход к `entry`


**493 · M · LSP для Idris** — уровень 3
- **Цель:** hover/definition для `.idr` через idris2-lsp  
- **Файлы:** `lspClient.ts`  
- **Действие:** spawn Idris 2 language server  
- **Проверка:** Ctrl+click на function → переход к определению


**494 · M · LSP для Mercury** — уровень 3
- **Цель:** hover/definition для Mercury `.m` — опциональная поддержка  
- **Файлы:** `lspClient.ts`  
- **Действие:** graceful fallback если LSP недоступен  
- **Проверка:** отчёт о статусе LSP


**495 · M · Авто-генерация диаграмм потоков данных UI** — уровень 3
- **Цель:** tool `generate_ui_dataflow_diagram` — props/state/events между компонентами  
- **Файлы:** `app/src/components/`, `agentTools/core.ts`  
- **Действие:** Mermaid flowchart по React-дереву  
- **Проверка:** диаграмма для fixture UI module


**496 · M · Авто-генерация диаграмм потоков данных backend** — уровень 3
- **Цель:** tool `generate_backend_dataflow_diagram` — main process data paths  
- **Файлы:** `app/electron/main/`, `ArchitecturePanel.tsx`  
- **Действие:** handlers → services → FS/network  
- **Проверка:** DFD в чате или панели


**497 · M · Авто-генерация диаграмм потоков данных агента** — уровень 3
- **Цель:** tool `generate_agent_dataflow_diagram` — prompt → model → tools → response  
- **Файлы:** `agent.ts`, `agentContext.ts`  
- **Действие:** ReAct loop dataflow Mermaid  
- **Проверка:** trace + diagram согласованы для fixture run


**498 · M · Авто-генерация диаграмм потоков данных плагинов** — уровень 3
- **Цель:** tool `generate_plugin_dataflow_diagram` — plugin → agent tools  
- **Файлы:** `plugins/`, `agentTools/core.ts`  
- **Действие:** scan plugins → flowchart  
- **Проверка:** fixture plugin на диаграмме


**499 · M · Авто-генерация диаграмм потоков данных RAG** — уровень 3
- **Цель:** tool `generate_rag_dataflow_diagram` — ingest → embed → index → search  
- **Файлы:** `rag.ts`, `vectorStore.ts`  
- **Действие:** pipeline Mermaid  
- **Проверка:** diagram покрывает `search_knowledge_base` path


**500 · M · Авто-генерация диаграмм потоков данных P2P** — уровень 3
- **Цель:** tool `generate_p2p_dataflow_diagram` — client ↔ server ↔ nodes  
- **Файлы:** `p2pClient.ts`, `server/p2p/`  
- **Действие:** WSS relay flow Mermaid  
- **Проверка:** diagram для fixture topology


**501 · M · Авто-генерация диаграмм потоков данных CI/CD** — уровень 3
- **Цель:** tool `generate_cicd_dataflow_diagram` — trigger → jobs → artifacts  
- **Файлы:** `.github/workflows/*`, `agentTools/integrations.ts`  
- **Действие:** YAML → dataflow flowchart  
- **Проверка:** соответствует fixture workflow


**502 · M · Авто-генерация диаграмм потоков данных worktree** — уровень 3
- **Цель:** tool `generate_worktree_dataflow_diagram` — chat → worktree → agent root  
- **Файлы:** `gitWorktree.ts`, `chats.ts`, `agent.ts`  
- **Действие:** path resolution flow Mermaid  
- **Проверка:** diagram описывает `resolveProjectRoot`


**503 · M · Авто-генерация диаграмм потоков данных IPC** — уровень 3
- **Цель:** tool `generate_ipc_dataflow_diagram` — renderer ↔ preload ↔ main  
- **Файлы:** `shared/ipc/channels.ts`, `electron/preload/`  
- **Действие:** sequence + data payload hints  
- **Проверка:** fixture IPC channel на диаграмме


**504 · M · Авто-генерация диаграмм потоков данных settings** — уровень 3
- **Цель:** tool `generate_settings_dataflow_diagram` — UI → IPC → settings.json  
- **Файлы:** `settings.ts`, `SettingsModal/*`  
- **Действие:** load/save/normalize flow  
- **Проверка:** diagram покрывает `loadSettings` path


**505 · M · Авто-генерация отчёта по качеству архитектуры UI** — уровень 3
- **Цель:** tool `generate_ui_architecture_quality_report` — слои, coupling, размер компонентов  
- **Файлы:** `app/src/components/`, `agentTools/core.ts`  
- **Действие:** read-only MD отчёт  
- **Проверка:** отчёт без write_file


**506 · M · Авто-генерация отчёта по качеству архитектуры backend** — уровень 3
- **Цель:** tool `generate_backend_architecture_quality_report` — модули main, зависимости  
- **Файлы:** `app/electron/main/`  
- **Действие:** import graph + рекомендации  
- **Проверка:** отчёт описывает handler layers


**507 · M · Авто-генерация отчёта по качеству архитектуры агента** — уровень 3
- **Цель:** tool `generate_agent_architecture_quality_report` — loop, tools, guards  
- **Файлы:** `agent.ts`, `agentTools/`  
- **Действие:** checklist + metrics  
- **Проверка:** отчёт содержит tool groups


**508 · M · Авто-генерация отчёта по качеству архитектуры плагинов** — уровень 3
- **Цель:** tool `generate_plugin_architecture_quality_report` — API surface, isolation  
- **Файлы:** `plugins/`, `docs/plugin-authoring.md`  
- **Действие:** scan + MD summary  
- **Проверка:** fixture plugin оценён в отчёте


**509 · M · Авто-генерация отчёта по качеству архитектуры RAG** — уровень 3
- **Цель:** tool `generate_rag_architecture_quality_report` — pipeline, stores, fallbacks  
- **Файлы:** `rag.ts`, `vectorStore.ts`  
- **Действие:** architecture checklist  
- **Проверка:** отчёт без write_file


**510 · M · Авто-генерация отчёта по качеству архитектуры P2P** — уровень 3
- **Цель:** tool `generate_p2p_architecture_quality_report` — router, credits, failover  
- **Файлы:** `server/p2p/`, `p2pClient.ts`  
- **Действие:** MD quality report  
- **Проверка:** отчёт перечисляет router/credits


**511 · M · Авто-генерация отчёта по качеству архитектуры CI/CD** — уровень 3
- **Цель:** tool `generate_cicd_architecture_quality_report` — jobs, parallelism, secrets  
- **Файлы:** `.github/workflows/*`  
- **Действие:** YAML analysis + best practices  
- **Проверка:** отчёт для fixture ci.yml


**512 · M · Авто-генерация отчёта по качеству архитектуры worktree** — уровень 3
- **Цель:** tool `generate_worktree_architecture_quality_report` — isolation, cleanup, chat bind  
- **Файлы:** `gitWorktree.ts`, `chats.ts`  
- **Действие:** flow + risk assessment  
- **Проверка:** отчёт описывает worktree lifecycle


**513 · M · Авто-генерация отчёта по качеству архитектуры IPC** — уровень 3
- **Цель:** tool `generate_ipc_architecture_quality_report` — channels, schemas, drift  
- **Файлы:** `shared/ipcContracts.ts`, `register*Ipc.ts`  
- **Действие:** Zod vs handlers cross-check  
- **Проверка:** отчёт находит schema drift в fixture


**514 · M · Авто-генерация отчёта по качеству архитектуры settings** — уровень 3
- **Цель:** tool `generate_settings_architecture_quality_report` — schema, defaults, migration  
- **Файлы:** `settings.ts`, `types.ts`  
- **Действие:** Zod schema audit  
- **Проверка:** отчёт перечисляет optional fields без default
