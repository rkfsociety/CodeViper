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
