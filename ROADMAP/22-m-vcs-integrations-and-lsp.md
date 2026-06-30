# M: VCS, ?????????? ? LSP I

?????? 181?225: VCS-??????????, worktree ? ?????? ????? LSP.

????? ???????: 45.

**181 · M · services.ts: файловые операции** — уровень 3
- **Цель:** `safeRead*`, `safeWrite*`, `buildFileTree`, кэши — в `fileServices.ts`
- **Файлы:** `services.ts` → `fileServices.ts`
- **Действие:** `services.ts` re-export для handler-импортов
- **Проверка:** `npm test -- services` зелёный
**182 · M · services.ts: runCommand** — уровень 3
- **Цель:** `validateCommand`, `normalizeCommand`, `runCommand`, лимит буфера — в `commandRunner.ts`
- **Файлы:** `services.ts` → `commandRunner.ts`
- **Действие:** handlers импортируют из `commandRunner.ts` или barrel `services.ts`
- **Проверка:** `npm test -- services.test` — validateCommand и buffer limit
**183 · M · Импорт skill из файла** — уровень 3
- **Цель:** кнопка «Импорт .md» → copy в skills dir
- **Файлы:** `SkillsPanel.tsx`, IPC `import-skill-file`
- **Проверка:** skill появляется в списке
**184 · M · Провайдер Mistral** — уровень 3
- **Цель:** `modelProvider: 'mistral'` через Mistral API
- **Файлы:** `mistralProvider.ts`, `modelRuntime.ts`, `constants.ts`
- **Действие:** `StreamingChatProvider` + список моделей
- **Проверка:** unit-тест stream parser
**185 · M · Bitbucket: create_pull_request** — уровень 3
- **Цель:** tool `create_bitbucket_pr` через REST API 2.0
- **Файлы:** `bitbucketTools.ts`, `agentTools/integrations.ts`, `IntegrationsTab.tsx`
- **Действие:** token + workspace/repo в settings
- **Проверка:** unit-тест с mock fetch
**186 · M · Azure DevOps: create_work_item** — уровень 3
- **Цель:** tool `create_ado_work_item` (PAT + org/project)
- **Файлы:** `adoTools.ts`, `integrations.ts`, settings
- **Действие:** WIQL/create work item REST
- **Проверка:** mock API test
**187 · M · lspClient — spawn language server** — уровень 3
- **Цель:** main-процесс запускает `typescript-language-server` / `pyright-langserver` по расширению файла
- **Файлы:** `app/electron/main/lspClient.ts` (новый)
- **Действие:** JSON-RPC over stdio; `didOpen`/`didChange`/`shutdown`
- **Проверка:** unit-тест с mock child_process; лог «LSP ready» для `.ts`
**188 · M · LSP hover и go-to-definition (TS/JS)** — уровень 3
- **Цель:** hover tooltip и Ctrl+click → переход к определению в `CodeEditorPanel` (п. 50)
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** IPC `lsp-request` → `textDocument/hover`, `textDocument/definition`
- **Проверка:** Ctrl+click на символ → курсор на определении в том же файле
**189 · M · LSP pyright для Python** — уровень 3
- **Цель:** те же hover/definition для `.py` через pyright-langserver
- **Файлы:** `lspClient.ts`
- **Действие:** ветка выбора сервера по `languageFromPath`; инициализация pyright
- **Проверка:** Ctrl+click на `def foo` в `.py` → переход к определению
**190 · M · Fetch remote skill manifest** — уровень 3
- **Цель:** список навыков с GitHub raw URL или индекс-файла
- **Файлы:** `app/electron/main/skills.ts`, `registerMiscIpc.ts`
- **Действие:** `list-remote-skills(url)` → `{ name, description, url }[]`
- **Проверка:** unit-тест с mock fetch на тестовый manifest.json
**191 · M · import-remote-skill UI** — уровень 3
- **Цель:** кнопка «Импорт из каталога» в SkillsPanel
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`
- **Действие:** выбор из списка → download SKILL.md → локальный skill
- **Проверка:** импорт skill из URL появляется в списке навыков
**192 · M · AutomationRule в settings** — уровень 3
- **Цель:** тип `{ id, cron, prompt, enabled }` + Zod-массив в настройках
- **Файлы:** `settings.ts`, `types.ts`
- **Действие:** `automations: AutomationRule[]` с default `[]`
- **Проверка:** `npm run typecheck`; сохранение массива в settings.json
**193 · M · automationScheduler в main** — уровень 3
- **Цель:** таймер проверяет cron-выражения и ставит промпт в очередь чата
- **Файлы:** `app/electron/main/automationScheduler.ts`, `index.ts`
- **Действие:** `node-cron` или setInterval + parse; emit в default chat
- **Проверка:** unit-тест: rule `* * * * *` + mock time → enqueue вызван
**194 · M · AutomationsTab в настройках** — уровень 3
- **Цель:** CRUD автоматизаций: cron, промпт, вкл/выкл
- **Файлы:** `SettingsModal/AutomationsTab.tsx`, `SettingsModal/index.tsx`
- **Действие:** форма добавления; список с удалением
- **Проверка:** созданная автоматизация сохраняется и видна после reopen settings
**195 · M · Дублировать промпт во второй чат** — уровень 3
- **Цель:** кнопка «Сравнить с другой моделью» копирует промпт в новый чат
- **Файлы:** `ChatPanel/index.tsx`, `ChatHistoryPanel.tsx`
- **Действие:** `createChat` + тот же `input` + подсказка выбрать модель
- **Проверка:** два чата с одинаковым первым сообщением пользователя
**196 · M · SplitChatView** — уровень 3
- **Цель:** два чата side-by-side для сравнения ответов
- **Файлы:** `app/src/App.tsx`, `SplitChatView.tsx`
- **Действие:** режим «Сравнение» — два `ChatPanel` с общим projectPath
- **Проверка:** оба чата видны одновременно; отправка в каждый независима
**197 · M · docker-compose для server/p2p** — уровень 3
- **Цель:** one-click деплой сигнального сервера + Redis
- **Файлы:** `server/p2p/docker-compose.yml`, `server/p2p/README.md`, `docs/integrations.md`
- **Действие:** сервисы `p2p` + `redis`; env-шаблон `.env.example`
- **Проверка:** `docker compose up` → `GET /health` → 200
**198 · M · Dashboard статуса узлов** — уровень 3
- **Цель:** `GET /admin/dashboard` — онлайн-узлы, задачи, кредиты (auth)
- **Файлы:** `server/p2p/src/routes/admin.ts`
- **Действие:** JSON `{ nodes, activeTasks, totalCredits }`
- **Проверка:** интеграционный тест с mock-узлами
**199 · M · Рейтинг узлов по latency** — уровень 3
- **Цель:** `router.ts` предпочитает узлы с меньшим средним RTT
- **Файлы:** `server/p2p/src/router.ts`, `server/p2p/src/credits.ts`
- **Действие:** хранить `avgLatencyMs` per node; сортировка при route
- **Проверка:** unit-тест: два узла → выбирается с меньшей latency
**200 · M · Reconnect с backoff** — уровень 3
- **Файлы:** `p2pClient.ts`
- **Действие:** exponential delay 1s→30s при обрыве WSS
- **Проверка:** unit-тест reconnect attempts
**201 · M · История P2P-задач** — уровень 3
- **Файлы:** `P2pHistoryPanel.tsx`, local NDJSON или settings
- **Проверка:** последние 20 relay в UI
**202 · M · find_symbol для C#** — уровень 3
- **Цель:** `find_symbol` / `find_references` для `.cs` (class/method/property)
- **Файлы:** `symbolIndex.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** парсер C# → символы с `path:line:col`
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.cs` файлом
**203 · M · find_symbol для PHP** — уровень 3
- **Цель:** символы для `.php` (class/function/namespace)
- **Файлы:** `symbolIndex.ts`
- **Действие:** расширить `walkProjectForSymbols` для `.php`
- **Проверка:** unit-тест: `class Foo` и `function bar` находятся по имени
**204 · M · find_symbol для Kotlin** — уровень 3
- **Цель:** символы для `.kt` / `.kts` (class/fun/object)
- **Файлы:** `symbolIndex.ts`
- **Действие:** tree-sitter-kotlin или синтаксический обход объявлений
- **Проверка:** unit-тест на `fun main` и `class Bar`
**205 · M · find_symbol для Swift** — уровень 3
- **Цель:** символы для `.swift` (struct/class/func)
- **Файлы:** `symbolIndex.ts`
- **Действие:** парсер Swift → top-level и nested объявления
- **Проверка:** unit-тест: `struct Foo` и `func bar` находятся по имени
**206 · M · LSP для Go** — уровень 3
- **Цель:** hover и go-to-definition для `.go` через `gopls`
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** ветка выбора сервера для Go; инициализация `gopls`
- **Проверка:** Ctrl+click на символ в `.go` → переход к определению
**207 · M · LSP для Rust** — уровень 3
- **Цель:** hover/definition для `.rs` через `rust-analyzer`
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** spawn `rust-analyzer`; `textDocument/hover`, `textDocument/definition`
- **Проверка:** Ctrl+click на `fn` в `.rs` → переход к определению
**208 · M · LSP для Java** — уровень 3
- **Цель:** hover/definition для `.java` через jdtls или аналог
- **Файлы:** `lspClient.ts`
- **Действие:** ветка Java language server; didOpen/didChange
- **Проверка:** Ctrl+click на метод в `.java` → переход к определению
**209 · M · LSP для C#** — уровень 3
- **Цель:** hover/definition для `.cs` через OmniSharp / csharp-ls
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** spawn C# language server по расширению `.cs`
- **Проверка:** Ctrl+click на класс в `.cs` → переход к определению
**210 · M · LSP для PHP** — уровень 3
- **Цель:** hover/definition для `.php` через intelephense / phpactor
- **Файлы:** `lspClient.ts`
- **Действие:** ветка PHP language server
- **Проверка:** Ctrl+click на `function` в `.php` → переход к определению
**211 · M · LSP для Swift** — уровень 3
- **Цель:** hover/definition для `.swift` через sourcekit-lsp
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** spawn `sourcekit-lsp`; IPC `lsp-request`
- **Проверка:** Ctrl+click на `func` в `.swift` → переход к определению
**212 · M · Авто-генерация UML диаграмм** — уровень 3
- **Цель:** tool `generate_uml_diagram` → Mermaid class/component diagram в чате
- **Файлы:** `agentTools/core.ts`, `MessageBody.tsx`
- **Действие:** анализ символов проекта → Mermaid-блок
- **Проверка:** диаграмма рендерится в ответе агента
**213 · M · Авто-генерация ER-диаграмм** — уровень 3
- **Цель:** tool `generate_er_diagram` из ORM-схем / SQL / Prisma
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** парсинг моделей → Mermaid erDiagram
- **Проверка:** ER-диаграмма для fixture-схемы
**214 · M · Авто-генерация sequence-диаграмм** — уровень 3
- **Цель:** tool `generate_sequence_diagram` по вызовам между модулями
- **Файлы:** `agentTools/core.ts`, `agentContext.ts`
- **Действие:** статический обход call graph → Mermaid sequenceDiagram
- **Проверка:** sequence-диаграмма в ответе агента
**215 · M · Авто-генерация диаграмм состояний** — уровень 3
- **Цель:** tool `generate_state_diagram` для state machines / reducers
- **Файлы:** `agentTools/core.ts`
- **Действие:** поиск enum/state → Mermaid stateDiagram-v2
- **Проверка:** диаграмма состояний для fixture reducer
**216 · M · Авто-генерация архитектурных отчётов** — уровень 3
- **Цель:** tool `generate_architecture_report` — MD-отчёт: модули, слои, риски
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`
- **Действие:** read-only сбор метрик + шаблон отчёта
- **Проверка:** unit-тест: отчёт без write_file
**217 · M · Авто-генерация отчёта по качеству кода** — уровень 3
- **Цель:** tool `generate_code_quality_report` — дубли, большие файлы, TODO, lint
- **Файлы:** `agentTools/core.ts`, `agentTools/integrations.ts`
- **Действие:** read-only анализ + сводка в MD
- **Проверка:** отчёт содержит найденные проблемы из fixture
**218 · M · Авто-обнаружение дублирующихся функций** — уровень 3
- **Цель:** tool `find_duplicate_functions`
- **Файлы:** `agentTools/core.ts`
- **Действие:** поиск похожих AST
- **Проверка:** список дубликатов
**219 · M · Авто-обнаружение неиспользуемых зависимостей** — уровень 3
- **Цель:** tool `find_unused_dependencies`
- **Файлы:** `agentHandlersProjectTerminal.ts`
- **Действие:** анализ import graph
- **Проверка:** список зависимостей
**220 · M · Авто-обнаружение устаревших API** — уровень 3
- **Цель:** tool `find_deprecated_api`
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** проверка по базе API
- **Проверка:** отчёт
**221 · M · Авто-обнаружение потенциальных утечек памяти** — уровень 3
- **Цель:** tool `find_memory_leaks`
- **Файлы:** `agentTools/core.ts`
- **Действие:** анализ JS/TS паттернов
- **Проверка:** отчёт
**222 · M · Авто-обнаружение неправильных async-паттернов** — уровень 3
- **Цель:** tool `find_async_issues`
- **Файлы:** `agentTools/core.ts`
- **Действие:** поиск забытых await
- **Проверка:** отчёт
**223 · M · Авто-обнаружение циклов в логике** — уровень 3
- **Цель:** tool `find_logic_cycles`
- **Файлы:** `agentTools/core.ts`
- **Действие:** анализ CFG
- **Проверка:** отчёт
**224 · M · Авто-обнаружение неэффективных структур данных** — уровень 3
- **Цель:** tool `find_data_structure_issues`
- **Файлы:** `agentTools/core.ts`
- **Действие:** анализ AST
- **Проверка:** отчёт
**225 · M · Авто-обнаружение неправильных путей в UI** — уровень 3
- **Цель:** tool `find_ui_path_issues`
- **Файлы:** `app/src/components/*`
- **Действие:** анализ JSX
- **Проверка:** отчёт
