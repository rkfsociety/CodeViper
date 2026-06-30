# M: UX, ????????? ? VCS

?????? 136?180: UI-?????????, ?????????, git ? ??????? ?????????? ????????.

????? ???????: 45.

**136 · M · Аудит focus trap в модалках** — уровень 2
- **Цель:** все `role="dialog"` используют `useModalA11y` + Tab cycle
- **Файлы:** модалки без хука (`MetricsPanel`, `TracePanel`, …)
- **Действие:** подключить `useModalA11y`; initial focus на первый интерактивный элемент
- **Проверка:** Tab не уходит за пределы открытой модалки
**137 · M · Просмотр NDJSON-логов агента** — уровень 2
- **Цель:** вкладка или панель «Логи» — tail `agent-*.ndjson`
- **Файлы:** `agentLogger.ts`, `LogViewerPanel.tsx`, IPC `read-agent-logs`
- **Действие:** фильтр по event type; последние 500 строк
- **Проверка:** после прогона логи видны в UI
**138 · M · Клик по пути в code block → открыть файл** — уровень 2
- **Цель:** `src/foo.ts:12` в коде → открыть в превью (п. 8–10)
- **Файлы:** `MessageBody.tsx`, `App.tsx`
- **Действие:** regex path:line; IPC read + preview
- **Проверка:** клик открывает файл на строке
**139 · M · Субагент Reviewer** — уровень 2
- **Цель:** `delegate_to_reviewer` — read-only обзор diff без правок
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`, `agent.ts`
- **Проверка:** unit-тест контракта; чип «Ревью…»
**140 · M · Субагент Tester** — уровень 2
- **Цель:** `delegate_to_tester` — только `run_tests` / `run_command` test
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`
- **Проверка:** не вызывает write_file
**141 · M · git_blame и git_show** — уровень 2
- **Цель:** read-only `git_blame` (path, line?) и `git_show` (commit, path?)
- **Файлы:** `gitTools.ts`, `agentTools/core.ts`, `agentHandlersProject.ts`
- **Действие:** лимит строк вывода; только внутри projectPath
- **Проверка:** unit-тест temp git repo
**142 · M · diff_files** — уровень 2
- **Цель:** unified diff двух файлов проекта без git
- **Файлы:** `diffUtil.ts`, `agentTools/core.ts`, `agentHandlersProjectFile.ts`
- **Действие:** параметры `path_a`, `path_b`; оба внутри projectPath
- **Проверка:** unit-тест на два fixture-файла
**143 · M · read_agent_log** — уровень 2
- **Цель:** tool `read_agent_log` — tail `agent-*.ndjson` (до UI LogViewerPanel)
- **Файлы:** `agentLogger.ts`, `agentTools/integrations.ts`, handler
- **Действие:** параметры `lines?` (default 100), `event?`; NDJSON → текст
- **Проверка:** unit-тест на fixture log file
**144 · M · npm_install / add_package** — уровень 2
- **Цель:** безопасная установка зависимостей без произвольного `run_command`
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`, `commandRunner.ts`
- **Действие:** `npm_install` с `package`, `dev?`; блок `&&` и лишних флагов
- **Проверка:** unit-тест: опасная строка → отказ
**145 · M · E2E: smoke настройки и отправка** — уровень 2
- **Цель:** Playwright-тест: открыть настройки → закрыть → ввести промпт (mock LLM)
- **Файлы:** `app/e2e/smoke.spec.ts`
- **Действие:** `CODEVIPER_E2E=1`; stub agent-stream или пустой ответ
- **Проверка:** `npm run test:e2e` — новый тест зелёный в CI
**146 · M · Component test MessageRow** — уровень 2
- **Цель:** vitest + @testing-library/react для pin/retry menu
- **Файлы:** `tests/MessageRow.test.tsx`, vitest config jsdom
- **Проверка:** `npm test -- MessageRow`
**147 · M · E2E: навигация по вкладкам настроек** — уровень 2
- **Файлы:** `e2e/settings.test.ts`
- **Проверка:** `npm run test:e2e`
**148 · M · ModelTab: формы провайдеров** — уровень 2
- **Цель:** вынести JSX-блоки `provider === '…'` в `ModelTab/providers/*.tsx`
- **Файлы:** `SettingsModal/ModelTab.tsx` → `SettingsModal/ModelTab/providers/` (Ollama, DeepSeek, Gemini, …)
- **Действие:** каждый провайдер — отдельный компонент с props `{ settings, onSettingsChange }`; ModelTab — switch по `modelProvider`
- **Проверка:** `npm run typecheck`; смена провайдера в настройках работает как раньше
**149 · M · ModelTab: оркестратор, бенчмарк, канал обновлений** — уровень 2
- **Цель:** вынести нижнюю часть ModelTab (~300 строк) в отдельные секции
- **Файлы:** `OrchestratorSection.tsx`, `BenchmarkSection.tsx`, `UpdateChannelSection.tsx` в `SettingsModal/ModelTab/`
- **Действие:** перенести GGUF-download, benchmark, orchestrator toggle, beta-channel без изменения логики
- **Проверка:** бенчмарк и скачивание GGUF работают; `ModelTab.tsx` < 400 строк
**150 · M · Экспорт чата в Markdown** — уровень 2
- **Цель:** кнопка в меню чата → `.md` с ролями и код-блоками
- **Файлы:** `ChatHistoryPanel.tsx`, `chats.ts`, `registerChatsIpc.ts`
- **Действие:** `export-chat-markdown` IPC + save dialog
- **Проверка:** файл читается в любом MD-viewer
**151 · M · IPC export-chat** — уровень 2
- **Цель:** экспорт сообщений и метаданных чата в JSON
- **Файлы:** `chats.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`
- **Действие:** `export-chat` → `{ messages, settings, projectPath }`; save dialog
- **Проверка:** экспорт → файл валидный JSON с messages
**152 · M · IPC import-chat** — уровень 2
- **Цель:** импорт чата из JSON в новый чат в store
- **Файлы:** `chats.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`
- **Действие:** open dialog → parse → `createChat` с messages
- **Проверка:** импортированный чат отображает историю
**153 · M · CodeEditorPanel на CodeMirror** — уровень 2
- **Цель:** редактируемая вкладка файла вместо read-only `FilePreviewPanel` (п. 9)
- **Файлы:** `app/src/components/CodeEditorPanel.tsx`, `app/package.json`
- **Действие:** зависимость `@codemirror/*`; обёртка с темой под тёмный UI
- **Проверка:** файл открывается в редакторе; курсор и правка работают
**154 · M · Сохранение из редактора** — уровень 2
- **Цель:** Ctrl+S / кнопка «Сохранить» пишет файл через существующий IPC
- **Файлы:** `CodeEditorPanel.tsx`, `app/electron/main/ipc/registerFileIpc.ts`
- **Действие:** `window.codeviper.writeFile(path, content)`; индикатор «несохранено»
- **Проверка:** правка + сохранение → содержимое на диске изменилось
**155 · M · Subagent Architect — анализ структуры проекта** — уровень 2
- **Цель:** read-only анализ архитектуры: циклы импортов, крупные модули
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** tool `delegate_to_architect`
- **Проверка:** unit-тест: архитектурный отчёт без write_file
**156 · M · Subagent Documenter — генерация документации** — уровень 2
- **Цель:** read-only генерация README/API-доков
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`
- **Действие:** tool `delegate_to_documenter`
- **Проверка:** unit-тест: генерируется MD-текст
**157 · M · Subagent Security — поиск секретов и unsafe команд** — уровень 2
- **Цель:** read-only security-review проекта
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`
- **Действие:** tool `delegate_to_security`
- **Проверка:** unit-тест: находит секреты в фикстуре
**158 · M · Авто-генерация новых пунктов ROADMAP** — уровень 2
- **Цель:** tool `suggest_new_roadmap_items` на основе trace ошибок
- **Файлы:** `agentTools/mcp.ts`, `agentLogger.ts`
- **Действие:** генерация S/M задач
- **Проверка:** новые пункты появляются в конце уровня
**159 · M · Self-Improvement Queue Panel** — уровень 2
- **Цель:** UI-панель очереди самоулучшения
- **Файлы:** `SelfImprovePanel.tsx`, `AgentStatusBar.tsx`
- **Действие:** список пунктов 1…134 + статус
- **Проверка:** очередь видна в UI
**160 · M · Авто-цепочки задач** — уровень 2
- **Цель:** tool `plan_task_chain` → разбиение промпта на шаги
- **Файлы:** `agent.ts`, `agentContext.ts`
- **Действие:** цепочка шагов в trace
- **Проверка:** trace содержит план
**161 · M · Граф архитектуры проекта** — уровень 2
- **Цель:** визуализация импортов и модулей
- **Файлы:** `ArchitecturePanel.tsx`, `agentHandlersProjectSearch.ts`
- **Действие:** построение графа
- **Проверка:** UI показывает граф
**162 · M · Авто-генерация тестов для новых файлов** — уровень 2
- **Цель:** tool `generate_tests_for_file`
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectFile.ts`
- **Действие:** генерация тестов
- **Проверка:** тесты создаются
**163 · M · Авто-документирование новых функций** — уровень 2
- **Цель:** tool `generate_docstring`
- **Файлы:** `agentTools/core.ts`
- **Действие:** вставка docstring
- **Проверка:** docstring появляется
**164 · M · Авто-оптимизация больших файлов** — уровень 2
- **Цель:** tool `refactor_large_file`
- **Файлы:** `agentTools/core.ts`
- **Действие:** разбиение файла
- **Проверка:** файл разделён
**165 · M · Авто-обновление зависимостей** — уровень 2
- **Цель:** безопасный `update_dependencies`
- **Файлы:** `agentHandlersProjectTerminal.ts`, `commandRunner.ts`
- **Действие:** обновление minor/patch
- **Проверка:** зависимости обновлены
**166 · M · Авто-генерация CHANGELOG** — уровень 2
- **Цель:** tool `generate_changelog`
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** MD-файл
- **Проверка:** CHANGELOG.md создан
**167 · M · Авто-проверка лицензий** — уровень 2
- **Цель:** tool `check_licenses`
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** анализ зависимостей
- **Проверка:** отчёт в чате
**168 · M · Subagent Refactorer — автоматический рефакторинг** — уровень 2
- **Цель:** read-only анализ + предложения по рефакторингу крупных модулей
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`
- **Действие:** tool `delegate_to_refactorer`
- **Проверка:** unit-тест: отчёт без write_file
**169 · M · Авто-генерация Roadmap Chains** — уровень 2
- **Цель:** tool `generate_roadmap_chain` → объединение связанных пунктов
- **Файлы:** `agentTools/mcp.ts`
- **Действие:** цепочка из 3–5 пунктов
- **Проверка:** chain отображается в UI
**170 · M · Subagent Performance — анализ производительности проекта** — уровень 2
- **Цель:** выявлять медленные функции, тяжёлые модули, узкие места
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`
- **Действие:** tool `delegate_to_performance`
- **Проверка:** отчёт без write_file
**171 · M · Subagent Compliance — проверка соответствия стандартам** — уровень 2
- **Цель:** read-only проверка проекта на соответствие корпоративным стандартам
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`
- **Действие:** tool `delegate_to_compliance`
- **Проверка:** отчёт без write_file
**172 · M · Subagent Referee — сравнение двух решений** — уровень 2
- **Цель:** read-only сравнение двух вариантов кода или двух ответов агента
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`
- **Действие:** tool `delegate_to_referee`
- **Проверка:** отчёт без write_file
**173 · M · find_symbol для Go** — уровень 3
- **Цель:** `find_symbol` / `find_references` для `.go` через `go/ast` или tree-sitter
- **Файлы:** `app/electron/main/symbolIndex.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** парсер Go → символы с `path:line:col`
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.go` файлом
**174 · M · find_symbol для Rust** — уровень 3
- **Цель:** символы для `.rs` (tree-sitter-rust или синтаксический обход)
- **Файлы:** `symbolIndex.ts`
- **Действие:** расширить `walkProjectForSymbols` для `.rs`
- **Проверка:** unit-тест: `fn main` и `struct Foo` находятся по имени
**175 · M · find_symbol для Java** — уровень 3
- **Цель:** символы для `.java` (class/method)
- **Файлы:** `symbolIndex.ts`
- **Действие:** regex или tree-sitter-java для объявлений top-level
- **Проверка:** unit-тест на простом `.java` с `public class Bar`
**176 · M · gitWorktree.ts** — уровень 3
- **Цель:** create / remove / list worktrees через `git worktree`
- **Файлы:** `app/electron/main/gitWorktree.ts` (новый), `gitTools.ts`
- **Действие:** `createWorktree(repoPath, branch)` → путь worktree; `removeWorktree`
- **Проверка:** unit-тест с temp git repo; `git worktree list` содержит запись
**177 · M · worktreePath в чате + IPC** — уровень 3
- **Цель:** поле `worktreePath?` в persisted chat; IPC `create-chat-worktree`
- **Файлы:** `chats.ts`, `types.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`
- **Действие:** кнопка «Изолировать в worktree» в меню чата
- **Проверка:** новый чат получает отдельную папку worktree
**178 · M · AgentRunner — корень worktree** — уровень 3
- **Цель:** если у чата есть `worktreePath`, агент работает в нём, а не в `projectPath`
- **Файлы:** `agent.ts`, `registerAgentIpc.ts`, `agentHandlersProjectContext.ts`
- **Действие:** `resolveProjectRoot(chat)` → `worktreePath ?? projectPath`
- **Проверка:** правка файла в изолированном чате не затрагивает основную копию
**179 · M · ipcContracts: Zod-схемы данных** — уровень 3
- **Цель:** схемы `ChatMessage`, `AgentSettings`, `SavedChat` и др. — в `shared/ipc/schemas.ts`
- **Файлы:** `shared/ipcContracts.ts` → `shared/ipc/schemas.ts`
- **Действие:** re-export из `ipcContracts.ts` для обратной совместимости импортов
- **Проверка:** `npm run typecheck`; импорты `ChatMessageSchema` не сломаны
**180 · M · ipcContracts: IPC enum и Contracts** — уровень 3
- **Цель:** объект `IPC` и `Contracts` — в `shared/ipc/channels.ts`
- **Файлы:** `shared/ipcContracts.ts` → `shared/ipc/channels.ts`
- **Действие:** `ipcContracts.ts` — barrel re-export; `parseIpcArgs` остаётся рядом с Contracts
- **Проверка:** `npm run typecheck`; preload и register*Ipc компилируются
