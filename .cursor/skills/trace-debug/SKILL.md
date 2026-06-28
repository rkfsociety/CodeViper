---
name: trace-debug
description: >-
  Разбирает JSON-трейсы агента CodeViper (%APPDATA%/CodeViper/traces/) и
  чинит runtime агента (handlers, промпты, валидацию, провайдеры), а не
  выполняет задачу пользователя за установленный .exe. Use when the user
  attaches a trace file, mentions trace-report, agent failure in CodeViper,
  or asks to debug agent behavior from traces/*.json.
disable-model-invocation: true
---

# Trace Debug (CodeViper)

Пользователь присылает трейс **чтобы починить CodeViper**, а не чтобы Cursor выполнил ROADMAP/фичу вместо установленного `.exe`.

## Быстрый старт

1. Открыть JSON: экспорт `{timestamp}.json` или live `traces/chats/{chatId}.json`.
2. Найти **первую аномалию** (не последний симптом): зацикливание, неверный инструмент, HTTP 402/429, `undefined`, «0 файлов», отказ модели.
3. Сопоставить с кодом в `app/electron/main/` и `app/shared/`.
4. Минимальный фикс + unit-тест на регрессию.
5. Запись в `.cursor/memories.md`; при связанном GitHub issue — `closes #N` или `gh issue close`.

Подробности формата событий и карта типичных фиксов — [reference.md](reference.md).

## Чеклист разбора

```
- [ ] run_start: модель, провайдер, userMessage, projectPath
- [ ] Цепочка tool_call → tool_result: аргументы, ошибки, повторы
- [ ] llm_response: отказ, галлюцинация путей, text-based tool calls
- [ ] run_end: status, причина обрыва
- [ ] Сколько шагов / токенов до 429 или billing error
```

## Куда править (по симптому)

| Симптом | Куда смотреть |
|---------|----------------|
| Неверный/не тот инструмент | `agentTools.ts`, `toolCalls.ts`, nudges в `agent.ts` |
| Ошибка handler (trim, path) | `agentHandlers*.ts`, `services.ts`, `codeviperSource.ts` |
| ROADMAP/самоулучшение сошло с рельс | `agentHandlersSelfImprovement.ts`, `shared/selfImprovement.ts`, `actionVerification.ts` |
| Провайдер 402/429/timeout | `providers/*Provider.ts`, `modelRuntime.ts`, `ProviderBillingError` |
| Пути `app/app/`, корень vs `app/` | `normalizeCodeViperPath`, подсказки в `agentContext.ts` |
| Trace/GitHub IPC | `traceStorage.ts`, `traceGithubReport.ts`, `registerLiveRuntimeGithubTraceIpc.ts` |

## Делать

- Чинить **агента и инфраструктуру**, чтобы следующий прогон `.exe` справился сам.
- Добавлять/обновлять тест в `app/tests/` (vitest).
- Перед UI-проверкой помнить: пользователь работает только с `c:\Program Files\CodeViper\CodeViper.exe`; runtime — `%APPDATA%\CodeViper\source` после pull.

## Не делать

- Не реализовывать пункт ROADMAP «за CodeViper» (не писать фичу вместо агента).
- Не просить пользователя вручную доделать то, что должен сделать агент после фикса.
- Не предлагать `CodeViper.cmd` для проверки после фикса.

**Исключение:** явный запрос «сделай сам» / «выполни пункт N» — можно править код фичи напрямую.

## После фикса

1. `npm run typecheck` → `npm run test -- <релевантный-тест>` → `npm run build` (из `app/`).
2. Строка в `.cursor/memories.md`: `YYYY-MM-DD · trace <id> — суть и фикс`.
3. Если issue с меткой `trace-report` закрыт фиксом — `closes #N` в коммите.

## Пример вывода анализа

```markdown
## Trace 1782668736976

**Задача:** ROADMAP п.1 (qwen2.5-coder:7b)

**Корень:** после `read_roadmap_item` модель не вызвала `set_self_improvement_plan`, 3× `read_roadmap_item`.

**Фикс:** автоплан из кэша после 2 nudges; `buildPlanFromRoadmapItem`; предзагрузка пункта при старте.

**Файлы:** `agentHandlersSelfImprovement.ts`, `shared/selfImprovement.ts`

**Тест:** `app/tests/selfImprovementPlan.test.ts`
```
