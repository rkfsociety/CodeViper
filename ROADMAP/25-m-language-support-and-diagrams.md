# M: Векторные БД и диаграммы Git

Пункты 315–359: Milvus/Qdrant, индексация и диаграммы по Git-истории.

Всего пунктов: 45.

**314 · M · Авто-обнаружение неправильных индексов Milvus/Qdrant** — уровень 3
- **Цель:** проверка конфигурации
- **Файлы:** `rag.ts`, `vectorStore.ts`
- **Действие:** tool `find_vector_index_issues`
- **Проверка:** отчёт


**315 · M · Авто-обнаружение неправильных моделей fallback** — уровень 3
- **Цель:** проверка `fallbackModels[]`
- **Файлы:** `settings.ts`, `BehaviorTab.tsx`
- **Действие:** tool `find_fallback_model_issues`
- **Проверка:** отчёт


**316 · M · Авто-обнаружение неправильных настроек GGUF-скачиваний** — уровень 3
- **Цель:** проверка GGUF-моделей
- **Файлы:** `ModelTab/providers/*`
- **Действие:** tool `find_gguf_download_issues`
- **Проверка:** отчёт


**317 · M · Авто-обнаружение неправильных настроек Editor-субагента** — уровень 3
- **Цель:** проверка Editor
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_editor_subagent_issues`
- **Проверка:** отчёт


**318 · M · Авто-обнаружение неправильных настроек Security-субагента** — уровень 3
- **Цель:** проверка Security
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_security_subagent_issues`
- **Проверка:** отчёт


**319 · M · Авто-обнаружение неправильных настроек Tester-субагента** — уровень 3
- **Цель:** проверка Tester
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_tester_subagent_issues`
- **Проверка:** отчёт


**320 · M · Авто-обнаружение неправильных настроек Documenter-субагента** — уровень 3
- **Цель:** проверка Documenter
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_documenter_subagent_issues`
- **Проверка:** отчёт


**321 · M · Авто-обнаружение неправильных настроек Compliance-субагента** — уровень 3
- **Цель:** проверка Compliance
- **Файлы:** `subagentRunner.ts`
- **Действие:** tool `find_compliance_subagent_issues`
- **Проверка:** отчёт


**322 · M · Авто-обнаружение неправильных правил самообучения** — уровень 3
- **Цель:** проверка SelfImprovePlan
- **Файлы:** `SelfImprovePanel.tsx`, `shared/selfImprovement.ts`
- **Действие:** tool `find_self_improve_plan_issues`
- **Проверка:** отчёт


**323 · M · Авто-обнаружение неправильных черновиков ввода** — уровень 3
- **Цель:** проверка localStorage drafts
- **Файлы:** `ChatPanel.tsx`, `ChatInput.tsx`
- **Действие:** tool `find_input_draft_issues`
- **Проверка:** отчёт


**324 · M · Авто-обнаружение неправильных темной/светлой темы** — уровень 3
- **Цель:** проверка `uiLightMode`
- **Файлы:** `settings.ts`, `styles.css`
- **Действие:** tool `find_theme_mode_issues`
- **Проверка:** отчёт


**325 · M · Авто-обнаружение неправильных preview-панелей** — уровень 3
- **Цель:** проверка FilePreviewPanel
- **Файлы:** `FilePreviewPanel.tsx`
- **Действие:** tool `find_preview_panel_issues`
- **Проверка:** отчёт


**326 · M · Авто-обнаружение неправильных hot-reload плагинов** — уровень 3
- **Цель:** проверка hot-reload
- **Файлы:** `plugins/*`
- **Действие:** tool `find_plugin_hotreload_issues`
- **Проверка:** отчёт


**327 · M · Авто-обнаружение неправильных health-checks MCP** — уровень 3
- **Цель:** проверка MCP health
- **Файлы:** `agentTools/mcp.ts`
- **Действие:** tool `find_mcp_health_issues`
- **Проверка:** отчёт


**328 · M · Авто-обнаружение неправильных tool-schemas** — уровень 3
- **Цель:** проверка JSON-схем
- **Файлы:** `agentTools/*`
- **Действие:** tool `find_tool_schema_issues`
- **Проверка:** отчёт


**329 · M · Авто-обнаружение неправильных tool-алиасов** — уровень 3
- **Цель:** проверка алиасов
- **Файлы:** `agentTools/*`, `shared/toolCalls.ts`
- **Действие:** tool `find_tool_alias_issues`
- **Проверка:** отчёт


**330 · M · Авто-обнаружение неправильных tool-результатов** — уровень 3
- **Цель:** проверка результатов
- **Файлы:** `agentTools/*`, `agent.ts`
- **Действие:** tool `find_tool_result_issues`
- **Проверка:** отчёт


**331 · M · Авто-обнаружение неправильных tool-timeouts** — уровень 3
- **Цель:** проверка таймаутов
- **Файлы:** `agentTools/*`, `shared/constants.ts`
- **Действие:** tool `find_tool_timeout_issues`
- **Проверка:** отчёт


**332 · M · find_symbol для Apex** — уровень 3
- **Цель:** `find_symbol` / `find_references` для `.cls` / `.trigger` (class/method)
- **Файлы:** `symbolIndex.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** парсер Apex → символы с `path:line:col`
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.cls` файлом


**333 · M · find_symbol для ABAP** — уровень 3
- **Цель:** символы для `.abap` (program/class/method)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход объявлений ABAP
- **Проверка:** unit-тест: `CLASS` / `METHOD` находятся по имени


**334 · M · find_symbol для Dart** — уровень 3
- **Цель:** символы для `.dart` (class/function)
- **Файлы:** `symbolIndex.ts`
- **Действие:** tree-sitter-dart или синтаксический обход
- **Проверка:** unit-тест: `class Foo` и `void main` находятся по имени


**335 · M · find_symbol для Nim** — уровень 3
- **Цель:** символы для `.nim` (proc/func/type)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход `proc` / `func` / `type` объявлений
- **Проверка:** unit-тест: `proc foo` находится по имени


**336 · M · find_symbol для Crystal** — уровень 3
- **Цель:** символы для `.cr` (class/def/macro)
- **Файлы:** `symbolIndex.ts`
- **Действие:** парсер Crystal → top-level объявления
- **Проверка:** unit-тест: `class Foo` и `def bar` находятся по имени


**337 · M · find_symbol для D** — уровень 3
- **Цель:** символы для `.d` (module/class/function)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход D объявлений
- **Проверка:** unit-тест: `void main` и `class Bar` находятся по имени


**338 · M · find_symbol для Tcl** — уровень 3
- **Цель:** символы для `.tcl` (proc)
- **Файлы:** `symbolIndex.ts`
- **Действие:** regex для `proc name`
- **Проверка:** unit-тест: `proc foo` находится по имени


**339 · M · find_symbol для PowerShell** — уровень 3
- **Цель:** символы для `.ps1` / `.psm1` (function/cmdlet)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход `function` / `filter` объявлений
- **Проверка:** unit-тест: `function Get-Foo` находится по имени


**340 · M · find_symbol для Batch** — уровень 3
- **Цель:** символы для `.bat` / `.cmd` (labels/call targets)
- **Файлы:** `symbolIndex.ts`
- **Действие:** поиск `:label` и `call` целей
- **Проверка:** unit-тест: label находится по имени


**341 · M · find_symbol для Puppet** — уровень 3
- **Цель:** символы для `.pp` (class/define/resource)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход Puppet DSL объявлений
- **Проверка:** unit-тест: `class foo` и `define bar` находятся по имени


**342 · M · LSP для Apex** — уровень 3
- **Цель:** hover/definition для `.cls` через Apex language server (если установлен)
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** опциональный spawn; graceful fallback
- **Проверка:** при наличии LSP — переход к определению в `.cls`


**343 · M · LSP для ABAP** — уровень 3
- **Цель:** hover/definition для `.abap` через abap language server
- **Файлы:** `lspClient.ts`
- **Действие:** ветка ABAP language server
- **Проверка:** Ctrl+click на method → переход к определению


**344 · M · LSP для Dart** — уровень 3
- **Цель:** hover/definition для `.dart` через dart analysis server
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** spawn `dart language-server`
- **Проверка:** Ctrl+click на class → переход к определению


**345 · M · LSP для Nim** — уровень 3
- **Цель:** hover/definition для `.nim` через nimlangserver
- **Файлы:** `lspClient.ts`
- **Действие:** spawn nim language server
- **Проверка:** Ctrl+click на `proc` → переход к определению


**346 · M · LSP для Crystal** — уровень 3
- **Цель:** hover/definition для `.cr` через crystalline
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** spawn crystalline LSP
- **Проверка:** Ctrl+click на `def` → переход к определению


**347 · M · LSP для D** — уровень 3
- **Цель:** hover/definition для `.d` через serve-d / dcd
- **Файлы:** `lspClient.ts`
- **Действие:** spawn D language server
- **Проверка:** Ctrl+click на function → переход к определению


**348 · M · LSP для Tcl** — уровень 3
- **Цель:** hover/definition для `.tcl` через tcl language server
- **Файлы:** `lspClient.ts`
- **Действие:** опциональный spawn Tcl LSP
- **Проверка:** при наличии LSP — переход к `proc`


**349 · M · LSP для PowerShell** — уровень 3
- **Цель:** hover/definition для `.ps1` через PowerShell Editor Services
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** spawn PSES language server
- **Проверка:** Ctrl+click на function → переход к определению


**350 · M · LSP для Batch** — уровень 3
- **Цель:** hover/definition для `.bat` — ограниченная поддержка (syntax + labels)
- **Файлы:** `lspClient.ts`
- **Действие:** базовый language service или fallback на grep
- **Проверка:** отчёт о доступности; label navigation если LSP есть


**351 · M · LSP для Puppet** — уровень 3
- **Цель:** hover/definition для `.pp` через puppet-editor-services
- **Файлы:** `lspClient.ts`
- **Действие:** spawn Puppet language server
- **Проверка:** Ctrl+click на `class` → переход к определению


**352 · M · Авто-генерация диаграмм Git-ветвления** — уровень 3
- **Цель:** tool `generate_git_branch_diagram` — дерево веток из `git branch -a`
- **Файлы:** `gitTools.ts`, `agentTools/integrations.ts`
- **Действие:** Mermaid gitGraph или flowchart
- **Проверка:** unit-тест на fixture repo


**353 · M · Авто-генерация диаграмм Git-мерджей** — уровень 3
- **Цель:** tool `generate_git_merge_diagram` — merge commits и parents
- **Файлы:** `gitTools.ts`, `MessageBody.tsx`
- **Действие:** `git log --merges` → Mermaid
- **Проверка:** диаграмма для fixture merge history


**354 · M · Авто-генерация диаграмм Git-конфликтов** — уровень 3
- **Цель:** tool `generate_git_conflict_diagram` — файлы/коммиты с конфликтами
- **Файлы:** `gitTools.ts`, `agentHandlersProjectFile.ts`
- **Действие:** scan `<<<<<<<` + git status → diagram
- **Проверка:** отчёт показывает fixture conflict


**355 · M · Авто-генерация диаграмм Git-ревью** — уровень 3
- **Цель:** tool `generate_git_review_diagram` — PR/review timeline
- **Файлы:** `agentTools/integrations.ts`, `gitTools.ts`
- **Действие:** GitHub API mock → sequence diagram
- **Проверка:** diagram для fixture PR events


**356 · M · Авто-генерация диаграмм Git-релизов** — уровень 3
- **Цель:** tool `generate_git_release_diagram` — теги и релизы по времени
- **Файлы:** `gitTools.ts`, `agentTools/integrations.ts`
- **Действие:** `git tag -l` + dates → timeline Mermaid
- **Проверка:** диаграмма для fixture tags


**357 · M · Авто-генерация диаграмм Git-тегов** — уровень 3
- **Цель:** tool `generate_git_tag_diagram` — annotated vs lightweight tags
- **Файлы:** `gitTools.ts`
- **Действие:** parse tag refs → graph
- **Проверка:** unit-тест на fixture tags


**358 · M · Авто-генерация диаграмм Git-коммитов** — уровень 3
- **Цель:** tool `generate_git_commit_diagram` — частота/объём коммитов
- **Файлы:** `gitTools.ts`, `MetricsPanel.tsx`
- **Действие:** `git shortlog` / log histogram → chart Mermaid
- **Проверка:** диаграмма для fixture log
