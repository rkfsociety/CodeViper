# M: Диаграммы, LSP III и диагностика

Пункты 314–358: Git-диаграммы, LSP для языков, панели и диагностика.

Всего пунктов: 45.

**314 · M · Авто-генерация диаграмм Git-авторов** — уровень 3
- **Цель:** tool `generate_git_author_diagram` — вклад по авторам
- **Файлы:** `gitTools.ts`
- **Действие:** `git shortlog -sn` → pie/bar Mermaid
- **Проверка:** топ авторов из fixture repo


**315 · M · Авто-генерация диаграмм Git-активности** — уровень 3
- **Цель:** tool `generate_git_activity_diagram` — heatmap коммитов по дням
- **Файлы:** `gitTools.ts`, `agentTools/integrations.ts`
- **Действие:** log dates → calendar heatmap Mermaid
- **Проверка:** активность за период в fixture


**316 · M · Авто-генерация диаграмм Git-статистики** — уровень 3
- **Цель:** tool `generate_git_stats_diagram` — LOC churn, files changed
- **Файлы:** `gitTools.ts`
- **Действие:** `git log --stat` aggregate → summary diagram
- **Проверка:** stats совпадают с fixture `git log --shortstat`


**317 · M · Авто-генерация отчёта по качеству тестов** — уровень 3
- **Цель:** tool `generate_test_quality_report` — покрытие, flaky, missing tests
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectFile.ts`
- **Действие:** read-only анализ `tests/` vs `src/`
- **Проверка:** отчёт без write_file; список непокрытых модулей


**318 · M · Авто-генерация отчёта по качеству документации** — уровень 3
- **Цель:** tool `generate_docs_quality_report` — битые ссылки, устаревшие разделы
- **Файлы:** `agentTools/integrations.ts`, `docs/`
- **Действие:** scan MD links + vs код
- **Проверка:** отчёт находит broken link в fixture


**319 · M · Авто-генерация отчёта по качеству UI** — уровень 3
- **Цель:** tool `generate_ui_quality_report` — консистентность компонентов
- **Файлы:** `app/src/components/`, `agentTools/core.ts`
- **Действие:** эвристики: дубли стилей, огромные компоненты
- **Проверка:** отчёт без write_file


**320 · M · Авто-генерация отчёта по качеству UX** — уровень 3
- **Цель:** tool `generate_ux_quality_report` — friction points, a11y gaps
- **Файлы:** `agentTools/core.ts`, `App.tsx`
- **Действие:** чеклист UX + ссылки на компоненты
- **Проверка:** отчёт содержит findings из fixture UI


**321 · M · Авто-генерация отчёта по качеству интеграций** — уровень 3
- **Цель:** tool `generate_integrations_quality_report` — tokens, endpoints, errors
- **Файлы:** `agentTools/integrations.ts`, `IntegrationsTab.tsx`
- **Действие:** валидация settings + tool health
- **Проверка:** отчёт перечисляет проблемы fixture settings


**322 · M · Авто-генерация отчёта по качеству плагинов** — уровень 3
- **Цель:** tool `generate_plugins_quality_report` — schema, errors, reload
- **Файлы:** `plugins/`, `docs/plugin-authoring.md`
- **Действие:** scan plugins → MD summary
- **Проверка:** fixture plugin issues в отчёте


**323 · M · Авто-генерация отчёта по качеству CI/CD** — уровень 3
- **Цель:** tool `generate_cicd_quality_report` — jobs, caches, secrets hygiene
- **Файлы:** `.github/workflows/*`, `agentTools/integrations.ts`
- **Действие:** YAML lint + best practices
- **Проверка:** отчёт для fixture workflow


**324 · M · Авто-генерация отчёта по качеству P2P** — уровень 3
- **Цель:** tool `generate_p2p_quality_report` — latency, credits, disconnects
- **Файлы:** `server/p2p/`, `p2pClient.ts`
- **Действие:** метрики + рекомендации
- **Проверка:** отчёт без write_file


**325 · M · Авто-генерация отчёта по качеству RAG** — уровень 3
- **Цель:** tool `generate_rag_quality_report` — chunk quality, retrieval hits
- **Файлы:** `rag.ts`, `vectorStore.ts`
- **Действие:** sample queries + index stats
- **Проверка:** отчёт описывает fixture index


**326 · M · Авто-генерация отчёта по качеству символьного индекса** — уровень 3
- **Цель:** tool `generate_symbol_index_quality_report` — coverage, stale, misses
- **Файлы:** `symbolIndex.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** языки, cache age, failed parses
- **Проверка:** отчёт перечисляет unsupported extensions в fixture


**327 · M · Авто-обнаружение «тяжёлых» циклов** — уровень 3
- **Цель:** находить циклы с высокой сложностью
- **Файлы:** `agentTools/core.ts`
- **Действие:** tool `find_heavy_loops`; анализ CFG
- **Проверка:** отчёт


**328 · M · Авто-обнаружение неправильных try/catch блоков** — уровень 3
- **Цель:** находить пустые catch
- **Файлы:** `agentTools/core.ts`
- **Действие:** tool `find_try_catch_issues`
- **Проверка:** отчёт


**329 · M · Авто-обнаружение неправильных async-итераторов** — уровень 3
- **Цель:** проверка for-await
- **Файлы:** `agentTools/core.ts`
- **Действие:** tool `find_async_iterator_issues`
- **Проверка:** отчёт


**330 · M · Авто-обнаружение неправильных генераторов** — уровень 3
- **Цель:** проверка `function*`
- **Файлы:** `agentTools/core.ts`
- **Действие:** tool `find_generator_issues`
- **Проверка:** отчёт


**331 · M · Авто-обнаружение неправильных named-экспортов** — уровень 3
- **Цель:** проверка named export
- **Файлы:** `symbolIndex.ts`
- **Действие:** tool `find_named_export_issues`
- **Проверка:** отчёт


**332 · M · Авто-обнаружение неправильных путей в CodeEditorPanel** — уровень 3
- **Цель:** проверка открытия файлов
- **Файлы:** `CodeEditorPanel.tsx`
- **Действие:** tool `find_code_editor_path_issues`
- **Проверка:** отчёт


**333 · M · Авто-обнаружение неправильных путей в ProjectTreePanel** — уровень 3
- **Цель:** проверка дерева файлов
- **Файлы:** `ProjectTreePanel.tsx`
- **Действие:** tool `find_project_tree_path_issues`
- **Проверка:** отчёт


**334 · M · Авто-обнаружение неправильных путей в SettingsModal** — уровень 3
- **Цель:** проверка настроек
- **Файлы:** `SettingsModal/*`
- **Действие:** tool `find_settings_modal_path_issues`
- **Проверка:** отчёт


**335 · M · Авто-обнаружение неправильных путей в MetricsPanel** — уровень 3
- **Цель:** проверка метрик
- **Файлы:** `MetricsPanel.tsx`
- **Действие:** tool `find_metrics_panel_path_issues`
- **Проверка:** отчёт


**336 · M · Авто-обнаружение неправильных путей в WelcomePanel** — уровень 3
- **Цель:** проверка welcome
- **Файлы:** `WelcomePanel.tsx`
- **Действие:** tool `find_welcome_panel_path_issues`
- **Проверка:** отчёт


**337 · M · Авто-обнаружение неправильных путей в IntegrationsTab** — уровень 3
- **Цель:** проверка интеграций
- **Файлы:** `IntegrationsTab.tsx`
- **Действие:** tool `find_integrations_tab_path_issues`
- **Проверка:** отчёт


**338 · M · Авто-обнаружение неправильных путей в ModelTab** — уровень 3
- **Цель:** проверка моделей
- **Файлы:** `ModelTab.tsx`
- **Действие:** tool `find_model_tab_path_issues`
- **Проверка:** отчёт


**339 · M · Авто-обнаружение неправильных путей в PerformanceTab** — уровень 3
- **Цель:** проверка производительности
- **Файлы:** `PerformanceTab.tsx`
- **Действие:** tool `find_performance_tab_path_issues`
- **Проверка:** отчёт


**340 · M · Авто-обнаружение неправильных путей в MemoryPanel** — уровень 3
- **Цель:** проверка памяти
- **Файлы:** `MemoryPanel.tsx`
- **Действие:** tool `find_memory_panel_path_issues`
- **Проверка:** отчёт


**341 · M · Авто-обнаружение неправильных путей в AgentStatusBar** — уровень 3
- **Цель:** проверка статуса
- **Файлы:** `AgentStatusBar.tsx`
- **Действие:** tool `find_agent_status_bar_path_issues`
- **Проверка:** отчёт


**342 · M · Авто-обнаружение неправильных путей в agentLogger** — уровень 3
- **Цель:** проверка логов
- **Файлы:** `agentLogger.ts`
- **Действие:** tool `find_agent_logger_path_issues`
- **Проверка:** отчёт


**343 · M · Авто-обнаружение неправильных путей в agent.ts** — уровень 3
- **Цель:** проверка AgentRunner
- **Файлы:** `agent.ts`
- **Действие:** tool `find_agent_runner_path_issues`
- **Проверка:** отчёт


**344 · M · Авто-обнаружение неправильных путей в agentTools** — уровень 3
- **Цель:** проверка tools
- **Файлы:** `agentTools/*`
- **Действие:** tool `find_agent_tools_path_issues`
- **Проверка:** отчёт


**345 · M · Авто-обнаружение неправильных путей в provider-модулях** — уровень 3
- **Цель:** проверка провайдеров
- **Файлы:** `providers/*`
- **Действие:** tool `find_provider_path_issues`
- **Проверка:** отчёт


**346 · M · Авто-обнаружение неправильных путей в fileServices** — уровень 3
- **Цель:** проверка файловых операций
- **Файлы:** `fileServices.ts`
- **Действие:** tool `find_file_services_path_issues`
- **Проверка:** отчёт


**347 · M · Авто-обнаружение неправильных путей в preload.ts** — уровень 3
- **Цель:** проверка preload
- **Файлы:** `electron/preload/index.ts`
- **Действие:** tool `find_preload_path_issues`
- **Проверка:** отчёт


**348 · M · find_symbol для Q#** — уровень 3
- **Цель:** `find_symbol` / `find_references` для `.qs` (operation/function)
- **Файлы:** `symbolIndex.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** парсер Q# → символы с `path:line:col`
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.qs` файлом


**349 · M · find_symbol для Hack** — уровень 3
- **Цель:** символы для `.hack` (class/function)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход Hack/HHVM объявлений
- **Проверка:** unit-тест: `class Foo` находится по имени


**350 · M · find_symbol для Mojo** — уровень 3
- **Цель:** символы для `.mojo` / `.🔥` (fn/struct)
- **Файлы:** `symbolIndex.ts`
- **Действие:** синтаксический обход Mojo объявлений
- **Проверка:** unit-тест: `fn main` находится по имени


**351 · M · find_symbol для Zig** — уровень 3
- **Цель:** символы для `.zig` (fn/struct/const)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход Zig top-level объявлений
- **Проверка:** unit-тест: `pub fn main` и `const Foo` находятся по имени


**352 · M · find_symbol для Red** — уровень 3
- **Цель:** символы для `.red` / `.reds` (function/entity)
- **Файлы:** `symbolIndex.ts`
- **Действие:** regex для Red dialect объявлений
- **Проверка:** unit-тест: `func` находится по имени


**353 · M · find_symbol для ReScript** — уровень 3
- **Цель:** символы для `.res` / `.resi` (let/type/module)
- **Файлы:** `symbolIndex.ts`
- **Действие:** парсер ReScript → объявления с позицией
- **Проверка:** unit-тест: `let foo` и `type bar` находятся по имени


**354 · M · find_symbol для Elm** — уровень 3
- **Цель:** символы для `.elm` (type/func/module)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход Elm module declarations
- **Проверка:** unit-тест: `type Foo` находится по имени


**355 · M · find_symbol для Futhark** — уровень 3
- **Цель:** символы для `.fut` (entry/def)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход Futhark объявлений
- **Проверка:** unit-тест: `entry main` находится по имени


**356 · M · find_symbol для Idris** — уровень 3
- **Цель:** символы для `.idr` (data/type/func)
- **Файлы:** `symbolIndex.ts`
- **Действие:** синтаксический обход Idris
- **Проверка:** unit-тест: `foo :` и `data Bar` находятся по имени


**357 · M · find_symbol для Mercury** — уровень 3
- **Цель:** символы для `.m` (Mercury — predicate/type)
- **Файлы:** `symbolIndex.ts`
- **Действие:** обход `:- pred` / `:- type` объявлений
- **Проверка:** unit-тест: predicate находится по имени


**358 · M · LSP для Q#** — уровень 3
- **Цель:** hover/definition для `.qs` через Q# language server
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** spawn qsharp-lang или аналог
- **Проверка:** при наличии LSP — переход к operation
