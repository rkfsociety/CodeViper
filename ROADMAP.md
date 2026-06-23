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

**Правила:** нумерация сквозная (1…69); внутри цепочки — строго по порядку; один пункт = один прогон самоулучшения; после проверки — `complete_self_improvement_item`.

## 📋 В планах

> Нумерация сквозная. Сложность: S / M / L / XL. Приоритет указан в конце пункта.

### 🔗 P2P-вычисления

> Пункты 9–10 — код сервера в репозитории (`server/p2p/`); деплой VPS — вручную пользователем.

**1 · S · Диалог согласия P2P** — приор. Low  
- **Цель:** модалка при первом включении: что передаётся, лимиты, отказ блокирует режим  
- **Файлы:** `app/src/components/P2PConsentModal.tsx` (новый), `SettingsModal.tsx`  
- **Действие:** показ один раз, флаг в settings  
- **Проверка:** без согласия тумблер не активен

**2 · M · Пауза P2P при нагрузке** — приор. Low  
- **Цель:** GPU>20% или CPU>15% → входящие P2P-задачи в паузу  
- **Файлы:** `app/electron/main/agent.ts`, `p2pClient.ts`, `systemStats.ts`  
- **Действие:** проверка перед приёмом задачи  
- **Проверка:** unit-тест с моком systeminformation

**3 · M · Лимит 3 входящих P2P-задач** — приор. Low  
- **Цель:** очередь с таймаутом 60 с, сверх лимита → 503  
- **Файлы:** `app/electron/main/p2pClient.ts`  
- **Действие:** счётчик активных + очередь  
- **Проверка:** тест на отклонение 4-й задачи

**4 · M · TLS + шифрование промптов** — приор. Low  
- **Цель:** WSS между узлами; ECDH для тела промпта  
- **Файлы:** `server/p2p/`, `app/electron/main/p2pClient.ts`  
- **Действие:** TLS certs; симметричный ключ сессии  
- **Проверка:** узел не читает чужой plaintext в логах

**5 · L · Маршрутизация задач на сервере** — приор. Low  
- **Цель:** поиск свободного узла с моделью; иначе `{ fallback: true }`  
- **Файлы:** `server/p2p/router.ts`  
- **Действие:** логика выбора узла  
- **Проверка:** интеграционный тест с 2 mock-узлами

**6 · L · Кредиты P2P в UI** — приор. Low  
- **Цель:** баланс кредитов на сервере, отображение в `AgentStatusBar`  
- **Файлы:** `server/p2p/credits.ts`, `AgentStatusBar.tsx`, `p2pClient.ts`  
- **Действие:** +N/−N за задачи; IPC статуса  
- **Проверка:** баланс обновляется после mock-задачи

### 🔗 Коллективное обучение и UI агента

> База в коде: ветка `agent/self-improve`, `docs/collective/ViperMemory.md`, чип ☁️.

### ⚡ Независимые задачи

**7 · M · Docker dev-окружение** — приор. Low  
- **Цель:** Dockerfile Node 20 + Ollama; compose с hot reload  
- **Файлы:** `Dockerfile`, `docker-compose.yml`, `README.md`  
- **Действие:** образ + том исходников + `npm run dev`  
- **Проверка:** `docker compose up` поднимает приложение

**8 · S · README «Примеры запросов»** — приор. Low  
- **Цель:** 5–7 готовых диалогов (поиск, правка, самоулучшение, веб)  
- **Файлы:** `README.md`  
- **Действие:** новый раздел с промптами  
- **Проверка:** ревью текста

**9 · M · Скринкасты для README** — приор. Low  
- **Цель:** GIF/видео: поиск, самоулучшение, Ollama  
- **Файлы:** `docs/media/` (новый), `README.md`  
- **Действие:** добавить assets + ссылки  
- **Проверка:** файлы в репозитории, README ссылается

**10 · M · CONTRIBUTING.md** — приор. Low  
- **Цель:** диаграмма ReAct, ключевые модули, пример нового инструмента  
- **Файлы:** `CONTRIBUTING.md`  
- **Действие:** mermaid sequence + пошаговый гайд  
- **Проверка:** ревью документа

**11 · M · typedoc + GitHub Pages** — приор. Low  
- **Цель:** `npm run docs` генерирует API из JSDoc; деплой в Actions  
- **Файлы:** `package.json`, `.github/workflows/docs.yml` (новый), `typedoc.json`  
- **Действие:** typedoc config + workflow  
- **Проверка:** `npm run docs` локально без ошибок

### 🔗 Агент и проверки

### 🔗 RAG и контекст

**12 · S · Nudge «используй RAG»** — приор. Medium  
- **Цель:** если grep пустой, RAG включён и проект проиндексирован — подсказка агенту вызвать `search_knowledge_base`  
- **Файлы:** `app/electron/main/agent.ts`, `agentContext.ts`  
- **Действие:** эвристика после пустого grep; system-hint в следующей итерации  
- **Проверка:** тест с моком пустого grep + включённым RAG

**13 · L · Символьный индекс (find_symbol)** — приор. Medium  
- **Цель:** инструменты `find_symbol` и `find_references` по tree-sitter или LSP  
- **Файлы:** `app/electron/main/symbolIndex.ts` (новый), `agentTools.ts`, `agentHandlersProject.ts`  
- **Действие:** парсинг AST для ts/js/py; возврат path:line:col  
- **Проверка:** `find_symbol` находит объявление известной функции в тестовом файле

### 🔗 UX и продуктивность

**14 · M · Дерево файлов проекта** — приор. High  
- **Цель:** панель слева с деревом; клик открывает файл; ПКМ → «Спросить агента»  
- **Файлы:** `app/src/components/ProjectTreePanel.tsx`, `services.ts` (`buildFileTree`), `App.tsx`  
- **Действие:** IPC `get-project-tree`; контекстное меню с вставкой пути в чат  
- **Проверка:** дерево совпадает с `list_directory`; ПКМ вставляет `@path`

**15 · M · Side-by-side diff** — приор. Medium  
- **Цель:** `preview_edit` показывает два столбца (было / стало), не только unified  
- **Файлы:** `app/src/components/DiffPreviewModal.tsx`, стили diff  
- **Действие:** переключатель unified / side-by-side; подсветка синтаксиса  
- **Проверка:** визуально два столбца при preview правки

**16 · S · Уведомление «агент закончил»** — приор. Medium  
- **Цель:** системный toast + звук (если включены уведомления) при завершении прогона  
- **Файлы:** `app/electron/main/index.ts` (`Notification`), `useAgentStream.ts`, `settings.ts`  
- **Действие:** `new Notification` при phase `idle` после `busy`; уважать `soundEnabled`  
- **Проверка:** фоновый чат → toast при готовности ответа

**17 · M · Шаблоны чатов** — приор. Medium  
- **Цель:** пресеты «Рефакторинг», «Новый модуль», «Code review» — стартовый промпт + preset tools  
- **Файлы:** `app/shared/chatTemplates.ts`, `ChatHistoryPanel.tsx`, `settings.ts`  
- **Действие:** создание чата из шаблона; опционально `disabledTools` preset  
- **Проверка:** новый чат из шаблона содержит системное сообщение-инструкцию

### 🔗 Коллективное обучение — продолжение

**18 · M · Авто-PR collective** — приор. Medium  
- **Цель:** после успешного push collective — опционально `create_codeviper_pr` без ручной кнопки  
- **Файлы:** `collectiveMemorySync.ts`, `settings.ts` (`autoCollectivePr`)  
- **Действие:** вызов PR-логики после push; дедуп «PR уже открыт»  
- **Проверка:** при включённой опции после sync создаётся PR или сообщение «уже есть»

**19 · M · Рейтинг знаний collective** — приор. Low  
- **Цель:** upvote/downvote в MemoryPanel для коллективных записей; фильтр push по рейтингу  
- **Файлы:** `MemoryPanel.tsx`, `docs/collective/ViperMemory.md` (метаданные), `collectiveMemorySync.ts`  
- **Действие:** голосование локально + sync score в markdown frontmatter  
- **Проверка:** downvote скрывает или понижает приоритет записи в UI

**20 · S · Экспорт урока в skill** — приор. Medium  
- **Цель:** кнопка «Сохранить как навык» у удачного ответа агента → `create_skill`  
- **Файлы:** `MessageBody.tsx`, IPC обёртка над `skills.ts`  
- **Действие:** диалог имени skill; тело из выбранных сообщений  
- **Проверка:** skill появляется в `list_skills`

### 🔗 Subagents

**21 · M · Контракт subagent** — приор. Medium  
- **Цель:** тип `SubagentRole` (explorer | editor), лимит инструментов, отдельный мини-прогон  
- **Файлы:** `app/electron/main/subagentRunner.ts` (новый), `shared/subagent.ts`  
- **Действие:** интерфейс запуска с урезанным tool set и max steps  
- **Проверка:** `npm run typecheck`; unit-тест с мок-провайдером

**22 · L · Explorer subagent** — приор. Medium  
- **Цель:** read-only субагент (grep, read, list) для разведки перед основным прогоном  
- **Файлы:** `subagentRunner.ts`, `agent.ts`  
- **Действие:** `spawn_explorer` при сложном запросе; сводка в системный промпт  
- **Проверка:** сложный запрос → сначала explorer, затем edit с контекстом сводки

**23 · L · Editor subagent в цикле** — приор. Low  
- **Цель:** субагент с mutating tools выполняет план, основной агент только координирует  
- **Файлы:** `agent.ts`, `subagentRunner.ts`  
- **Действие:** делегирование шагов плана editor-роли  
- **Проверка:** E2E: «найди и исправь» — explorer + editor без зацикливания

### 🔗 Модели и обновления

**24 · S · Каналы обновлений stable/beta** — приор. Low  
- **Цель:** настройка канала: stable (latest release) / beta (pre-release) в `electron-updater`  
- **Файлы:** `updateChecker.ts`, `settings.ts`, `SettingsModal.tsx`  
- **Действие:** `allowPrerelease` по настройке; фильтр тегов GitHub  
- **Проверка:** beta находит pre-release; stable — только релизы

### 🔗 Интеграции и изоляция

**25 · L · Песочница для run_script** — приор. Low  
- **Цель:** опциональный запуск скриптов в Docker-контейнере с mount только `projectPath`  
- **Файлы:** `app/electron/main/scriptSandbox.ts`, `agentHandlersProject.ts`, `settings.ts`  
- **Действие:** `docker run --rm -v projectPath` для python/bash; fallback на локальный run  
- **Проверка:** скрипт не может писать вне projectPath в sandbox-режиме

### 🔗 Далёкое будущее

**26 · L · Голосовой ввод и озвучка** — приор. Low  
- **Цель:** кнопка микрофона (Web Speech API / whisper.cpp); TTS последнего ответа  
- **Файлы:** `ChatInput.tsx`, `MessageBody.tsx`, опционально `whisperWorker.ts`  
- **Действие:** STT → текст в поле; TTS по кнопке «Озвучить»  
- **Проверка:** диктовка вставляет текст; TTS воспроизводит ответ

**27 · XL · LSP в редакторе** — приор. Low  
- **Цель:** go-to-definition, hover, diagnostics для открытого файла в встроенном просмотре  
- **Файлы:** `app/electron/main/lspClient.ts`, Monaco или CodeMirror интеграция  
- **Действие:** запуск typescript-language-server / pyright по типу файла  
- **Проверка:** Ctrl+click на символ → переход к определению

**28 · L · Skill marketplace** — приор. Low  
- **Цель:** каталог навыков из GitHub (`docs/collective/skills/` или отдельный репо); импорт одной кнопкой  
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`, IPC `import-remote-skill`  
- **Действие:** список remote skills + `git sparse-checkout` или raw fetch  
- **Проверка:** импорт skill из URL появляется локально

**29 · M · E2E на Linux/macOS в CI** — приор. Medium  
- **Цель:** Playwright+Electron в матрице ubuntu/macos для smoke-тестов UI  
- **Файлы:** `.github/workflows/ci.yml`, `app/tests/e2e/`  
- **Действие:** job `test:e2e` на linux/macos (headless); фикс путей POSIX  
- **Проверка:** CI green на трёх ОС для e2e smoke

---

## ✅ Сделано
- Тумблер «Поделиться мощностью»: `p2pClient.ts` (new) — `registerNode()` → `POST /nodes/register` с Bearer-токеном; Zod-поля `shareCompute/p2pServerUrl/p2pAuthToken` в `settings.ts` и `types.ts`; IPC `register-p2p-node`; UI-секция в вкладке «Интеграции» с тумблером, URL и токеном; typecheck ✅, build ✅.
- Auth на сигнальном сервере: `server/p2p/src/auth.ts` — `AuthManager` с email-регистрацией (bcryptjs), JWT (jsonwebtoken, 24h), GitHub OAuth; rate limit per-token per-minute (Redis INCR + TTL или in-memory); middleware `requireAuth`; защищены `/nodes/*`; `/health` публичный; проверка: без токена → 401, с токеном → 200 ✅.
- REST API сигнального сервера: `server/p2p/` — Fastify 5 + ioredis; `POST /nodes/register`, `GET /nodes/available?model=`, `DELETE /nodes/:id`, `GET /health`; in-memory fallback если Redis недоступен; автоистечение узлов по TTL (по умолчанию 120 с); typecheck ✅, проверка curl ✅.
- Интеграция оркестратора в AgentRunner: перед `prepareAgentRunContext` — `analyze()` при `orchestratorEnabled`; эмит `orchestrating: true/false`; чип «Планирую…» в `AgentStatusBar`; `rephrased` → `effectiveMessage` при `isComplex`; план инжектируется в `customSystemPrompt` как `## План оркестратора`.
- orchestratorModel.ts: `analyze(message, modelPath)` → `{plan, rephrased, isComplex}`; singleton через `nodeLlama`; `extractJsonString` + fallback; константы `ORCHESTRATOR_MAX_TOKENS/TEMPERATURE` в `shared/constants.ts`; 10 unit-тестов с моком nodeLlama.
- Выбор GGUF в настройках: IPC `select-gguf-file` с фильтром `*.gguf`; `orchestratorModelPath` в Zod-схеме и `AgentSettings`; кнопка «Выбрать файл…» + кнопка ✕ на вкладке «Модель» в SettingsModal.
- Тест nodeLlama: `app/tests/nodeLlama.test.ts` — 5 unit-тестов (без GGUF), 3 интеграционных (skip без `TEST_GGUF_PATH`); инструкция запуска в README раздел «Разработка и тесты».
- Обёртка nodeLlama.ts: модуль `app/electron/main/nodeLlama.ts` с `loadModel`, `complete`, `unloadModel`, `getHandle`; динамический импорт через переменную-строку (typecheck без установленного пакета); ленивая инициализация синглтона; node-llama-cpp v3 API (getLlama → loadModel → createContext → LlamaChatSession).
- Панель выбора ROADMAP: `roadmapParser.ts` парсит ROADMAP.md; IPC `list-roadmap-items`; `RoadmapPickerPanel` с фильтром и группировкой по цепочкам; кнопка 🗺 в панели чата; клик → промпт «Выполни пункт N…» в поле ввода.
- Slash-команды: `expandSlashCommand` в `shared/slashCommands.ts`; `SlashCommandMenu` с автодополнением; 8 команд (/test, /typecheck, /commit, /review, /fix, /explain, /refactor, /roadmap N); стрелки+Tab+Escape; раскрытие перед отправкой.
- Автоиндексация при открытии проекта: фоновый `runProjectAutoIndex` в Qdrant при смене `projectPath`; переключатель в настройках RAG; прогресс в AgentStatusBar.

- Чеклист плана самоулучшения: SelfImprovePlanPanel.tsx над полем ввода; подписка на `self_improve_plan` stream через `setPlanItemsRef`; прогресс-бар, иконки ○/✓/✗, blocked-пункты; сброс при смене чата
- Бенчмарк локальных моделей: modelBenchmark.ts; 3 текстовых прогона (tok/s, latency) + tool call тест; кнопка «Запустить бенчмарк» на вкладке Модель настроек; таблица результатов; только для Ollama-провайдера
- Webhook «агент готов»: webhookNotify.ts; POST { chatId, projectPath, summary, durationMs } после каждого прогона; поле webhookUrl в настройках; UI в разделе Уведомления; best-effort (ошибка не прерывает агента)
- UI правил проекта: кнопка 📋 в нижней панели чата открывает редактор `.codeviper/rules.md`; загрузка/сохранение через IPC read-file/write-file; подсказка при отсутствии файла; агент учитывает rules.md через memory.ts
- Автопроверка после правок: после успешного SELF_EDIT_FILE_TOOLS при включённом autoVerifyAfterEdit — запуск npm run typecheck + npm test через runCodeViperCommand; вывод добавляется к tool_result в чате
- SHA-256 при pull Ollama: `verifyOllamaModelDigest()` в `agentOllamaApi.ts` сравнивает digest из `/api/show` с последним завершённым digest из pull-стрима; при несовпадении — `deleteOllamaModel()` + ошибка; 5 тестов в `ollamaSha256.test.ts` (несовпадение, совпадение, нет поля digest, сеть недоступна, сообщение содержит оба хеша)
- Rebase при конфликте push: функция `pushWithRebaseOnConflict()` в selfCommit.ts перехватывает non-fast-forward ошибки; автоматически выполняет `git pull --rebase` и повторяет push; детектирует ошибки по ключевым словам (non-fast-forward, rejected, failed to push); используется в commitAndPushRepoPaths; тесты на определение конфликтов в collectiveMemorySync.test.ts
- Кнопка PR из панели коллективного обучения: IPC обработчик `create-codeviper-pr` в index.ts; AgentLearningPanel вызывает `window.codeviper.createCodeViperPr()` с заголовком «Коллективные знания»; обработка ошибок (уже существует, не git-репозиторий, gh не установлен); контракт в types.ts
- Collective ViperSkills: синхронизация коллективных навыков в `docs/collective/ViperSkills.md`; `readCollectiveSkills()` подгружает навыки из remote; `pullCollectiveSkillsFromRemote()` при старте если `gitSyncOnStartup`; коллективные навыки объединены с локальными в `list_skills`; добавлено поле `source: 'collective'` в AgentSkill для отслеживания источника
- Фильтр перед push collective: `filterEntriesBeforePush()` отклоняет пустые, короткие (<20 символов) и дублирующие записи; лог отклонённых в результат синхронизации; AgentLearningPanel показывает `rejectedCount` и `rejectionReasons` в UI; константа `MIN_COLLECTIVE_ENTRY_LENGTH` в constants.ts; тест на отклонение пустых строк
- MemoryPanel: локальные vs коллективные — две отдельные секции с разделением по `source: 'collective'`; бейдж 📚 для коллективных записей; обновлена `readCollectiveMemoryEntries()` в `collectiveMemorySync.ts` для отметки источника
- Pull collective при старте: `pullCollectiveMemoryFromRemote()` в `collectiveMemorySync.ts`; вызов при `gitSyncOnStartup` в `app.whenReady()`; fetch + `git checkout origin/{branch} -- docs/collective/ViperMemory.md`; best-effort (офлайн не ошибка)
- `AgentLearningPanel`: панель коллективного обучения — ветка, счётчик pending, кнопки «Синхронизировать» и «Создать PR»; IPC `get-collective-sync-status` и `flush-collective-memory`; кнопка ☁️ в тулбаре ChatPanel; автообновление каждые 10 с
- NSIS git clone: установщик клонирует репо в %APPDATA%CodeVipersource с флагом --depth 1; проверка git перед установкой; обновление через git pull --ff-only при повторной установке; ярлыки на Desktop и в Start Menu Programs запускают CodeViper.cmd через cmd.exe; опция удалить исходный код при дезинсталляции; обработка ошибок (нет git, нет интернета)
- create_linear_issue: инструмент для создания Issue в Linear через GraphQL API; поле linearApiKey в настройках с шифрованием; UI в разделе «Интеграции»; параметры: title, team_key, description, priority (0-4)
- create_jira_issue: инструмент для создания Issue в Jira через REST API; поля jiraUrl и jiraToken в настройках с шифрованием; UI в разделе «Интеграции»; параметры: summary, project_key, description, issue_type
- POSIX-лаунчер: CodeViper.sh для Linux/macOS; аналог CodeViper.cmd; проверка Node.js, хеш package-lock.json, автосборка; интеграция в CI workflow на ubuntu/macos
- `disabledTools`: чекбоксы по 11 группам инструментов в SettingsModal; getAgentTools() фильтрует отключённые; кэш по ключу
- `commandBlocklist`: пользовательские запрещённые паттерны команд; редактирование в SettingsModal; применяется в validateCommand()
- Per-chat `projectPath`, `search_in_project`, `read_multiple_files`, `run_script`, `review_code`
- GitLab интеграция: list_gitlab_mrs, create_gitlab_mr, get_gitlab_pipeline
- `.github/workflows/release.yml`: матрица windows/ubuntu/macos; публикация в GitHub Releases через GITHUB_TOKEN
- Провайдеры Claude, Gemini, Groq, Together AI, OpenRouter; TRON-сжатие; RAG Qdrant/Milvus; exponential backoff; circuit breaker
- Плагины: сканирование ~/.codeviper/plugins/*.js и *.ts; esbuild с кэшем; изоляция в worker_thread
- UI: FileTimelinePanel, ChatHistoryPanel, поиск по настройкам, горячие клавиши, виртуализация списка сообщений
- Ядро агента: рефакторинг на 6 модулей; параллельное выполнение инструментов; суммаризация; LRU-кэши; workers
- Режим инкогнито: тумблер в топбаре; чаты/NDJSON-логи только в RAM; skip persist в flushCurrentChat и agentLogger
- commandAllowlist (whitelist команд): поле в settings/types; validateCommand проверяет allowlist до blocklist; UI в SettingsModal; 5 тестов

- Скачивание GGUF по умолчанию: downloadDefaultGguf() в orchestratorModel.ts; fetch + AbortController + .part temp file; IPC DOWNLOAD_GGUF/CANCEL_GGUF_DOWNLOAD/GGUF_DOWNLOAD_PROGRESS; прогресс-бар и кнопка «Отмена» в SettingsModal; URL Qwen2.5-1.5B в constants.ts

- UI секция «Оркестратор»: тумблер orchestratorEnabled, поле orchestratorMinMessageLength (дефолт 80), кнопка «Удалить модель» (unlink + clear path); IPC DELETE_GGUF_FILE; все поля в Zod-схеме settings.ts и AgentSettingsSchema
