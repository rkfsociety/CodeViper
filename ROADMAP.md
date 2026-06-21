# Дорожная карта CodeViper

Планы развития и список выполненного. Назад в [README](README.md).

## 📋 В планах


| Модуль | Задача | Приоритет | Сложность | Зависит от | Статус |
|---|---|---|---|---|---|
| **Архитектура** | В `memory.ts` выделить интерфейс `MemoryStorage { read(): Promise<MemoryStore>; write(store: MemoryStore): Promise<void> }`; текущая реализация — `FsMemoryStorage`; в тестах использовать `InMemoryStorage` | Low | M | — | ⏳ |
| **Архитектура** | Разбить `agent.ts` (~1300 строк) на 5 классов: `ContextManager`, `ToolExecutor`, `SelfImprovementOrchestrator`, `LoopGuard`, `ResponseEmitter`; каждый ≤ 300 строк; `AgentRunner` остаётся фасадом | Low | L | — | ⏳ |
| **Интеграции** | Создать `.github/workflows/release.yml`: при push тега `v*` запускать `electron-builder --publish always`, публиковать артефакты `.exe`/`.dmg`/`.AppImage` в GitHub Releases | High | M | — | ⏳ |
| **Интеграции** | Установить `electron-updater`, добавить проверку GitHub Releases при старте приложения; при наличии новой версии показывать баннер с кнопкой «Перезапустить и обновить» | High | M | CI pipeline | ⏳ |
| **Интеграции** | В `agentHandlersGitHub.ts` добавить инструмент `trigger_github_workflow`: вызывает `gh workflow run {workflowId} --ref {ref}`; принимает `workflowId`, опционально `ref` и `fields` (JSON-строка с inputs) | Medium | S | — | ⏳ |
| **Интеграции** | В `agentTools.ts` добавить параметр `disabledTools: string[]` в `AgentSettings`; в `getAgentTools()` фильтровать инструменты согласно настройкам; в `SettingsModal.tsx` показывать чекбоксы по группам инструментов | Medium | M | — | ⏳ |
| **Интеграции** | Добавить `.sh`-лаунчер для Linux/macOS аналогично `CodeViper.cmd`; в GitHub Actions настроить матрицу `windows-latest` / `ubuntu-latest` / `macos-latest`; исправить пути `app/electron/main` для POSIX | Medium | L | — | ⏳ |
| **Интеграции** | Добавить в `AgentSettings` поля `jiraUrl`, `jiraToken`; реализовать инструмент `create_jira_issue` в `agentHandlersGitHub.ts`: POST `{jiraUrl}/rest/api/3/issue` с Basic-авторизацией через token | Low | M | — | ⏳ |
| **Интеграции** | Добавить в `AgentSettings` поле `linearApiKey`; реализовать инструмент `create_linear_issue` в `agentHandlersGitHub.ts`: GraphQL-мутация `issueCreate` через `https://api.linear.app/graphql` | Low | M | — | ⏳ |
| **Интеграции** | Создать `Dockerfile` с Node.js 20 + Ollama; `docker-compose.yml` с томом исходников CodeViper и hot reload через `npm run dev`; документировать запуск в README | Low | M | — | ⏳ |
| **Инфраструктура** | Написать NSIS-скрипт для `electron-builder`: при установке клонировать репозиторий CodeViper в `%APPDATA%\CodeViper\source\` через `git clone`, создавать ярлык на рабочем столе, запускающий `CodeViper.cmd` | Medium | L | — | ⏳ |
| **Инфраструктура** | При сборке `electron-builder` скачивать портативный Node.js в `resources/node/`; при самопересборке агента (`npm run build` в CodeViper) использовать этот Node.js, а не системный | Low | M | — | ⏳ |
| **Инфраструктура** | Установить и скомпилировать `node-llama-cpp` как нативный Electron-модуль для win32/linux/darwin; smoke-тест: загрузить GGUF, получить один токен, выгрузить; без этого оркестратор не работает | Low | XL | — | ⏳ |
| **Контекст** | В `fileSearchInWorker.ts` добавить LRU-кэш 200 записей для результатов `find_files`; ключ `{pattern, root}`, инвалидация по `mtime` корневой директории; аналогично существующему кэшу grep | Medium | M | — | ⏳ |
| **Контекст** | В `contextSummarizer.ts` в `compressContextMessages`: удалять из истории tool results, чей `content` начинается с `Ошибка:`, если для того же инструмента есть более поздний успешный результат; оставлять только последнюю попытку | Low | S | — | ⏳ |
| **MCP** | В `SettingsModal.tsx` на вкладке «Интеграции» добавить секцию MCP: список подключённых серверов из настроек, кнопка «+ Добавить», поле ввода URL; сохранять в `AgentSettings.mcpServers: string[]` | Medium | S | Парсинг схем MCP | ⏳ |
| **MCP** | Реализовать `mcpRegistry.ts`: при добавлении URL сервера делать GET `{url}/.well-known/mcp`, парсить JSON-схему `{ tools: [{name, description, parameters}] }`, сохранять в `AgentSettings.mcpServers` | Medium | M | — | ⏳ |
| **MCP** | В `agentTools.ts` в функции `getAgentTools()` динамически добавлять инструменты из `AgentSettings.mcpServers` перед каждым прогоном агента; вызовы проксировать через `POST {serverUrl}/tools/call` | Medium | M | Парсинг схем MCP | ⏳ |
| **MCP** | После выполнения инструмента MCP отправлять результат обратно на сервер: POST `{serverUrl}/tools/result` с `{ toolCallId, result }`; нужно для stateful MCP-серверов, хранящих контекст сессии | Low | M | Регистрация MCP | ⏳ |
| **Оркестратор** | В `SettingsModal.tsx` добавить секцию «Оркестратор»: тумблер включить/выключить (`AgentSettings.orchestratorEnabled`), числовое поле порога длины сообщения (`minMessageLength`, дефолт 80), кнопка «Удалить модель» | Low | S | Класс OrchestratorModel | ⏳ |
| **Оркестратор** | В `SettingsModal.tsx` → вкладка «Модель» → раздел оркестратора добавить кнопку «Выбрать GGUF-модель» (`dialog.showOpenDialog` с фильтром `*.gguf`); путь сохранять в `AgentSettings.orchestratorModelPath` | Low | M | — | ⏳ |
| **Оркестратор** | При первом запуске с включённым оркестратором скачивать `Qwen2.5-1.5B-Instruct.Q4_K_M.gguf` (~900 МБ) в `app.getPath('userData')/orchestrator/`; показывать прогресс через `onProgressEvent`; кнопка «Скачать» в настройках | Low | M | — | ⏳ |
| **Оркестратор** | Интегрировать `OrchestratorModel.analyze()` в `AgentRunner.run()`: вызывать перед первым прогоном, добавлять `plan` в системный промпт, при `isComplex=true` использовать перефразированный запрос вместо оригинального | Low | M | Класс OrchestratorModel | ⏳ |
| **Оркестратор** | Создать `orchestratorModel.ts`: singleton, загружает GGUF через `node-llama-cpp`, реализует метод `analyze(message: string): Promise<{ plan: string; rephrased: string; isComplex: boolean }>`; без стриминга, только итоговый JSON | Low | L | Загрузчик модели | ⏳ |
| **P2P** | При первом включении режима «Поделиться мощностью» показывать модальный диалог с явным описанием: что передаётся (промпты, модель), лимиты ресурсов, как отключить; без согласия режим не активируется | Low | S | Режим «Поделиться мощностью» | ⏳ |
| **P2P** | В `AgentRunner` перед выполнением задачи проверять загрузку через `systeminformation`; если GPU > 20% или CPU > 15% — ставить входящую P2P-задачу в паузу и не принимать новые | Low | M | Сигнальный сервер | ⏳ |
| **P2P** | В `SettingsModal.tsx` добавить тумблер «Поделиться мощностью»; при включении регистрировать узел на сигнальном сервере (POST `/nodes/register`) с параметрами GPU/RAM/модели | Low | M | Сигнальный сервер | ⏳ |
| **P2P** | На узле принимать не более 3 входящих P2P-задач одновременно; новые задачи сверх лимита — в очередь с таймаутом 60 с; при превышении таймаута отклонять с кодом 503 | Low | M | Сигнальный сервер | ⏳ |
| **P2P** | Использовать TLS для WebSocket-соединений между узлами; шифровать тело промптов симметричным ключом сессии (ECDH); владелец узла не должен иметь доступа к содержимому чужих запросов | Low | M | Сигнальный сервер | ⏳ |
| **P2P** | На сигнальном сервере при запросе задачи искать свободный узел с нужной моделью по реестру; если свободных нет — возвращать `{ fallback: true }`, клиент выполняет локально через Ollama | Low | L | Сигнальный сервер | ⏳ |
| **P2P** | Реализовать систему кредитов: +N кредитов за каждую обработанную чужую задачу, −N за использование чужого узла; хранить баланс на сигнальном сервере; отображать в `AgentStatusBar.tsx` | Low | L | Аккаунтная система | ⏳ |
| **P2P** | Развернуть Node.js + WebSocket + Redis сервер на VPS; реализовать REST API: `POST /nodes/register`, `GET /nodes/available?model=X`, `DELETE /nodes/{id}`; хранить список узлов с GPU/RAM/нагрузкой | Low | XL | — | ⏳ |
| **P2P** | Реализовать аккаунтную систему на сигнальном сервере: регистрация по email или GitHub OAuth, JWT-токен передаётся при регистрации узла и запросах задач, определяет лимиты и репутацию | Low | XL | Сигнальный сервер | ⏳ |
| **Плагины** | В `SettingsModal.tsx` добавить вкладку «Плагины»: список установленных плагинов из `AgentSettings.plugins`, кнопки включить/выключить и «Открыть папку плагинов» (`shell.openPath`) | Low | S | Загрузка плагинов | ⏳ |
| **Плагины** | При старте main process сканировать `~/.codeviper/plugins/*.js`; для каждого файла делать `require()` и читать `export default { name, description, tools: AgentTool[] }`; регистрировать инструменты в `agentTools.ts` | Low | M | — | ⏳ |
| **Плагины** | При загрузке плагина `*.ts` компилировать его через `esbuild.buildSync` в CommonJS во временную папку; кэшировать скомпилированный результат по `mtime` исходника | Low | M | Загрузка плагинов | ⏳ |
| **Плагины** | Запускать код плагина в `worker_thread` с ограниченным API: доступ к `fs` только внутри `projectPath`, модуль `net` заблокирован через `--experimental-permission`; краш воркера не роняет main process | Low | L | Компиляция плагинов | ⏳ |
| **Провайдеры** | В `electron/main/index.ts` добавить провайдер Groq: переиспользовать `openaiProvider.ts` с `baseUrl: 'https://api.groq.com/openai/v1'`; добавить пункт «Groq» в выпадающий список провайдеров в `SettingsModal.tsx` и поле для API-ключа | Medium | S | — | ⏳ |
| **Провайдеры** | В `ollamaProvider.ts` и `openaiProvider.ts` выделить общую логику стриминга в абстрактный класс `StreamingChatProvider`; конкретные провайдеры реализуют только `buildRequest()` и `parseChunk()` | Medium | M | — | ⏳ |
| **Провайдеры** | В `modelRuntime.ts` реализовать circuit breaker: при 5 последовательных ошибках переходить в состояние `open` (запросы отклоняются немедленно), через 30 с — `half-open` (пробный запрос); статус отображать в `AgentStatusBar.tsx` | Medium | M | — | ⏳ |
| **Провайдеры** | В `SettingsModal.tsx` добавить «Together AI» как отдельный провайдер; переиспользовать `openaiProvider.ts` с `baseUrl: 'https://api.together.xyz/v1'` и полем для API-ключа | Low | S | Groq | ⏳ |
| **Qdrant / RAG** | Добавить в `SettingsModal.tsx` вкладку «Интеграции» поля для Qdrant URL и API-ключа с кнопкой проверки соединения; сохранять в `AgentSettings`; установить `@qdrant/js-client-rest` | Medium | M | — | ⏳ |
| **Qdrant / RAG** | Реализовать инструмент `search_knowledge_base` в `agentHandlersProject.ts`: принимает `query: string`, возвращает top-5 чанков с путями файлов из проиндексированной Qdrant-коллекции | Medium | M | Индексирование | ⏳ |
| **Qdrant / RAG** | Реализовать инструмент `index_project` в `agentHandlersProject.ts`: рекурсивно читает файлы проекта, разбивает на чанки по 500 строк, получает эмбеддинги через `computeEmbeddingQueued`, записывает в Qdrant-коллекцию `codeviper_project`; прогресс через `onProgressEvent` | Medium | L | Qdrant настройки | ⏳ |

---

## ✅ Сделано
- Per-chat `projectPath`: поле в `SavedChat`, агент берёт путь из чата через явный параметр `AgentRunner`, UI переключает проект при смене чата через изолированные `ChatContext.Provider`
- `VectorStore` абстракция в `contextRAG.ts`: Qdrant и Milvus как взаимозаменяемые бэкенды; выбор через `AgentSettings.ragProvider`
- Дедупликация повторяющихся tool results перед суммаризацией: одинаковый инструмент + вывод → `(повторено N раз)`
- Авто-превью файлов >20 КБ: первые/последние 50 строк с маркером `... (X строк обрезано) ...`
- Батчинг параллельных grep-запросов за один тик event loop в `fileSearch.ts`
- Интеграционные тесты OllamaProvider и OpenAIProvider: стриминг, tool call, 429, разрыв соединения
- Чип «Планирую…» в `AgentStatusBar` при получении stream-события `orchestrating`; раскрывающийся блок с текстом плана
- `selfCommit.ts`: retry-цикл 3 попытки 1 с → 2 с → 4 с для всех git-операций; throw с деталями при исчерпании
- `preview_patch`: новый инструмент точечной правки (old_string → new_string) с показом diff и подтверждением; `preview_edit` в режиме bypass применяется без диалога; защита от усечения файла (отклонение если новый контент < 50% старого)
- Веб-инструменты агента: `web_search` (скрапинг DuckDuckGo Lite, без API-ключей и Docker) и `web_fetch` (загрузка любого URL, HTML→текст)
- Синхронизация `AGENT_TOOL_NAMES` со всеми инструментами; скрытие JSON-попыток вызова несуществующих инструментов
- Убраны модели 3b/4b из списка скачивания — минимум 7b для агента; подсказка про размер контекста при пустом ответе
- Gemini free tier: переключатель free/paid, список моделей с лимитами RPM/TPM в пикере и настройках; настройка RPM
- `set_todo_list` принимает нативный массив от Gemini (и строку-JSON от Ollama)
- `actionVerification.ts`: LLM-верификация для граничных случаев (uncertain) — `taskMutationLikelihood()` + `classifyMutationNeededByLLM()`; снижение ложных блокировок на нестандартных командах
- `embeddingQueue.ts`: батчинг запросов до 4 штук через `Promise.all`; воркер получает пачку сразу, не по одному
- Провайдер Claude (Anthropic API): streamed responses, tool use, JSON schema validation через `@anthropic-ai/sdk`
- Провайдер Gemini: REST SSE стриминг (`streamGenerateContent`), thinking, `tool_config` (AUTO/ANY), убран SDK
- TRON (Token Reduced Object Notation): парсер и сериализатор для сжатия данных (~27% экономия); применён в localStorage (история команд), логировании NDJSON (agent logs), IPC коммуникации

**UI**
- Кнопка «Сжать историю» в превью контекста: при заполнении > 60% появляется в поповере; вызывает принудительную суммаризацию через IPC `summarize-context`
- Убран заголовок активного чата из топбара (показывал внутренние задачи самоулучшения); иконка приложения из `resources/icon.png`; логотип PNG в топбаре вместо эмодзи
- Раздельные API-ключи для DeepSeek / OpenAI / OpenRouter (шифрование `safeStorage`); миграция со старого единого `providerApiKey`
- Список моделей OpenRouter с фильтром tool calling, поиском и отображением размера контекста
- Раздельные списки чатов для вкладок Chat и Code (`SavedChat.mode`); кнопки чата скрыты по умолчанию, появляются при наведении

**Производительность**
- Динамический системный промпт: в режиме Chat — только базовый промпт (~200 токенов), без инструментов, дерева проекта и памяти; экономия 10–20% токенов на запрос
- Вкладка «Производительность» в настройках: тумблеры «Режим энергосбережения» (батчинг 300 мс, без анимаций), «Отключить CPU/GPU-статы», «Обновлять PR только вручную»
- Интервал опроса CPU/GPU снижен с 1 с до 3 с (`systemStats.ts`)
- Устойчивость при смене монитора: флаги `--disable-gpu-process-crash-limit` + `--in-process-gpu`; авто-reload рендерера при крашах GPU/renderer → `CrashRecoveryDialog` восстанавливает сессию

**Ядро агента**
- Очистка editSnapshots при старте каждого прогона — предотвращает утечку памяти в длинных сессиях
- Стриминг, кнопка «Стоп», цикл `while(true)`, инструменты (create/edit/append/delete/move/grep/find/git), tool choice, парсинг text tool call, детектор опасных задач, защита `parseToolArgs`
- Рефакторинг `agent.ts` → 6 модулей; параллельное выполнение инструментов (Promise.all) при cloud API; удалены жёсткие лимиты шагов/прогонов
- Агент не молчит при пустом ответе; не останавливается на «намерении»; пропускает tool call для информационных вопросов
- Добавлены инструменты для GitHub, файловых операций и кратких сводок по проекту

**Провайдеры и модели**
- Dual-provider режим (Ollama + cloud одновременно); нативный tool calling OpenAI/DeepSeek; `max_tokens`, `temperature` для cloud; работа без Ollama при cloud-провайдере
- Провайдер OpenRouter (агрегатор: GPT-4o, Claude, Gemini, Llama и др.) — основной и облачный
- Выбор модели в топбаре; динамический список моделей DeepSeek; совместимость моделей (✓/⚠ по RAM); управление моделями Ollama (каталог, автовыбор, скачать/удалить)
- Статистика «Xс · Yk токенов» под последним сообщением агента; пульсирующая индикаторная полоса вместо бегущей; убрана нагрузка CPU/GPU из статусбара; оптимизация промпта и описаний инструментов
- Кэш контекст-превью в `useContextPreview`: IPC-запрос пропускается, если `{messagesKey, model}` не изменились с прошлого вызова

**Контекст и память**
- LRU-кэш 500 записей для `read_file` / `read_codeviper_file` в `services.ts`; ключ `{path, offset, limit}`, инвалидация по `mtime`; автоинвалидация при write/create/append/delete
- Обрезка старых tool-результатов в `compressContextMessages()`: оставляются последние 5, более старые → `[результат обрезан]`; экономия 10–15% на длинных диалогах
- Настраиваемый порог суммаризации (50–85%, дефолт 85%) и тумблер «Агрессивное сжатие» (65%) в настройках вкладки Модель; слайдер заблокирован при включённом агрессивном сжатии
- Исключение reasoning (<think>...</think>) из истории контекста: опция в настройках (вкладка Модель), экономия 20–50% токенов для think-моделей
- Суммаризация при ~85% лимита; адаптивные лимиты (`computeAdaptiveLimits`); чип «Инструмент: Xk | История: N»
- Самообучение: `remember`, рефлексия, план самоулучшения, anti-loop, эмбеддинги (LRU 500, worker)
- Фикс гонки инициализации в `embeddingQueue.ts`: буферизация запросов до `ready`-события воркера, очистка очереди при падении воркера; 9 vitest-тестов
- Корректный контекст для облачных моделей: `getModelContextLimitTokens` распознаёт deepseek-*, gpt-*, claude-*, gemini-*; `modelContextLength` из API сохраняется в настройках и прокидывается до `computeContextUsage`
- Оптимизация токенов: инструменты разбиты на 9 категорий (file, git, github, memory, skills, todo, package, codeviper, ollama) с кэшированием преобразованных схем; `getAgentTools(selfImproveMode)` исключает 19 инструментов в обычном режиме — экономия ~35% tools JSON на каждый запрос, ~60% в обычном режиме; `buildSelfEditContext()` только в self-improve
- Инструменты GitHub: `create_issue` (title, body, labels), `create_pr`, `list_issues`, `open_issue`, `trigger_github_workflow` — через `gh` CLI
- Провайдер Gemini: прямой REST (`streamGenerateContent?alt=sse`), thinking chunks, `tool_config`, id в function calls/responses
- Новый инструмент `search_in_file`: поиск текста в одном конкретном файле без ограничения по размеру (включает файлы >512KB)
- `grep_files` теперь явно сообщает о пропущенных файлах >512KB и предлагает использовать `search_in_file`
- Скилл Todo List для агента: инструменты `set_todo_list`, `complete_todo_item`, `clear_todo_list`; компактная панель `TodoPanel` прикреплена над полем ввода, обновляется через stream-событие `todo_update`
- Черновики при обрыве стрима: `interruptedDraft`, баннер «Повторить»
- RAG (Retrieval-Augmented Generation) для контекста: `contextRAG.ts` индексирует сообщения чата в векторной БД с эмбеддингами; при построении контекста вместо просто последних N сообщений ищет релевантные по семантике — экономия токенов на длинных диалогах и сохранение важной информации

**UI/UX**
- История чатов: папки, поиск, drag-and-drop, pin, теги, привязка к проекту; экспорт/импорт JSON+Markdown
- Вложения: файлы, drag-and-drop, Ctrl+V скриншоты, base64 для мультимодальных, лимит 10 файлов/200 КБ
- Группировка одинаковых вызовов инструментов в чате; открытие файлов из текста агента
- Подсветка кода, ANSI-цвета, анимации, горячие клавиши, звуковые уведомления, тёмная тема

**Архитектура фронтенда**
- `AgentContext` (`useReducer` + Context): phase, runStats, метрики — без пропсов
- `ChatContext`: messages, activeChatId, chatStore, activeChat, interruptedDraft — без пропсов
- `QueueContext`: `busyChats: Set<string>` + `markChatBusy(chatId, busy)` — параллельный учёт занятых чатов; иконка-пульс в `ChatHistoryPanel` рядом с занятым чатом
- Виртуализация списка сообщений в `ChatPanel` через `@tanstack/react-virtual` с `measureElement` для динамических высот
- Параллельные агенты per-chat: `App.tsx` хранит `Map<chatId, ChatMessage[]>`, рендерит по одному `ChatPanel` на каждый смонтированный чат; переключение между чатами не блокируется

**Производительность**
- Workers: grep/find, эмбеддинги, парсинг больших файлов — main не блокируется
- Батчинг IPC token/thinking; батчинг токенов в UI (150 мс flush); дебаунс контекст-превью 1000 мс; `setInterval` runStats снижен
- `React.memo` на `MessageBody`; виртуализация длинных списков (`@tanstack/react-virtual`); ленивая загрузка (`React.lazy`)
- Защита от зацикливания: подсказка модели + продолжение прогона без остановки (лимиты шагов/попыток удалены)

**Git и проекты**
- Параллельные агенты per-chat (`Map<chatId, ...>`); git-sync (stash/rebase/ff-only)
- Diff перед правками (`preview_edit`): LCS → unified diff → UI с «Применить»/«Отмена»; `AbortSignal` в `createUnifiedDiff()` — проверка каждые 500 итераций LCS, fallback на построчный diff при отмене
- История изменений файлов (NDJSON-лог, `show_file_history`); ветки и PR агента
- Отложенное применение правок вне режима самоулучшения (git stash); автовосстановление после краша

**Безопасность и инфраструктура**
- `run_command` без `shell: true`; `assertInsideProject`; blocklist; шифрование API-ключей (`safeStorage`)
- ESLint + Prettier + lint-staged + husky; vitest 37+ тестов; E2E Playwright+Electron; нагрузочные тесты
- Семантическое версионирование; GitHub Actions CI; branch protection; доступность (WCAG AA)
- Статус PR в UI (CI-статус); `PrStatusPanel` опрашивает только при открытой панели (`isOpen`), интервал 300 с; автодополнение в терминале; метрики (tok/s, NDJSON-лог)
- Zod-схема `PersistedSettingsSchema` в `settings.ts`: тип `PersistedSettings` выведен через `z.infer<>`; `safeParse()` при загрузке с детальным логом ошибок и fallback на `normalize()`
