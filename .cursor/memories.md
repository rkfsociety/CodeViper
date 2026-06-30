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
