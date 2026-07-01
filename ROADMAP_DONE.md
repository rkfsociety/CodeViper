# Выполнено — CodeViper

Реализованные возможности и справка по live runtime. Активные задачи — [ROADMAP.md](ROADMAP.md).

## ✅ Блок 0 — Live runtime с GitHub (завершён)

> Установленный `.exe` — тонкая оболочка; agent runtime подтягивается из клона `%APPDATA%\CodeViper\source` без переустановки NSIS.

### Когда нужен полный релиз (NSIS, `vX.Y.Z`, переустановка)
- Type mismatches: tool `find_type_mismatches` — TS type-check отчёт (high/medium/low, path:line:col)
- Hotkey conflict detection: tool `find_hotkey_conflicts` for `App.tsx`, reporting collisions and reserved shortcuts.

| Ситуация | Действие |
|----------|----------|
| Первая установка на машине | `CodeViper-Setup-*.exe` |
| Смена Electron, NSIS, portable Node, подпись, иконка | bump `version` → CI → тег → установщик |
| Критичный баг **оболочки** (окно не открывается, IPC, трей) | релиз оболочки |

### Когда релиз **не** нужен (блок 0 выполнен)

| Ситуация | Действие |
|----------|----------|
| Фикс `list_directory`, handlers, промптов, ROADMAP-логики | `git push` на `master` → у пользователя: pull в `%APPDATA%\CodeViper\source` → build → **перезапуск** `.exe` |
| Документация, skills, collective memory | push на GitHub; перезапуск или без него |
| Обычный коммит разработки | **без** bump `version` и **без** тега |

**Авто-релиз:** после зелёного CI на `master` job `auto-shell-release` ставит тег `vX.Y.Z` только если изменилась **оболочка** (`scripts/shell-release-paths.mjs`). Runtime-коммиты тег не получают.

**Путь клона (уже создаётся установщиком):** `%APPDATA%\CodeViper\source` → `app/` — исходники и `out/main` после build.

## Сделано

### Live runtime (блок 0)
- Авто-релиз оболочки (`auto-shell-release`, `shell-release-paths.mjs`); sync из `%APPDATA%\CodeViper\source`, runtime bootstrap, баннер перезапуска
- Документация live runtime: README, `docs/development.md`

### Архитектура и рефакторинг
- `find_skill_file_issues`: отчёт о битых SKILL.md, пустых trigger и дубликатах trigger при cross-check с `list_skills`
- Авто-обнаружение циклов импортов: `findImportCycles` в `symbolIndex.ts`, предупреждение в чате через `ArchitecturePanel`
- IPC → 9 модулей `register*Ipc`; `agentTools` → core/integrations/mcp; `agentHandlersProject` → file/search/terminal
- `SettingsModal` → 6 вкладок; `ChatPanel/` подкомпоненты; `commandRunner` выделен из `services.ts`
- Провайдеры Claude/Gemini → `StreamingChatProvider`; агент на 6 модулей; параллельные tool calls; LRU-кэши
- Разбиение ROADMAP на смысловые подфайлы с лимитом до 50 пунктов в каждом (`ROADMAP/11-*.md` … `ROADMAP/31-*.md`) и короткие индексные файлы по разделам

### Агент и инструменты
- Tool `find_docker_port_issues`: reports duplicate Docker Compose host ports and published ports without host bind.
- `suggest_new_roadmap_items`: генерация S/M пунктов ROADMAP из trace ошибок агента с добавлением в конец выбранного уровня
- `find_import_issues`: AST-проверка import/require с различением `tsconfig paths` alias и реальных npm-пакетов, без ложных срабатываний на `node_modules`
- `find_merge_conflicts`: поиск маркеров merge-конфликта (`<<<<<<<`, `=======`, `>>>>>>>`) по проекту, отчёт `[n] path:line`
- `find_commit_message_issues`: отчёт по commit-сообщениям в последних N коммитах с фильтром Conventional Commits
- `find_missing_tests`: поиск `*.ts` / `*.tsx` без парных `*.test.ts` / `*.spec.ts` рядом с исходником или в зеркальной папке `tests/`
- `find_rerender_candidates`: эвристика по React `.tsx` для экспортируемых компонентов с props, исключая случаи, где уже есть `memo`, `useMemo` или `useCallback`
- Авто-обнаружение тяжёлых зависимостей в `node_modules`: список пакетов больше 1 MB в терминальном обработчике
- Авто-обнаружение неправильных aria-атрибутов: tool `find_aria_issues` — AST-анализ JSX, по умолчанию `MessageBody.tsx` и `App.tsx`
- Tool `find_integration_url_issues`: GitLab/Jira/webhook/P2P URL в settings → отчёт (`integrationUrlValidation.ts`)
- Tool `find_cron_issues`: валидация `settings.automations` cron (`automationScheduler.ts`); поле `automations` в settings schema
- Tool `find_settings_path_issues`: проверка битых путей в `settings.json` (`sourceRootOverride`, `gitRepoRoot`, `orchestratorModelPath`, `recentProjects`)
- `planBeforeExecute` в settings: тумблер «Сначала показать план» в BehaviorTab; пауза после плана с кнопкой «Выполнить» в чате
- `firstRunCompleted` в settings: флаг завершения onboarding (default `false`, визард выставит `true`)
- Git: checkout, stash, commit, push; GitLab, Jira, Linear; ROADMAP-панель, slash-команды (`/lint`, `/build`), `disabledTools`
- Slash `/build`: expand → `npm run build` + исправление ошибок сборки
- Slash `/security`: expand → security review (секреты, injection, небезопасные команды)
- `list_pull_requests` — открытые PR и статус CI через gh (как панель PR в UI)
- `format_project` — авто-форматирование проекта (Prettier / Black, детекция по package.json / pyproject.toml)
- `list_roadmap` — список пунктов «В планах» из ROADMAP.md (num · title · chain)
- `read_roadmap_item` — полный блок пункта N: цель, файлы, действие, проверка
- `set_self_improvement_plan`: алиасы title/item/name; action/check (ROADMAP, fix #23); `complete_self_improvement_item` — id и алиас `item_id` (Gemini); валидационные ответы инструментов в trace как ошибка; `grep_*` — алиас `paths[0]` для `path`; Gemini — минимальные JSON-схемы tools (fix #19); маркированный список вместо JSON + AUTO вместо ANY при >40 tools (fix #20)
- Описания search-инструментов (`grep_files` / `find_files` / `search_in_file` / `file_search_summary`) в tool schema и viper-files
- `docs/tools-api.md` синхронизирован с `agentTools/` и `AGENT_TOOL_NAMES` (индекс, Git, GitHub, ROADMAP)
- Субагенты Explorer/Editor; оркестратор node-llama-cpp; checkpoint и откат прогона; `run_tests` с авто-починкой
- Субагент Reviewer: `delegate_to_reviewer` для read-only обзора diff без правок
- Авто-делегирование шагов субагентам: `resolveAutoDelegationRole` в `subagentRunner.ts` (review → Reviewer, tests → Tester); в `agent.ts` — trace `delegate_to_reviewer` / `delegate_to_tester` до основного цикла LLM
- RAG (Qdrant/Milvus), символьный индекс ts/js/py, инкрементальная индексация, secret redaction, бенчмарк моделей
- `find_slow_code` — AST-анализ ts/js/py на медленные участки (вложенные циклы, await/sync I/O/JSON.parse в цикле); отчёт в чате
- `find_dead_code` — AST-анализ ts/js на недостижимые операторы и константные ветки (`if true/false`, тернарные условия); отчёт в чате

### UX и UI
- Экспорт метрик в CSV: кнопка «CSV» в `MetricsPanel` (byModel + topTools, blob download)
- Избранные чаты: `starred` в `SavedChat`, звезда ⭐ и секция «Избранное» в `ChatHistoryPanel`
- Mermaid-диаграммы: `MermaidDiagram` в чате и `ArchitecturePanel`; tools `generate_dependency_diagram`, `generate_class_diagram`, `generate_dataflow_diagram`
- Ctrl+Shift+T: экспорт трейса при открытой панели трассировки, иначе открыть TracePanel; shortcut в модалке `?`
- Кнопка «Очистить» в TerminalPanel: сброс вывода к приветственному сообщению
- Поиск в MemoryPanel: фильтр по тексту (content, теги, scope) и категории (паттерн, ошибка, …)
- Custom OpenAI endpoint: провайдер `custom` (baseUrl + apiKey + model id) для LM Studio / vLLM через `OpenAIProvider`
- Fallback-модели: `fallbackModels[]` в BehaviorTab; при HTTP 429/5xx AgentRunner пробует следующую модель
- Чип индексации: `index_progress` в agent-stream → «Индекс N%» в AgentStatusBar при `index_project`
- `aria-live` для статуса агента в `AgentStatusBar`: screen reader объявляет «Агент работает» и «Готово»
- Быстрый старт в README расширен для Windows, Linux и macOS: AppImage, DMG и `CodeViper.sh`
- Подтверждение внешних `http(s)`-ссылок из `MessageBody`: перед `openExternal` показывается `ConfirmDialog`
- Разделены описания PR-инструментов: `create_pr` явно для проекта пользователя, `create_codeviper_pr` явно для исходников CodeViper
- Добавлен `docs/troubleshooting.md`: GPUCache, чёрный экран, плагины и portable Node; README ссылается на troubleshooting
- `docs/plugin-authoring.md`: гайд автора плагина (схема tool, пример `.js`, hot-reload, ограничения); ссылка в README
- OnboardingWizard: 3-шаговая модалка (провайдер → модель → открыть проект) при `!firstRunCompleted`; «Пропустить» завершает onboarding; шаг 3 — кнопка «Примеры запросов» → `docs/example-prompts.md` на GitHub
- Недавние проекты: `recentProjects` в settings (до 10), WelcomePanel и меню «Открыть»
- Ctrl+` — показать/скрыть встроенный терминал
- Quick Open (Ctrl+P): fuzzy-поиск по дереву проекта → превью файла
- Светлая тема: `uiLightMode` в settings.json, восстанавливается после перезапуска
- Масштаб шрифта UI: `uiFontScale` (90%–125%) в PerformanceTab → `document.documentElement.style.fontSize`
- ChatPanel: автосохранение черновика ввода в localStorage per chatId (debounce 500 мс), восстановление при переключении чата
- ChatHistoryPanel: поиск по заголовку и последнему сообщению; при фильтре скрываются пустые папки/проекты, группы разворачиваются
- Resizable split layout: панель «Превью» справа от чата с перетаскиваемым разделителем; ширина и видимость в `ui-layout.json`
- FilePreviewPanel: read-only просмотр файла с highlight.js (IPC `read-file`); ProjectTree → split-панель «Превью»
- Ручная переиндексация: ПКМ в дереве файлов → «Переиндексировать» (`autoIndexProject` / `index_project` для `projectPath`)
- MessageBody: кнопка «Копировать» на каждом fenced code block (`navigator.clipboard.writeText`)
- MessageRow: «↺ Перегенерировать» для ответа assistant (truncate + resend)
- DiffPreviewModal (side-by-side, cherry-pick hunks); ProjectTree; @-mentions; trace export/replay; MetricsPanel
- Авто-генерация метрик проекта: tool `generate_project_metrics` (LOC, языки, сложность → Markdown); секция «Кодовая база» в MetricsPanel; unit-тест fixture
- Горячие клавиши: Esc — стоп агента; Ctrl+Shift+N — новый чат; Ctrl+B — дерево файлов (модалка `?`)
- Vision-ввод; ErrorBoundary; prompt templates; tray; UpdateBanner; уведомления и звук по завершении агента; toast при ожидании подтверждения (preview/danger/диалог), если окно не в фокусе
- Коллективная память: рейтинг, AgentLearningPanel, шаблоны чатов, SelfImprovePlanPanel, `.codeviper/rules.md`
- Очередь сообщений в AgentStatusBar: кнопка ✕ удаляет pending run без остановки остальных
- Skip link «К содержимому»: скрытая ссылка в начале App → `#main-chat`, видна при `:focus`, фокус в поле ввода чата

### P2P и интеграции
- `server/p2p`: Fastify, auth, router, TLS, кредиты, согласие в UI, тумблер «Поделиться мощностью»
- Чип **P2P offline** в AgentStatusBar при обрыве WSS к сигнальному серверу
- MCP health-check и `enabledTools`; webhooks; режим инкогнито; плагины с hot-reload и Zod-валидацией
- Discord webhook и Telegram Bot (`sendMessage`) — уведомление «Агент готов» в IntegrationsTab; `webhookNotify.ts` + unit-тест payload
- Шаблоны MCP stdio: кнопки + filesystem / + fetch в IntegrationsTab → `mcpStdioServers` в settings.json

### Качество, CI, установщик
- Dependabot для npm: weekly PR для `app/` и root с label `dependencies`.
- E2E windows/ubuntu/macos; coverage thresholds; `npm audit` в CI; TypeDoc + GitHub Pages
- NSIS + POSIX `CodeViper.sh`; CONTRIBUTING, issue/PR templates; `.codeviperignore`
- `debugAgent`; удалён deprecated `cloudApiKey`; `list_directory` резолвит path от корня проекта
- CI unit tests: ESM `runtimeHandlers` вместо `Function('return require')`, парсер split `ROADMAP/*.md`, `runtimeSourceState` в тестах `appWindowTitle`
- E2E CI: `require('electron')` для пути к бинарнику, `electron/install.js` после `npm ci`

### Надёжность и безопасность
- Per-step timeout; Ollama fallback при circuit open; лимит буфера `runCommand` (10 МБ)
- `encryptApiKey` fallback; `normalizeCommand`; collective memory mutex + semantic dedup
- Песочница `run_script` (Docker); счётчик стоимости облачных запросов в статус-баре
- `check_cve`: проверка уязвимостей через NVD и OSV API (отчёт в чате)
- Авто-архивация выполненных пунктов ROADMAP: `complete_self_improvement_item` теперь переносит блок в ROADMAP_DONE.md
- `prioritize_roadmap_items` — приоритизация задач ROADMAP по пользе и риску для self-improvement и UI

- Auto-update installer fallback handles async `spawn` errors without main-process crash dialog.

- Tool `find_magic_numbers`: отчёт о «магических» числовых литералах вне `shared/constants.ts` и без именованной константы рядом

- Tool `find_unsafe_regex`: report of regex with catastrophic backtracking (ReDoS) risk

- Plugins: added a Settings UI path for plugin folders and a Superpowers-style skills import flow from repository roots


### P2P ? ??????????
- `find_p2p_connection_issues`: ????? ? ?????????? WSS URL, reconnect backoff, timeout ? health-check ??? p2pClient.ts
