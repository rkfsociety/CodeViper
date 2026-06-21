# Правила проекта CodeViper

## Сборка после изменений

- **После любого изменения кода в `app/` — всегда запускать `npm run build` в папке `app/` перед коммитом.** Пользователь не умеет и не должен собирать вручную — папка `out/` в коммите должна быть актуальной.
- Никогда не говорить пользователю «пересобери», «запусти build», «перекомпилируй» — это задача агента. Пользователь только запускает `CodeViper.cmd`.
- Порядок перед каждым коммитом: `npm run typecheck` → `npm run build` → **обновить ROADMAP** (перенести выполненные задачи) → `git commit` → `git push`.
- **После каждого коммита обязательно делать `git push`.** Приложение при запуске тянет код с GitHub (`git pull`) — без пуша пользователь получит старую версию. Коммит без пуша = изменений нет.

## После каждой выполненной задачи (ROADMAP)

- **После любого коммита с изменением кода — обновить `ROADMAP.md`**: найти задачи, которые реализованы этим изменением, и перенести их из «В планах» в «✅ Сделано». Не ждать отдельной просьбы — это часть порядка перед коммитом.
- Удалить выполненный пункт из раздела «В планах» (или всю группу, если завершена полностью). **Выполненные пункты никогда не остаются в «В планах»** — даже помеченные `[x]`.
- Добавить краткую запись в раздел «✅ Сделано» в **конце файла** (объединять с похожими темами, без деталей реализации).
## Дорожная карта (ROADMAP.md)

- Раздел «📋 В планах» — задачи **сгруппированы по теме**, внутри каждой группы отсортированы **от лёгких к сложным**.
- **Если в категории выполнены все пункты** (нет ни одного пункта в разделе «В планах»), **удаляем эту категорию целиком** — пустые заголовки засоряют документ.

---

## Команды разработки

Все команды запускаются из папки `app/`:

```bash
npm run typecheck   # tsc --noEmit — только проверка типов, без сборки
npm run build       # electron-vite build — собирает main + renderer в out/
npm run dev         # electron-vite dev — дев-сервер с hot reload
npm run test        # vitest run — все unit-тесты
npm run lint        # eslint — проверка без fix
npm run lint:fix    # eslint --fix — автоисправление
npm run format      # prettier --write . — форматирование
npm run test:e2e    # playwright test — E2E через Electron
```

**Порядок перед коммитом:** `typecheck` → `build` → обновить ROADMAP/README → `git commit` → `git push`.

Husky + lint-staged автоматически запускают `eslint --fix` и `prettier --write` для `.ts/.tsx` при каждом коммите — не нужно делать вручную.

---

## Архитектура

### Процессы Electron

Приложение разделено на **два изолированных процесса** — это ограничение Electron, не выбор дизайна:

- **Main process** (`app/electron/main/`) — Node.js, имеет доступ к файловой системе, shell, git. Здесь живёт вся логика агента.
- **Renderer process** (`app/src/`) — браузерный React, доступа к FS нет. Общение с main только через `ipcRenderer`/`ipcMain`.

Попытка использовать `fs`, `path`, `child_process` в renderer — ошибка компиляции. Весь IO — только через IPC.

### Директории

```
app/
├── electron/
│   └── main/               # Main process
│       ├── index.ts         # Точка входа, регистрация всех IPC-обработчиков
│       ├── agent.ts         # AgentRunner — главный цикл ReAct (read → think → tool → repeat)
│       ├── agentContext.ts  # Построение системного промпта и сообщений для модели
│       ├── agentTools.ts    # Определения схем всех инструментов (~70 штук)
│       ├── agentHandlers*.ts  # Реализации инструментов по группам (project, git, github, memory, …)
│       ├── modelRuntime.ts  # Фасад для выбора провайдера (Ollama/OpenAI/Gemini/Claude)
│       ├── settings.ts      # Загрузка/сохранение настроек; Zod-схема PersistedSettingsSchema
│       ├── services.ts      # Файловые операции (read/write/grep/find); блокировка опасных команд
│       ├── contextSummarizer.ts  # Сжатие истории при заполнении контекста на 85%
│       ├── selfCommit.ts    # Git-операции при саморедактировании; retry 1→2→4 с
│       └── providers/       # Реализации провайдеров: ollamaProvider, openaiProvider, geminiProvider, claudeProvider
├── shared/                  # Импортируется и из main, и из renderer (нет Node.js API)
│   ├── modelProvider.ts     # Интерфейсы ModelProvider, ChatChunk, ChatOptions
│   ├── actionVerification.ts  # Regexp + LLM-верификация: нужны ли инструменты для задачи
│   ├── toolCalls.ts         # Парсинг вложенных tool calls из текста модели
│   ├── constants.ts         # Все числовые и строковые константы (лимиты, URL, таймауты)
│   ├── recommendedModels.ts # RamTier, список рекомендованных моделей (минимум 7b)
│   └── permissions.ts       # PermissionMode: ask | acceptEdits | bypass
└── src/                     # Renderer process
    ├── App.tsx              # Корень: хранит Map<chatId, ChatMessage[]> для параллельных агентов
    ├── types.ts             # Все shared-типы между main и renderer (AgentSettings, ChatMessage, …)
    ├── contexts/            # AgentContext, ChatContext, QueueContext — через useReducer + Context
    └── components/          # React-компоненты; один файл = один компонент
```

### Интерфейс `ChatChunk` — критично

Стримящийся ответ модели — это `AsyncGenerator<ChatChunk>`. **Поля:**
- `chunk.content` — текст (может быть пустой строкой, не null)
- `chunk.thinking` — блок размышлений (опционально)
- `chunk.stop_reason` — ненулевое значение означает конец стрима
- `chunk.tool_calls` — нативные tool calls от cloud-провайдеров

**Нет полей `.type` и `.text`** — попытка их использовать вызовет ошибку TS `Property 'type' does not exist`. Это однажды сломало реализацию `classifyMutationNeededByLLM`.

### Добавление нового инструмента агента

1. Описать схему в `agentTools.ts` (массив `AGENT_TOOLS`, формат `{ name, description, parameters }`)
2. Добавить имя в `AGENT_TOOL_NAMES` в `shared/toolCalls.ts` — без этого text-based tool calls от Ollama не будут распознаваться
3. Реализовать обработчик в подходящем `agentHandlers*.ts`, зарегистрировать в `getToolHandlers()` в `agent.ts`
4. Добавить в `MUTATING_TOOLS` в `actionVerification.ts`, если инструмент меняет файлы/данные

### Добавление нового провайдера моделей

1. Реализовать интерфейс `ModelProvider` из `shared/modelProvider.ts` (методы: `ping`, `listModels`, `chat`)
2. `chat()` должен возвращать `AsyncGenerator<ChatChunk>` — синхронизировать поля с интерфейсом
3. Зарегистрировать в `ModelRuntime.createProvider()` в `modelRuntime.ts`

---

## TypeScript: ограничения и правила

### strict-режим + noUnusedLocals/Parameters

В `tsconfig.json` включено:
```json
"strict": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true
```

**Почему:** `noUnusedLocals` однажды поймал ошибку, когда переменная с результатом операции была объявлена, но не использована — изменение молча не применялось. Без флага это прошло бы в прод.

**Следствия:**
- Неиспользуемый параметр функции → ошибка компиляции. Префикс `_` (например, `_event`) помечает намеренно неиспользуемый параметр.
- `any` разрешён только явный — неявный `any` из-за отсутствия типа вызовет ошибку.
- В `switch` нельзя пропустить `break`/`return` без явного `// falls through`.

### Настройки — только через Zod-схему

Все поля настроек объявлены в `PersistedSettingsSchema` в `settings.ts`. При загрузке вызывается `safeParse()` с fallback на `normalize()`. **Никогда не читать `settings.json` напрямую** — всегда через `loadSettings()`.

Добавление нового поля: сначала в схему Zod с `.optional()` или дефолтом (иначе сломается загрузка у пользователей со старым файлом настроек), потом в тип `AgentSettings` в `src/types.ts`.

### Shared-код не должен использовать Node.js API

Папка `shared/` импортируется и в main, и в renderer. Любой `import { readFile } from 'fs/promises'` в `shared/` сломает сборку renderer. Весь IO — только в `electron/main/`.

---

## Импорты

- **Путь `@/*`** — псевдоним для `app/src/*` (настроен в `tsconfig.json`). Использовать только в renderer.
- **Относительные импорты** — в main и shared. Пример из `agent.ts`: `../../shared/constants`, `./agentTools`.
- **Нет barrel-файлов** (`index.ts` с реэкспортами) — каждый модуль импортируется напрямую. Это избегает циклических зависимостей, которые в прошлом приводили к `undefined` при инициализации.

---

## Обработка ошибок

- **Файловые операции:** `services.ts` возвращает строку с ошибкой вместо throw — агент получает текст `Ошибка: ...` и может повторить попытку. Не оборачивать повторно в try/catch снаружи.
- **IPC:** обработчики в `index.ts` могут throw — Electron автоматически отправит rejection на renderer. Не глотать ошибки молча.
- **Git-операции в `selfCommit.ts`:** retry-цикл 3 попытки (1 с → 2 с → 4 с). После исчерпания — `throw new Error(...)` с деталями. Причина: git lock-файлы иногда не освобождаются мгновенно.
- **Стримящийся ответ:** `chunk.stop_reason` — признак конца стрима. Проверять его, а не длину текста или количество итераций.

---

## Константы

Все числовые лимиты и URL — в `shared/constants.ts`. **Никогда не хардкодить** числа или URL прямо в логике. Причина: одно и то же значение (например, `FILE_SIZE_LIMIT_BYTES = 512_000`) используется в нескольких местах — хардкод приводит к рассинхронизации.

Ключевые константы:
- `FILE_SIZE_LIMIT_BYTES = 512_000` — файлы больше не читаются целиком; агент получает предупреждение
- `READ_DEFAULT_LINE_LIMIT = 300` — строк по умолчанию при чтении файла
- `MAX_CONSECUTIVE_SAME_TOOL = 5` / `MAX_SAME_TOOL_TOTAL = 50` — защита от зацикливания агента
- `DEFAULT_COMMAND_TIMEOUT_SEC = 120` — таймаут shell-команд

---

## Нейминг

- **Файлы:** `camelCase.ts` для модулей, `PascalCase.tsx` для React-компонентов.
- **Обработчики инструментов:** `agentHandlers{Группа}.ts` — project, gitHub, codeViper, memory, skills, todo, models, selfImprovement.
- **IPC-каналы:** строки вида `'agent-stream'`, `'load-settings'` — kebab-case, глагол-существительное. Все каналы объявлены в `index.ts`.
- **Типы vs интерфейсы:** предпочитать `interface` для объектов с методами (провайдеры), `type` для union-ов и алиасов.
- **Экспорт:** именованный экспорт везде. `export default` только в React-компонентах (требование React.lazy).
