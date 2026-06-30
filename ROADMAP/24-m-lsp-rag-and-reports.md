# M: Onboarding, RAG и отчёты

Пункты 258–302: onboarding, RAG, чанки, эмбеддинги и отчёты качества.

Всего пунктов: 45.

**258 · M · Авто-обнаружение неправильных onboarding-шагов** — уровень 3
- **Цель:** проверка визарда
- **Файлы:** `OnboardingWizard.tsx`
- **Действие:** анализ
- **Проверка:** отчёт


**259 · M · Авто-обнаружение неправильных trace-панелей** — уровень 3
- **Цель:** проверка TracePanel
- **Файлы:** `TracePanel.tsx`
- **Действие:** анализ
- **Проверка:** отчёт


**260 · M · find_symbol для COBOL** — уровень 3
- **Цель:** `find_symbol` / `find_references` для `.cob` / `.cbl` (program/paragraph)
- **Файлы:** `symbolIndex.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** парсер COBOL → символы с `path:line:col`
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.cob` файлом


**261 · M · find_symbol для Fortran** — уровень 3
- **Цель:** символы для `.f` / `.f90` (subroutine/function/module)
- **Файлы:** `symbolIndex.ts`
- **Действие:** расширить `walkProjectForSymbols` для Fortran
- **Проверка:** unit-тест: `subroutine foo` находится по имени


**262 · M · find_symbol для Erlang** — уровень 3
- **Цель:** символы для `.erl` / `.hrl` (module/function)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход `-module` / `-export` объявлений
- **Проверка:** unit-тест: `foo()` в `.erl` находится по имени


**263 · M · find_symbol для F#** — уровень 3
- **Цель:** символы для `.fs` / `.fsx` (module/let/type)
- **Файлы:** `symbolIndex.ts`
- **Действие:** синтаксический обход объявлений F#
- **Проверка:** unit-тест: `let foo` и `type Bar` находятся по имени


**264 · M · find_symbol для Prolog** — уровень 3
- **Цель:** символы для `.pl` / `.pro` (predicate)
- **Файлы:** `symbolIndex.ts`
- **Действие:** regex для `name(` предикатов
- **Проверка:** unit-тест: предикат находится по имени


**265 · M · find_symbol для Scheme** — уровень 3
- **Цель:** символы для `.scm` / `.ss` (define/lambda)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход `(define` форм
- **Проверка:** unit-тест: `(define foo` находится по имени


**266 · M · find_symbol для Lisp** — уровень 3
- **Цель:** символы для `.lisp` / `.cl` (defun/defclass)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход Common Lisp объявлений
- **Проверка:** unit-тест: `defun foo` находится по имени


**267 · M · find_symbol для Solidity** — уровень 3
- **Цель:** символы для `.sol` (contract/function/event)
- **Файлы:** `symbolIndex.ts`
- **Действие:** парсер Solidity → объявления с позицией
- **Проверка:** unit-тест: `contract Foo` и `function bar` находятся по имени


**268 · M · find_symbol для VHDL** — уровень 3
- **Цель:** символы для `.vhd` / `.vhdl` (entity/architecture)
- **Файлы:** `symbolIndex.ts`
- **Действие:** regex для `entity` / `architecture`
- **Проверка:** unit-тест: entity находится по имени


**269 · M · find_symbol для Verilog** — уровень 3
- **Цель:** символы для `.v` / `.sv` (module)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход `module` объявлений
- **Проверка:** unit-тест: `module foo` находится по имени


**270 · M · LSP для COBOL** — уровень 3
- **Цель:** hover и go-to-definition для COBOL через language server (если установлен)
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** опциональный spawn; graceful fallback
- **Проверка:** при наличии LSP — переход к определению в `.cob`


**271 · M · LSP для Fortran** — уровень 3
- **Цель:** hover/definition для `.f90` через fortls или аналог
- **Файлы:** `lspClient.ts`
- **Действие:** ветка Fortran language server
- **Проверка:** Ctrl+click на subroutine → переход к определению


**272 · M · LSP для Erlang** — уровень 3
- **Цель:** hover/definition для `.erl` через erlang_ls
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** spawn erlang_ls
- **Проверка:** Ctrl+click на функцию в `.erl` → переход к определению


**273 · M · LSP для F#** — уровень 3
- **Цель:** hover/definition для `.fs` через FsAutoComplete
- **Файлы:** `lspClient.ts`
- **Действие:** spawn FsAutoComplete / Ionide backend
- **Проверка:** Ctrl+click на `let` в `.fs` → переход к определению


**274 · M · LSP для Prolog** — уровень 3
- **Цель:** hover/definition для `.pl` через SWI-Prolog LSP или аналог
- **Файлы:** `lspClient.ts`
- **Действие:** опциональный spawn Prolog language server
- **Проверка:** при наличии LSP — переход к предикату


**275 · M · LSP для Scheme** — уровень 3
- **Цель:** hover/definition для `.scm` через racket/langserver или аналог
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** ветка Scheme language server
- **Проверка:** Ctrl+click на define → переход к определению


**276 · M · LSP для Lisp** — уровень 3
- **Цель:** hover/definition для `.lisp` через alive-lsp / clangd аналог для CL
- **Файлы:** `lspClient.ts`
- **Действие:** spawn Lisp language server если доступен
- **Проверка:** при наличии LSP — переход к `defun`


**277 · M · LSP для Solidity** — уровень 3
- **Цель:** hover/definition для `.sol` через solidity language server
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** spawn nomicfoundation/solidity-language-server
- **Проверка:** Ctrl+click на contract/function → переход к определению


**278 · M · LSP для VHDL** — уровень 3
- **Цель:** hover/definition для `.vhd` через vhdl_ls
- **Файлы:** `lspClient.ts`
- **Действие:** spawn vhdl language server
- **Проверка:** Ctrl+click на entity → переход к определению


**279 · M · LSP для Verilog** — уровень 3
- **Цель:** hover/definition для `.v` через verible или svls
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** spawn Verilog/SystemVerilog language server
- **Проверка:** Ctrl+click на module → переход к определению


**280 · M · Авто-генерация диаграмм потоков управления** — уровень 3
- **Цель:** tool `generate_cfg_diagram` — CFG функции/модуля в Mermaid
- **Файлы:** `agentTools/core.ts`, `MessageBody.tsx`
- **Действие:** статический обход AST → flowchart
- **Проверка:** диаграмма рендерится для fixture-функции


**281 · M · Авто-генерация диаграмм зависимостей модулей** — уровень 3
- **Цель:** tool `generate_module_dependency_diagram` — граф модулей проекта
- **Файлы:** `agentHandlersProjectSearch.ts`, `ArchitecturePanel.tsx`
- **Действие:** import graph → Mermaid graph TD
- **Проверка:** диаграмма отображается в UI или чате


**282 · M · Авто-генерация диаграмм взаимодействия компонентов** — уровень 3
- **Цель:** tool `generate_component_interaction_diagram` — React/Electron компоненты
- **Файлы:** `agentTools/core.ts`, `app/src/components/`
- **Действие:** props/callbacks → sequence или component diagram
- **Проверка:** Mermaid-блок для fixture-компонентов


**283 · M · Авто-генерация диаграмм API** — уровень 3
- **Цель:** tool `generate_api_diagram` — IPC и REST endpoints
- **Файлы:** `shared/ipc/channels.ts`, `agentTools/core.ts`
- **Действие:** scan IPC + routes → Mermaid
- **Проверка:** диаграмма покрывает fixture IPC-каналы


**284 · M · Авто-генерация диаграмм тестового покрытия** — уровень 3
- **Цель:** tool `generate_coverage_diagram` — файлы vs тесты
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectFile.ts`
- **Действие:** сопоставление `src` ↔ `tests` → heatmap Mermaid
- **Проверка:** отчёт показывает непокрытые модули из fixture


**285 · M · Авто-генерация диаграмм Git-истории** — уровень 3
- **Цель:** tool `generate_git_history_diagram` — ветки и merge по `git log`
- **Файлы:** `gitTools.ts`, `agentTools/integrations.ts`
- **Действие:** `git log --graph` → Mermaid gitGraph или flowchart
- **Проверка:** unit-тест на fixture repo


**286 · M · Авто-генерация диаграмм CI/CD** — уровень 3
- **Цель:** tool `generate_cicd_diagram` — pipeline из workflow YAML
- **Файлы:** `agentTools/integrations.ts`, `.github/workflows/*`
- **Действие:** parse YAML jobs/steps → Mermaid flowchart
- **Проверка:** диаграмма соответствует fixture workflow


**287 · M · Авто-генерация диаграмм P2P-узлов** — уровень 3
- **Цель:** tool `generate_p2p_topology_diagram` — узлы и relay
- **Файлы:** `server/p2p/router.ts`, `p2pClient.ts`, `ArchitecturePanel.tsx`
- **Действие:** mock/live nodes → Mermaid graph
- **Проверка:** диаграмма для fixture topology


**288 · M · Авто-генерация диаграмм плагинов** — уровень 3
- **Цель:** tool `generate_plugin_diagram` — plugin → tools mapping
- **Файлы:** `agentTools/core.ts`, `docs/plugin-authoring.md`
- **Действие:** scan plugins → component diagram
- **Проверка:** fixture plugin отображён на диаграмме


**289 · M · Авто-генерация диаграмм IPC-каналов** — уровень 3
- **Цель:** tool `generate_ipc_diagram` — main ↔ renderer IPC
- **Файлы:** `shared/ipc/channels.ts`, `electron/preload/`
- **Действие:** каналы + handlers → sequence diagram
- **Проверка:** диаграмма содержит fixture IPC-канал


**290 · M · Авто-генерация отчёта по архитектуре UI** — уровень 3
- **Цель:** tool `generate_ui_architecture_report` — MD: компоненты, state, routing
- **Файлы:** `app/src/components/`, `agentTools/core.ts`
- **Действие:** read-only обход React-дерева + контексты
- **Проверка:** отчёт без write_file; покрывает App/ChatPanel


**291 · M · Авто-генерация отчёта по архитектуре backend** — уровень 3
- **Цель:** tool `generate_backend_architecture_report` — main process модули
- **Файлы:** `app/electron/main/`, `agentTools/core.ts`
- **Действие:** слои handlers/services/providers
- **Проверка:** отчёт описывает agent.ts и IPC


**292 · M · Авто-генерация отчёта по архитектуре агента** — уровень 3
- **Цель:** tool `generate_agent_architecture_report` — ReAct loop, tools, context
- **Файлы:** `agent.ts`, `agentContext.ts`, `agentTools/`
- **Действие:** схема цикла + список tool groups
- **Проверка:** unit-тест: отчёт содержит `AgentRunner` и tools


**293 · M · Авто-генерация отчёта по архитектуре плагинов** — уровень 3
- **Цель:** tool `generate_plugin_architecture_report` — plugin API и lifecycle
- **Файлы:** `docs/plugin-authoring.md`, `plugins/`
- **Действие:** MD-отчёт: загрузка, hot-reload, ограничения
- **Проверка:** отчёт без write_file


**294 · M · Авто-генерация отчёта по архитектуре интеграций** — уровень 3
- **Цель:** tool `generate_integrations_architecture_report` — GitHub, MCP, webhooks
- **Файлы:** `agentTools/integrations.ts`, `IntegrationsTab.tsx`
- **Действие:** карта интеграций + settings keys
- **Проверка:** отчёт перечисляет основные integration tools


**295 · M · Авто-генерация отчёта по архитектуре CI/CD** — уровень 3
- **Цель:** tool `generate_cicd_architecture_report` — workflows, jobs, артефакты
- **Файлы:** `.github/workflows/*`, `agentTools/integrations.ts`
- **Действие:** parse workflows → MD summary
- **Проверка:** отчёт описывает ci.yml из репозитория


**296 · M · Авто-генерация отчёта по архитектуре P2P** — уровень 3
- **Цель:** tool `generate_p2p_architecture_report` — router, credits, WSS
- **Файлы:** `server/p2p/`, `p2pClient.ts`
- **Действие:** MD: узлы, relay, маршрутизация
- **Проверка:** отчёт без write_file


**297 · M · Авто-генерация отчёта по архитектуре RAG** — уровень 3
- **Цель:** tool `generate_rag_architecture_report` — индекс, embed, search
- **Файлы:** `rag.ts`, `vectorStore.ts`, `agentContextRag.ts`
- **Действие:** схема pipeline RAG в MD
- **Проверка:** отчёт описывает `search_knowledge_base`


**298 · M · Авто-генерация отчёта по архитектуре символьного индекса** — уровень 3
- **Цель:** tool `generate_symbol_index_architecture_report` — языки, walk, cache
- **Файлы:** `symbolIndex.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** MD: поддерживаемые расширения и flow индексации
- **Проверка:** отчёт перечисляет ts/js/py из кода


**299 · M · Авто-генерация отчёта по архитектуре worktree** — уровень 3
- **Цель:** tool `generate_worktree_architecture_report` — git worktree + чаты
- **Файлы:** `gitWorktree.ts`, `chats.ts`, `agent.ts`
- **Действие:** MD: create/remove/list, `worktreePath` в чате
- **Проверка:** отчёт описывает `resolveProjectRoot`


**300 · M · Авто-обнаружение неправильных feature-flags** — уровень 3
- **Цель:** проверка feature-флагов
- **Файлы:** `settings.ts`, `agentTools/core.ts`
- **Действие:** tool `find_feature_flag_issues`; анализ settings и кода
- **Проверка:** отчёт


**301 · M · Авто-обнаружение неправильных путей в RAG-документах** — уровень 3
- **Цель:** проверка RAG-источников
- **Файлы:** `rag.ts`
- **Действие:** tool `find_rag_source_issues`; проверка существования путей
- **Проверка:** отчёт


**302 · M · Авто-обнаружение неправильных chunk-размеров RAG** — уровень 3
- **Цель:** проверка `chunkSize`
- **Файлы:** `rag.ts`
- **Действие:** tool `find_rag_chunk_issues`; лимиты и рекомендации
- **Проверка:** отчёт
