# Архитектура

## Структура проекта

```
CodeViper/
├── CodeViper.cmd          # запуск приложения
├── docs/                  # документация
└── app/
    ├── shared/            # общие утилиты (constants, toolCalls, modelRouter и др.)
    ├── electron/
    │   └── main/
    │       ├── agent.ts                       # AgentRunner: цикл ReAct
    │       ├── agentHandlersProject.ts         # файлы проекта, команды, git
    │       ├── agentHandlersCodeViper.ts       # саморедактирование
    │       ├── agentHandlersMemory.ts          # remember / search_memory / forget
    │       ├── agentHandlersSkills.ts          # CRUD навыков
    │       ├── agentHandlersSelfImprovement.ts # план самоулучшения
    │       ├── agentHandlersModels.ts          # обучение моделей Ollama
    │       └── agentLogger.ts                  # NDJSON-лог шагов
    └── src/
        ├── hooks/
        │   ├── useAgentStream.ts     # подписка на стрим агента
        │   ├── useMessageQueue.ts    # очередь, executeRun, stopAgent
        │   └── useContextPreview.ts  # debounce-превью контекста
        └── components/               # React GUI
```

## Цикл ReAct

1. Запрос в Ollama с инструментами, памятью, путём проекта, деревом файлов, историей чата
2. Модель вызывает инструменты (`read_file`, `edit_file`, `run_command`, `git_status`, …)
3. Read-only инструменты выполняются **параллельно** (`Promise.all`)
4. Результаты возвращаются модели
5. Повторяется до завершения (макс. 12 шагов по умолчанию)
6. После задачи с изменениями — рефлексия и сохранение уроков

## Безопасность

- Агент работает **только внутри** выбранной папки проекта
- **Режимы доступа** (Настройки):
  - `Спрашивать всё` — подтверждение перед каждым мутирующим действием
  - `Принимать правки, спрашивать команды` — файлы сразу, команды с подтверждением
  - `Без подтверждений` — агент действует самостоятельно (по умолчанию)
- Файлы >500 KB не читаются целиком (чанки по 300 строк)
- Опасные команды блокируются (`rm -rf`, `format`, `shutdown`, encoded PowerShell и др.)
- `run_command` без `shell: true`; таймаут 120 с; лимит команды 4096 символов
- `git_status/diff/log` — только чтение через фиксированные аргументы
- Повреждённые хранилища сохраняются как `*.corrupt-<ts>`, не затираются

> ⚠️ Блок-лист — грубый фильтр, не песочница. Агент имеет широкий доступ к файлам и может редактировать собственные исходники. Для полного контроля включите «Подтверждение действий».

## Логирование

Каждый шаг агента, tool call (имя, аргументы, результат, время) и ответ LLM (токены, tok/s) пишутся в NDJSON:
`%APPDATA%/CodeViper/logs/agent-ГГГГ-ММ-ДД.ndjson` — ротация раз в день.

## Разработка

```powershell
cd app
npm run dev        # GUI + hot reload
npm run build      # сборка в out/
npm run typecheck  # проверка TypeScript
npm test           # unit-тесты (vitest)
npm run test:watch # тесты в watch-режиме
```

## Сравнение с Cursor

| | Cursor Pro | CodeViper |
|---|---|---|
| Цена | $20/мес | $0 |
| Лимиты | Месячные пулы | Нет |
| Качество AI | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ (зависит от модели) |
| Приватность | Облако | 100% локально |
| Редактор + autocomplete | ✅ | ❌ |
| Agent | ✅ | ✅ |

CodeViper — не IDE с подсказками, а чат с агентом, который сам правит проект. Можно держать оба параллельно.
