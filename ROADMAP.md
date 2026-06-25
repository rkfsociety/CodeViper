# Дорожная карта CodeViper

Планы развития и список выполненного. Назад в [README](README.md).

> **Принцип чтения:** задачи сгруппированы в цепочки — внутри каждой группы строгий порядок сверху вниз. Следующий шаг начинать только после завершения предыдущего. Между группами порядок произвольный.


### Формат задач для самообучения агента

Каждый пункт в «📋 В планах» следует **одному шаблону** — агент читает `ROADMAP.md` и строит `set_self_improvement_plan` без уточнений.

**Шаблон пункта:**

```text
N · [S/M/L/XL] · Краткое название
- Цель: один измеримый результат
- Файлы: конкретные пути (app/electron/main/…, app/src/…)
- Действие: одна атомарная правка
- Проверка: npm run typecheck | npm test -- … | сценарий в UI
```

**Промпт:** `Выполни пункт N из ROADMAP.md — самоулучшение CodeViper.`

**Правила:** нумерация сквозная (1…4); внутри цепочки — строго по порядку; один пункт = один прогон самоулучшения; после проверки — `complete_self_improvement_item`.

## 📋 В планах

> Нумерация сквозная **1…18**. Сложность: S / M / L / XL. Приоритет указан в конце пункта. Пустые категории без пунктов не держим — выполненные цепочки (P2P, базовое коллективное обучение) см. в «✅ Сделано».

### ⚡ Независимые задачи

**1 · S · ErrorBoundary в renderer** — приор. High  
- **Цель:** исключение при рендере не роняет весь UI в белый экран  
- **Файлы:** `app/src/components/ErrorBoundary.tsx`, `app/src/App.tsx`  
- **Действие:** корневой class-компонент `getDerivedStateFromError` + fallback с кнопкой «Перезагрузить»; обернуть дерево App  
- **Проверка:** компонент, бросающий ошибку в render, показывает fallback, а не пустой экран; `npm run typecheck`

**2 · S · Лимит буфера в runCommand** — приор. High  
- **Цель:** команда с бесконечным выводом не раздувает память main-процесса до OOM  
- **Файлы:** `app/electron/main/services.ts`  
- **Действие:** считать накопленные байты в обработчиках `data`; при превышении порога (константа в `shared/constants.ts`) — `killProcessTree` + пометка «вывод обрезан»  
- **Проверка:** unit-тест с командой, печатающей >лимита, завершается обрезкой; `npm test`

**3 · S · AgentRunner: options-объект** — приор. Medium  
- **Цель:** убрать 9 позиционных параметров конструктора и мёртвый `_summarizeModel`  
- **Файлы:** `app/electron/main/agent.ts`, вызовы `new AgentRunner(...)` в `index.ts`  
- **Действие:** ввести интерфейс `AgentRunnerOptions`, перевести конструктор на объект, удалить неиспользуемый параметр  
- **Проверка:** `npm run typecheck`; существующие тесты `agentRunner.integration` зелёные

**4 · S · isInsideProject без toLowerCase на не-Windows** — приор. Medium  
- **Цель:** guard пути не путает регистрозависимые ФС (Linux/macOS)  
- **Файлы:** `app/electron/main/services.ts`  
- **Действие:** понижать регистр только при `process.platform === 'win32'`  
- **Проверка:** unit-тест: на не-win `/Proj` и `/proj` считаются разными; `npm test -- services`

**5 · M · Docker dev-окружение** — приор. Low  
- **Цель:** Dockerfile Node 20 + Ollama; compose с hot reload  
- **Файлы:** `Dockerfile`, `docker-compose.yml`, `README.md`  
- **Действие:** образ + том исходников + `npm run dev`  
- **Проверка:** `docker compose up` поднимает приложение

### 🔗 Рефакторинг монолитов

### 🔗 Унификация провайдеров

### 🔗 Качество кода

**6 · M · Сокращение any + порог coverage в CI** — приор. Low  
- **Цель:** меньше явных `any` в shared/main; порог покрытия в CI  
- **Файлы:** `app/vitest.config.ts`, `.github/workflows/ci.yml`, точечно по `any`  
- **Действие:** включить `coverage` (v8) с порогом для `shared/` и `services.ts`; типизировать очевидные `any`  
- **Проверка:** `npm test -- --coverage` проходит порог; `npm run typecheck`

### 🔗 Новые возможности

**7 · L · Vision-ввод (скриншоты в чат)** — приор. Medium  
- **Цель:** вставка изображения в чат → отправка моделям с поддержкой vision (Claude/Gemini/OpenAI)  
- **Файлы:** `ChatInput.tsx`, `useAgentStream.ts`, `providers/*`, `shared/modelProvider.ts`  
- **Действие:** приём image из буфера/файла, передача как content-блока в провайдеры, поддерживающие vision  
- **Проверка:** скриншот + «что на экране?» возвращает осмысленный ответ от облачной модели

**8 · M · Библиотека промптов / слэш-шаблоны** — приор. Low  
- **Цель:** пользовательские шаблоны промптов, доступные через `/` в поле ввода  
- **Файлы:** `ChatInput.tsx`, `app/electron/main/settings.ts` (хранилище шаблонов), новый popover  
- **Действие:** CRUD шаблонов в настройках + автодополнение `/name` в инпуте  
- **Проверка:** созданный шаблон подставляется по `/name` в чат

**9 · M · Повтор прогона с шага из TracePanel** — приор. Low  
- **Цель:** перезапуск задачи с выбранного шага трейса  
- **Файлы:** `TracePanel.tsx`, `useAgentStream.ts`, IPC рестарта  
- **Действие:** кнопка «Повторить с шага» → восстановление истории до шага и новый прогон  
- **Проверка:** повтор с шага N стартует с корректным контекстом

**10 · M · Дашборд метрик агента** — приор. Low  
- **Цель:** токены, стоимость, длительность, % успешных прогонов по моделям  
- **Файлы:** `app/electron/main/agentLogger.ts`, новая `MetricsPanel.tsx`, IPC `get-agent-metrics`  
- **Действие:** агрегация записей `agentLogger` → таблица/графики в UI  
- **Проверка:** панель показывает статистику по завершённым прогонам

### 🔗 Далёкое будущее

**11 · L · Голосовой ввод и озвучка** — приор. Low  
- **Цель:** кнопка микрофона (Web Speech API / whisper.cpp); TTS последнего ответа  
- **Файлы:** `ChatInput.tsx`, `MessageBody.tsx`, опционально `whisperWorker.ts`  
- **Действие:** STT → текст в поле; TTS по кнопке «Озвучить»  
- **Проверка:** диктовка вставляет текст; TTS воспроизводит ответ

**12 · L · Встроенный редактор кода (Monaco/CodeMirror)** — приор. Low  
- **Цель:** ручная правка файла во встроенном просмотре вместо read-only highlight.js  
- **Файлы:** `app/src/components/` (новый редактор), интеграция в просмотр файла  
- **Действие:** подключить Monaco/CodeMirror, сохранение через существующий IPC записи файла  
- **Проверка:** правка файла в UI сохраняется на диск

**13 · XL · LSP в редакторе** — приор. Low  
- **Цель:** go-to-definition, hover, diagnostics для открытого файла во встроенном редакторе  
- **Файлы:** `app/electron/main/lspClient.ts`, интеграция с редактором (п. 16)  
- **Действие:** запуск typescript-language-server / pyright по типу файла  
- **Проверка:** Ctrl+click на символ → переход к определению

**14 · L · Skill marketplace** — приор. Low  
- **Цель:** каталог навыков из GitHub (`docs/collective/skills/` или отдельный репо); импорт одной кнопкой  
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`, IPC `import-remote-skill`  
- **Действие:** список remote skills + `git sparse-checkout` или raw fetch  
- **Проверка:** импорт skill из URL появляется локально

### ⚡ Идеи (декомпозиция по запросу)

---

## ✅ Сделано

- Vision-ввод (скриншоты в чат): Ctrl+V / drag-drop изображений → передача как image-блоков в Claude, OpenAI и Gemini через `userImages` параметр в IPC-цепочке; data URL не встраивается в текст, хранится в `message.images`
- Разбивка регистрации IPC: 1034-строчный index.ts разнесён на 9 файлов-регистраторов в ipc/ (registerAgentIpc, registerChatsIpc, registerFileIpc, registerMemoryIpc, registerModelsIpc, registerSettingsIpc, registerGithubIpc, registerMiscIpc, registerAppIpc) + IpcContext; index.ts — только инициализация окна и жизненный цикл app
- Разбивка SettingsModal.tsx: 2855-строчный монолит разнесён на `SettingsModal/index.tsx` + 6 вкладок (`ModelTab`, `BehaviorTab`, `PerformanceTab`, `MemoryTab`, `IntegrationsTab`, `PluginsTab`) + `shared.tsx`
**Коллективная память**
- Mutex при push: `async-mutex` сериализует merge+push; retry при конфликте с remote; unit-тест concurrent flush
- Семантический dedup: cosine similarity > 0.95 через embedding queue; дубли не попадают в collective memory

**Технический долг**
- ChatPanel: монолит разбит на `ChatPanel/` (`index.tsx`, `ChatMessages`, `ChatInput`, `ChatStatusBar`, `ChatInputMeta`, `MessageRow`, `helpers`)

**Архитектура**
- Разбивка agentTools.ts на модули: `core.ts` (файловые/git/package), `integrations.ts` (GitHub/GitLab/Jira/Linear/Web/Memory/Skills/Todo), `mcp.ts` (CodeViper/Ollama/индексация/субагенты), `index.ts` (сборка + ToolArgs + ToolHandlers + getAgentTools)
- Claude и Gemini → StreamingChatProvider: единый 429-backoff через `resolveRetryDelayMs`; убрана ручная retry-петля Gemini; Claude переведён с SDK на raw HTTP; 16 новых тестов провайдеров

**UX**
- Экспорт трейса агента: кнопка «Экспортировать» в TracePanel → `.codeviper/traces/<timestamp>.json` в папке проекта
- Cherry-pick hunks в DiffPreviewModal: `parseDiffHunks` + `applySelectedHunks` в `shared/diffPreview.ts`; чекбоксы ханков в `DiffPreviewModal`; кнопка «Применить выбранное»; IPC `AGENT_PREVIEW_HUNK_SELECTION`; `hunkSelectionFn` в `ToolExecutor`

**Надёжность агентного цикла**
- Fallback на Ollama при circuit open: `pingOllama()` при `CircuitBreakerOpenError`; событие `ollama_fallback_offer` → диалог в App.tsx → переключение `modelProvider: 'ollama'`
- Per-step таймаут: `AGENT_STEP_TIMEOUT_MS = 120_000`; `Promise.race([ctx.chat(...), stepTimeout])` — зависший LLM-запрос прерывается с понятным сообщением
- Логирование ошибок субагентов: `catch (err)` → `console.error` + `error` в emit для оркестратора и explorer; поле `error?` в `AgentStreamPayload`

**Безопасность**
- encryptApiKey fallback: при ошибке шифрования возвращает `''` + `console.error` вместо plaintext; unit-тест с mock `safeStorage.encryptString throws`
- validateCommand нормализация: `normalizeCommand()` декодирует `\xNN`/`\uNNNN`/`%NN` перед блок-листом; `safeCreateFile` использует флаг `fileExists` + errno вместо string-сравнения; unit-тесты hex/unicode/url-обфускации

**CI и качество**
- E2E на Linux/macOS: матрица `ubuntu-latest`/`macos-latest`, отдельный job `e2e`; `--no-sandbox` на Linux; `CODEVIPER_E2E=1` пропускает git-sync
- Авто-цикл «тесты → почини»: `run_tests` — авто-определение runner, парсинг падений, агент сам переиспользует инструмент
- Песочница `run_script`: Docker `--network none --memory 512m`, fallback на локальный запуск
- Счётчик стоимости облачных запросов: `MODEL_PRICING`, `estimatedCostUsd`, чип `~$X.XXX` в AgentStatusBar

**Субагенты**
- Контракт субагента: `shared/subagent.ts`, `subagentRunner.ts`, 12 unit-тестов
- Explorer: автоматический запуск при сложной задаче, сводка в системный промпт, чип «Разведываю…»
- Editor: `delegate_to_editor`, до 20 шагов, защита от повторного делегирования, чип «Редактирую…»

**Обучение и знания**
- Рейтинг коллективных знаний: upvote/downvote в MemoryPanel; ≤ −2 → скрыть и не пушить
- Экспорт урока в навык: кнопка «🎓 Сохранить как навык» в меню ответа агента

**Каналы обновлений**
- `updateChannel: 'stable' | 'beta'`; тумблер «Beta-версии» в настройках

**P2P-вычисления** (`server/p2p/` — деплой VPS вручную; см. `docs/integrations.md`)
- Кредиты P2P в UI — `credits.ts` на сервере; `GET /credits/balance`; ±N при relay; IPC `get-p2p-credits`; чип в `AgentStatusBar`
- Маршрутизация задач на сервере — `router.ts`, `POST /tasks/route`; свободный онлайн-узел с моделью (мин. CPU), иначе `{ fallback: true }`; интеграционный тест с 2 mock-узлами
- TLS + шифрование промптов — HTTPS/WSS на сигнальном сервере (`TLS_KEY_PATH`/`TLS_CERT_PATH`); ECDH X25519 + AES-256-GCM (`app/shared/p2pCrypto.ts`); relay `/tasks/relay` и WSS `/nodes/ws` без plaintext в логах
- Лимит 3 входящих P2P-задач — `acquireP2pTaskSlot` / `releaseP2pTaskSlot`, очередь 60 с, сверх лимита → 503; `reserveIncomingP2pTask` в `runIncomingP2pTask`
- Пауза P2P при нагрузке — CPU&gt;15% или GPU&gt;20% → `tryAcceptIncomingP2pTask` / `runIncomingP2pTask`; пороги в `constants.ts`, unit-тесты с моком `systeminformation`
- Диалог согласия P2P — `P2PConsentModal.tsx`; показывается при первом включении тумблера; «Принимаю» → `p2pConsentGiven: true` + `shareCompute: true`; «Отказаться» оставляет тумблер выключенным
- REST API сигнального сервера (`server/p2p/`) — Fastify 5 + ioredis, TTL-реестр узлов, in-memory fallback
- Auth на сервере — email/bcrypt + JWT + GitHub OAuth, rate limit, middleware `requireAuth`
- Тумблер «Поделиться мощностью» — `p2pClient.ts`, IPC `register-p2p-node`, UI на вкладке «Интеграции»

**Оркестратор (node-llama-cpp)**
- `nodeLlama.ts` — обёртка node-llama-cpp v3, ленивый singleton, unit + интеграционные тесты
- `orchestratorModel.ts` — `analyze()` → `{plan, rephrased, isComplex}`, 10 unit-тестов
- Выбор и скачивание GGUF — IPC `select-gguf-file` / `download-gguf`, прогресс + отмена в UI
- UI секция «Оркестратор» — тумблер, `minMessageLength`, кнопка удалить модель
- Интеграция в AgentRunner — `analyze()` перед запуском, чип «Планирую…», план в системный промпт

**Коллективное обучение** (ветка `agent/self-improve`, `docs/collective/ViperMemory.md`, чип ☁️ в статус-баре)
- `AgentLearningPanel` — синхронизация pending-записей, кнопка «Создать PR», автообновление
- Collective ViperMemory + ViperSkills — pull при старте, фильтр дублей/коротких записей
- MemoryPanel — раздельные секции локальных и коллективных записей, бейдж 📚

**Установщик и самообновление**
- NSIS — клонирование репо при установке, `git pull` при обновлении, ярлыки, удаление исходников
- POSIX-лаунчер `CodeViper.sh` для Linux/macOS
- CI матрица windows/ubuntu/macos, публикация в GitHub Releases

**Инструменты агента**
- GitLab: `list_gitlab_mrs`, `create_gitlab_mr`, `get_gitlab_pipeline`
- Jira: `create_jira_issue` через REST API
- Linear: `create_linear_issue` через GraphQL API
- Панель выбора задачи из ROADMAP, slash-команды (/test, /commit, /review, /roadmap…)
- `disabledTools`, `commandBlocklist`, `commandAllowlist`, per-chat `projectPath`

**Качество и производительность**
- Nudge «используй RAG»: после пустого grep — system-hint вызвать `search_knowledge_base` (Qdrant `codeviper_project`)
- Символьный индекс: `find_symbol` / `find_references` — AST (TypeScript compiler) для ts/js, парсер для py; `path:line:col`
- SHA-256 верификация при pull Ollama
- Rebase при конфликте push в `selfCommit.ts`
- Автопроверка после саморедактирования (typecheck + test)
- Бенчмарк моделей (tok/s, latency, tool call)
- Автоиндексация проекта в Qdrant при открытии
- Маскирование секретов: `secretRedaction.ts` — логи, контекст провайдера, collective memory

**UI и настройки**
- Иконка в системном трее — `tray.ts`, сворачивание в трей при закрытии окна, tooltip при работе агента
- Прогресс автообновления — `UpdateBanner`: %, объём, скорость, ETA; надёжный `quitAndInstall` на Windows
- Уведомление «агент закончил»: системный toast + звук при `soundNotifications`; фаза `idle` после busy
- Side-by-side diff: `DiffPreviewModal` — переключатель unified / side-by-side, подсветка синтаксиса в `preview_edit`
- Дерево файлов проекта: `ProjectTreePanel` — IPC `get-project-tree`, клик открывает файл, ПКМ «Спросить агента» вставляет `@path`
- @-упоминание файлов в поле ввода чата (`ChatInput`, `FileMentionPopover`, IPC `get-project-tree`)
- Webhook «агент готов», режим инкогнито, редактор правил проекта `.codeviper/rules.md`
- Чеклист плана самоулучшения (`SelfImprovePlanPanel`)

**Ядро**
- Провайдеры: Claude, Gemini, Groq, Together AI, OpenRouter; TRON-сжатие; RAG Qdrant/Milvus
- Prompt caching Claude: system + tools через `cache_control: ephemeral` в `claudeProvider.ts`
- Чекпоинт прогона: `git stash create` перед mutating tools, кнопка «Откатить всё» в чате
- Плагины: `~/.codeviper/plugins/`, esbuild + worker_thread изоляция
- Рефакторинг агента на 6 модулей; параллельное выполнение инструментов; LRU-кэши

**UI и настройки**
- Шаблоны чатов: 3 шаблона (Рефакторинг, Новый модуль, Code review), кнопка «▾» в ChatHistoryPanel
- Авто-PR collective: тумблер «Авто-PR после sync»; после push → `createCodeViperPr()`; «уже существует» не ошибка

**Рефакторинг**
- Разбивка agentHandlersProject.ts: файловые → `agentHandlersProjectFile.ts`, поисковые → `agentHandlersProjectSearch.ts`, терминальные → `agentHandlersProjectTerminal.ts`; общий контекст в `agentHandlersProjectContext.ts`; IPC-контракт не изменился

**Документация**
- CONTRIBUTING.md: диаграмма ReAct (mermaid), таблица ключевых модулей, пошаговый гайд добавления инструмента
- Шаблоны GitHub Issues (баг, идея, вопрос, docs) и Pull Request (feature, bugfix, self-improvement)
- TypeDoc + GitHub Pages — `npm run docs`, workflow `.github/workflows/docs.yml`
- README «Примеры запросов» — 7 готовых диалогов; GIF в `docs/media/`
