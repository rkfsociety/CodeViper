# Выполнено — CodeViper

Реализованные возможности и справка по live runtime. Активные задачи — [ROADMAP.md](ROADMAP.md).

## ✅ Блок 0 — Live runtime с GitHub (завершён)

> Установленный `.exe` — тонкая оболочка; agent runtime подтягивается из клона `%APPDATA%\CodeViper\source` без переустановки NSIS.

### Когда нужен полный релиз (NSIS, `vX.Y.Z`, переустановка)

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
- IPC → 9 модулей `register*Ipc`; `agentTools` → core/integrations/mcp; `agentHandlersProject` → file/search/terminal
- `SettingsModal` → 6 вкладок; `ChatPanel/` подкомпоненты; `commandRunner` выделен из `services.ts`
- Провайдеры Claude/Gemini → `StreamingChatProvider`; агент на 6 модулей; параллельные tool calls; LRU-кэши

### Агент и инструменты
- Git: checkout, stash, commit, push; GitLab, Jira, Linear; ROADMAP-панель, slash-команды, `disabledTools`
- `list_pull_requests` — открытые PR и статус CI через gh (как панель PR в UI)
- `list_roadmap` — список пунктов «В планах» из ROADMAP.md (num · title · chain)
- `read_roadmap_item` — полный блок пункта N: цель, файлы, действие, проверка
- `set_self_improvement_plan`: алиасы title/item/name; action/check (ROADMAP, fix #23); `complete_self_improvement_item` — id и алиас `item_id` (Gemini); валидационные ответы инструментов в trace как ошибка; `grep_*` — алиас `paths[0]` для `path`; Gemini — минимальные JSON-схемы tools (fix #19); маркированный список вместо JSON + AUTO вместо ANY при >40 tools (fix #20)
- Описания search-инструментов (`grep_files` / `find_files` / `search_in_file` / `file_search_summary`) в tool schema и viper-files
- `docs/tools-api.md` синхронизирован с `agentTools/` и `AGENT_TOOL_NAMES` (индекс, Git, GitHub, ROADMAP)
- Субагенты Explorer/Editor; оркестратор node-llama-cpp; checkpoint и откат прогона; `run_tests` с авто-починкой
- RAG (Qdrant/Milvus), символьный индекс ts/js/py, инкрементальная индексация, secret redaction, бенчмарк моделей

### UX и UI
- Resizable split layout: панель «Превью» справа от чата с перетаскиваемым разделителем; ширина и видимость в `ui-layout.json`
- DiffPreviewModal (side-by-side, cherry-pick hunks); ProjectTree; @-mentions; trace export/replay; MetricsPanel
- Горячие клавиши: Esc — стоп агента; Ctrl+Shift+N — новый чат; Ctrl+B — дерево файлов (модалка `?`)
- Vision-ввод; ErrorBoundary; prompt templates; tray; UpdateBanner; уведомления и звук по завершении агента; toast при ожидании подтверждения (preview/danger/диалог), если окно не в фокусе
- Коллективная память: рейтинг, AgentLearningPanel, шаблоны чатов, SelfImprovePlanPanel, `.codeviper/rules.md`

### P2P и интеграции
- `server/p2p`: Fastify, auth, router, TLS, кредиты, согласие в UI, тумблер «Поделиться мощностью»
- MCP health-check и `enabledTools`; webhooks; режим инкогнито; плагины с hot-reload и Zod-валидацией

### Качество, CI, установщик
- E2E windows/ubuntu/macos; coverage thresholds; `npm audit` в CI; TypeDoc + GitHub Pages
- NSIS + POSIX `CodeViper.sh`; CONTRIBUTING, issue/PR templates; `.codeviperignore`
- `debugAgent`; удалён deprecated `cloudApiKey`; `list_directory` резолвит path от корня проекта

### Надёжность и безопасность
- Per-step timeout; Ollama fallback при circuit open; лимит буфера `runCommand` (10 МБ)
- `encryptApiKey` fallback; `normalizeCommand`; collective memory mutex + semantic dedup
- Песочница `run_script` (Docker); счётчик стоимости облачных запросов в статус-баре
