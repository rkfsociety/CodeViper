# Trace Debug — справочник

## Где лежат трейсы

| Путь | Содержимое |
|------|------------|
| `%APPDATA%/CodeViper/traces/{timestamp}.json` | Экспорт из UI (кнопка экспорта) |
| `%APPDATA%/CodeViper/traces/chats/{chatId}.json` | Live-трейс чата, восстанавливается после перезапуска |

Экспортный payload:

```json
{
  "chatId": "...",
  "projectPath": "C:/path/to/project",
  "exportedAt": 1782668736976,
  "events": [ ... ]
}
```

Live-файл чата:

```json
{
  "chatId": "...",
  "updatedAt": 1782668736976,
  "events": [ ... ]
}
```

## События (`AgentTraceEvent`)

| `kind` | Что искать в `data` |
|--------|---------------------|
| `run_start` | `model`, `provider`, `userMessage`, настройки прогона |
| `llm_request` | размер контекста, системный промпт (если есть) |
| `llm_response` | текст, `stop_reason`, нативные `tool_calls` |
| `tool_call` | `toolName`, аргументы |
| `tool_result` | вывод, строки «Ошибка: …», пустой результат |
| `run_end` | `status`, причина завершения |

Схема: `app/shared/ipcContracts.ts` → `AgentTraceEventSchema`.

## Типичные паттерны сбоев

### Зацикливание инструмента

- Много подряд одинаковых `tool_call` с тем же `toolName`.
- Проверить: `MAX_CONSECUTIVE_SAME_TOOL`, nudges в `agent.ts`, корректность ответа handler.

### Неверные пути CodeViper

- `grep_files` / `list_directory` в корне репо вместо `grep_codeviper_files` / `read_codeviper_file`.
- Симптом: «0 файлов», поиск `src/` без `app/`.
- Фикс: подсказки самоулучшения, `resolveRoadmapFileHints`, `normalizeCodeViperPath`.

### ROADMAP без плана

- `read_roadmap_item` есть, `set_self_improvement_plan` нет — модель «описывает» шаги текстом.
- Фикс: автоплан, nudge, предзагрузка пункта.

### Billing / rate limit

- HTTP 402 (DeepSeek/OpenRouter) или 429 после большого числа шагов.
- Фикс: `ProviderBillingError`, abort на N шаге, сокращение разведки, эскалация модели.

### Trace → GitHub

- Метка issue: `trace-report` (`node scripts/ensure-github-labels.mjs`).
- Код: `traceGithubReport.ts`, IPC в `registerLiveRuntimeGithubTraceIpc.ts`.
- Установленный `.exe` может отдавать старый asar-IPC; live runtime из git-клона переопределяет handlers.

## Диагностика installed runtime

При расхождении «фикс в master, баг в .exe»:

1. Версия `CodeViper.exe` (оболочка).
2. Коммит в `%APPDATA%/CodeViper/source` (`git log -1`).
3. Логи `%APPDATA%/CodeViper/logs/bundled-source-*.ndjson` — asar vs live.
4. Перезапуск `.exe` после push (git pull в source).

## Связанные правила

- `.cursor/rules/trace-reports.mdc` — always-on напоминание (кратко).
- `.cursor/memories.md` — журнал прошлых trace-инцидентов.
