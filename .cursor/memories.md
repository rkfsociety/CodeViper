# Память агента CodeViper

Краткие уроки из инцидентов. Полный журнал — также в [`.cursor/README.md`](README.md) (раздел «Память»).

## Git и доставка runtime

**2026-06-29 · коммит всегда, push по запросу (roman)**  
- **`git commit` — всегда** в конце каждой завершённой задачи (тот же сеанс).  
- **`git push` — только по явной просьбе** («запушь», «push», «отправь на GitHub»).  
- Без push runtime на `.exe` не обновится: нужны push на `master` и `git pull` в `%APPDATA%\CodeViper\source`.  
- Для этого репозитория не сообщать пользователю про `bypass branch rules`, требования PR или обязательный `build` check, если push в `master` уже успешно прошёл: это ожидаемая конфигурация репозитория пользователя.  
- Канон: `.cursor/rules/agent-workflow.mdc`.

## Тесты и ROADMAP

**2026-06-29 · поддерживать тесты актуальными (roman)**  
- При изменении `ROADMAP.md` (перенумерация, удаление пунктов, смена первого пункта, счётчик в шапке) — **в том же коммите** обновить тесты с жёсткими ожиданиями.  
- Главный файл: `app/tests/roadmapParser.test.ts` — число пунктов (`512`), заголовок пункта 1, строки в `formatRoadmapItemDetail` (`AgentStatusBar`, не `subagentRunner`).  
- Сверять с шапкой ROADMAP (`пункты 1…N`) и счётчиком в `README.md` (`N задач`).  
- Перед коммитом ROADMAP: `npm run test -- tests/roadmapParser.test.ts` (из `app/`).

**2026-06-30 · ROADMAP_DONE — формат записи (appendRoadmapDoneItem)**  
- `complete_self_improvement_item` пишет в `ROADMAP_DONE.md` через `formatRoadmapDoneEntry`: **одна строка** `- Название: цель`, не `formatRoadmapItemDetail` (полный шаблон Цель/Файлы/Действие).  
- Дубликаты по заголовку не дописываются повторно.

## Trace-отчёты

**2026-07-01 · trace 1782936461204 — identical assistant + cross-step find_files (find_commit_message_issues)**  
- Задача: ROADMAP `find_commit_message_issues`, claude-haiku-4.5-cheap:free (literouter).  
- Корень: шаг 2 — тот же текст assistant и повтор *commitMessage*/*gitTools* find_files; list_directory/read_file src (ENOENT) несмотря на подсказку app/src; файлы из «Файлы:» не читались. duplicate_tool_batch не срабатывал (набор отличался).  
- Фикс: `checkIdenticalAssistantResponse`, `checkCrossStepToolRepeats`, nudge «Файлы» (`taskFileHints.ts`); repeat-hint для list_directory.  
- Тесты: `agentLoopGuard.test.ts`, `taskFileHints.test.ts`.

**2026-07-01 · trace 1782935231774 — Reviewer subagent JSON.parse("")**  
- Задача: code review → автоделегирование Reviewer, literouter.  
- Корень: `subagentRunner` вызывал `JSON.parse("")` на пустых native tool args от cloud-провайдера → `Unexpected end of JSON input`.  
- Фикс: `parseToolArgs` вместо голого `JSON.parse`; try/catch при автоделегировании в `agent.ts`.

**2026-07-01 · trace 1782934497352 — duplicate tool batch loop (find_commit_message_issues)**  
- Задача: ROADMAP п.4 `find_commit_message_issues`, claude-haiku-4.5-cheap:free (literouter).  
- Корень: модель 17 шагов повторяла один и тот же батч `project_stats` + 4× `find_files`; LoopGuard ловит только подряд один инструмент, не весь набор; затем `list_directory src` (ENOENT) без подсказки app/src.  
- Фикс: `checkDuplicateToolBatch` + nudge после 2-го одинакового батча; `formatProjectReadErrorHint` для `list_directory`.  
- Тесты: `agentLoopGuard.test.ts`, `projectReadErrorHint.test.ts`, `readMultiplePaths.test.ts`.

**2026-07-01 · trace 1782927821235 — read_file src ENOENT в monorepo**  
- Задача: ROADMAP `find_commit_message_issues`, claude-haiku-4.5-cheap:free.  
- Корень: модель 2× `read_file("src")` — в CodeViper нет корневого `src/`, только `app/src/`; LoopGuard не срабатывал (между вызовами были find_files).  
- Фикс: `formatProjectReadErrorHint` (app/src, list_directory для папок, basename search); nudge при повторном неверном read_file в прогоне.
  
- Задача: ROADMAP `find_magic_numbers` (уровень 3), gemini-2.5-flash:free.  
- Корень: (1) `TaskPlanner.isSelfImprove` всегда `false` → `beginRun(false)` / `prepareAgentRunContext(false)` — `read_file` не ремапился в `read_codeviper_file`, нет self-improve промпта; (2) `dropSupersededErrors` удалял ENOENT, если раньше был успешный `read_file` (индекс ROADMAP), модель не видела ошибку и 6× повторяла тот же путь.  
- Фикс: `isSelfImprovementTask` в TaskPlanner + agent.ts; переписан `dropSupersededErrors` — ошибка снимается только при успехе **позже** в истории.

**2026-07-01 · read-attachment ENOENT при drag-and-drop вложений**  
- Симптом: `Error invoking remote method 'read-attachment': ENOENT …\Program Files\CodeViper\1782901466868.json`.  
- Корень: Electron 32+ убрал `File.path`; fallback `f.name` давал относительный путь, `stat` искал файл рядом с `.exe`.  
- Фикс: `webUtils.getPathForFile` в preload (`getPathForFile`); при пустом пути — чтение через `FileReader` в renderer; `read-attachment` — `isAbsolute` + try/catch вместо throw.

**2026-07-01 · trace 1782901466868 — scope nudge: .ts → src/components/**  
- Задача: ROADMAP `find_magic_numbers` (уровень 3). Агент 15+ шагов разведки, 0 правок, abort пользователем.  
- Корень: `guessScopedCodeViperPath` отправлял bare `.ts` (`magicNumberAnalysis.ts`, `agentHandlers*.ts`) в `src/components/`; nudge вёл агента в несуществующие пути, модель крутила `read_skill` + `find_files` + `list_directory src` (ENOENT).  
- Фикс: `.tsx` → `src/components/`, bare `.ts` / `agentHandlers*` / `*Analysis.ts` → `electron/main/`; `agentTools/` → `electron/main/agentTools/`; scope nudge через `resolveRoadmapFilePaths` + guess для новых файлов; partial path `agentTools/core.ts` в roadmapParser.
  
- Задача: ROADMAP `find_magic_numbers` (уровень 3). Агент зациклился на `find_files` (~30+ вызовов), `list_directory` работал.  
- Корень: `fileSearchInWorker.ts` — `join(__dirname, 'fileSearchWorker.js')` в ESM-бандле live runtime из git-клона.  
- Фикс: `getElectronMainDir()` (`import.meta.url` fallback) в `electronMainDir.ts`; то же для `embeddingQueue` / `largeFileQueue`.

**2026-07-01 · Telegram/webhook настройки слетают после обновления**  
- Симптом: `telegramBotToken` / `telegramChatId` пустые после перезапуска или runtime-update.  
- Корень: `AgentSettingsSchema` в `ipcContracts.ts` не содержал эти поля; Zod `.strip()` при `parseIpcArgs(SAVE_SETTINGS)` выбрасывал их перед `saveSettings`. Автосохранение в `App.tsx` (400 мс) перезаписывало `settings.json` без Telegram.  
- Фикс: синхронизировать `AgentSettingsSchema` с `PersistedSettingsSchema`; тест `ipcContracts.test.ts`.

**2026-07-01 · planBeforeExecute — кракозябры при отмене и «план» из одной строки**  
- Симптом: после «Отмена» в чате `???? ?? ???????????…`; в баннере плана — пересказ задачи, а не шаги; оркестратор выключен, но план шёл через qwen2.5:3b.  
- Корень: (1) UTF-8 в `agent.ts`; (2) `planBeforeExecute` вызывал `analyze()` оркестратора даже при `orchestratorEnabled=false`; (3) слабый промпт планировщика.  
- Фикс: UTF-8 строки; при `planBeforeExecute` без оркестратора — `generateExecutionPlan()` основной моделью; оркестратор только при `orchestratorEnabled`.

**2026-07-01 · облачный оркестратор (LiteRouter free tier)**  
- Запрос: выбор облачной модели оркестратора в рамках провайдера и tier (LiteRouter free → только `:free`).  
- Фикс: `orchestratorBackend: cloud`, `orchestratorCloudModel`, UI в ModelTab, `analyzeCloud()` через тот же API-ключ провайдера агента.
2026-07-01 ?? trace 1782919052296 ? added find_magic_numbers AST tool for numeric-literal noise, with tests and handler wiring.

2026-07-01 В· anti-repeat rule for CodeViper:
- Не использовать `&&` в однострочных PowerShell-командах; разбивать на отдельные вызовы.
- После изменений в `app/` всегда выполнять `npm run typecheck` → `npm run build` перед коммитом.
- Не трогать `app/test-userdata-plugin-catalog/`, это пользовательские данные.
- Перед коммитом сверять roadmap-документы и переносить выполненные пункты в `ROADMAP_DONE.md`.
- Перед началом работы читать `.cursor/README.md` и релевантные `.cursor/rules/*.mdc`.
- Правильные, проверенные решения записывать в `.cursor/memories.md`, чтобы переиспользовать их без догадок.

2026-07-01 В· memory entry format:
- Симптом, причина, фикс и способ не повторять писать в коротком стандартизированном виде.
- В память попадают только решения, подтверждённые тестом, сборкой, коммитом или явной проверкой.
