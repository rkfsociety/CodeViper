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

**Правила:** нумерация сквозная (1…34); внутри цепочки — строго по порядку; один пункт = один прогон самоулучшения; после проверки — `complete_self_improvement_item`.

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

### 🔗 Высокая отдача

> Найдено в коде, отсутствовало в ROADMAP. Максимальный эффект при минимальных усилиях.

**12 · M · Чекпоинт прогона и «Откатить всё»** — приор. High  
- **Цель:** снимок состояния проекта перед mutating-инструментами; одна кнопка отката всех правок прогона  
- **Файлы:** `app/electron/main/runCheckpoint.ts` (новый), `agent.ts`, `app/src/components/RunRollbackButton.tsx`, `selfCommit.ts` (референс stash)  
- **Действие:** `git stash create` или копия файлов перед первым mutating tool; IPC `rollback-run`; кнопка в UI чата  
- **Проверка:** агент правит 3 файла → «Откатить» восстанавливает исходное состояние

**13 · M · Маскирование секретов в логах и контексте** — приор. High  
- **Цель:** API-ключи и значения `.env` не попадают в логи, облачный контекст и collective memory  
- **Файлы:** `app/shared/secretRedaction.ts` (новый), `agentLogger.ts`, `agentContext.ts`, `collectiveMemorySync.ts`  
- **Действие:** слой redact по паттернам (`sk-…`, `ghp_…`, AWS keys, `.env` KEY=value) перед логированием и отправкой провайдеру  
- **Проверка:** unit-тест: строка с `sk-test` → `***REDACTED***` в логе и в messages для модели

**14 · M · @-упоминание файлов в поле ввода** — приор. High  
- **Цель:** автодополнение путей при вводе `@` в ChatInput (как в Cursor / Claude Code)  
- **Файлы:** `app/src/components/ChatInput.tsx`, `app/src/components/FileMentionPopover.tsx` (новый), IPC обёртка над `buildFileTree`  
- **Действие:** popup со списком файлов при `@`; фильтр по префиксу; вставка `@relative/path` в текст  
- **Проверка:** `@src` показывает совпадения; выбор вставляет путь; агент получает путь в user message

### 🔗 RAG и контекст

**15 · S · Nudge «используй RAG»** — приор. Medium  
- **Цель:** если grep пустой, RAG включён и проект проиндексирован — подсказка агенту вызвать `search_knowledge_base`  
- **Файлы:** `app/electron/main/agent.ts`, `agentContext.ts`  
- **Действие:** эвристика после пустого grep; system-hint в следующей итерации  
- **Проверка:** тест с моком пустого grep + включённым RAG

**16 · L · Символьный индекс (find_symbol)** — приор. High  
- **Цель:** инструменты `find_symbol` и `find_references` по tree-sitter или LSP  
- **Файлы:** `app/electron/main/symbolIndex.ts` (новый), `agentTools.ts`, `agentHandlersProject.ts`  
- **Действие:** парсинг AST для ts/js/py; возврат path:line:col  
- **Проверка:** `find_symbol` находит объявление известной функции в тестовом файле

### 🔗 UX и продуктивность

**17 · M · Дерево файлов проекта** — приор. High  
- **Цель:** панель слева с деревом; клик открывает файл; ПКМ → «Спросить агента»  
- **Файлы:** `app/src/components/ProjectTreePanel.tsx`, `services.ts` (`buildFileTree`), `App.tsx`  
- **Действие:** IPC `get-project-tree`; контекстное меню с вставкой пути в чат  
- **Проверка:** дерево совпадает с `list_directory`; ПКМ вставляет `@path`

**18 · M · Side-by-side diff** — приор. Medium  
- **Цель:** `preview_edit` показывает два столбца (было / стало), не только unified  
- **Файлы:** `app/src/components/DiffPreviewModal.tsx`, стили diff  
- **Действие:** переключатель unified / side-by-side; подсветка синтаксиса  
- **Проверка:** визуально два столбца при preview правки

**19 · S · Уведомление «агент закончил»** — приор. Medium  
- **Цель:** системный toast + звук (если включены уведомления) при завершении прогона  
- **Файлы:** `app/electron/main/index.ts` (`Notification`), `useAgentStream.ts`, `settings.ts`  
- **Действие:** `new Notification` при phase `idle` после `busy`; уважать `soundEnabled`  
- **Проверка:** фоновый чат → toast при готовности ответа

**20 · M · Шаблоны чатов** — приор. Medium  
- **Цель:** пресеты «Рефакторинг», «Новый модуль», «Code review» — стартовый промпт + preset tools  
- **Файлы:** `app/shared/chatTemplates.ts`, `ChatHistoryPanel.tsx`, `settings.ts`  
- **Действие:** создание чата из шаблона; опционально `disabledTools` preset  
- **Проверка:** новый чат из шаблона содержит системное сообщение-инструкцию

### 🔗 Коллективное обучение — продолжение

**21 · M · Авто-PR collective** — приор. Medium  
- **Цель:** после успешного push collective — опционально `create_codeviper_pr` без ручной кнопки  
- **Файлы:** `collectiveMemorySync.ts`, `settings.ts` (`autoCollectivePr`)  
- **Действие:** вызов PR-логики после push; дедуп «PR уже открыт»  
- **Проверка:** при включённой опции после sync создаётся PR или сообщение «уже есть»

**22 · M · Рейтинг знаний collective** — приор. Low  
- **Цель:** upvote/downvote в MemoryPanel для коллективных записей; фильтр push по рейтингу  
- **Файлы:** `MemoryPanel.tsx`, `docs/collective/ViperMemory.md` (метаданные), `collectiveMemorySync.ts`  
- **Действие:** голосование локально + sync score в markdown frontmatter  
- **Проверка:** downvote скрывает или понижает приоритет записи в UI

**23 · S · Экспорт урока в skill** — приор. Medium  
- **Цель:** кнопка «Сохранить как навык» у удачного ответа агента → `create_skill`  
- **Файлы:** `MessageBody.tsx`, IPC обёртка над `skills.ts`  
- **Действие:** диалог имени skill; тело из выбранных сообщений  
- **Проверка:** skill появляется в `list_skills`

### 🔗 Subagents

**24 · M · Контракт subagent** — приор. Medium  
- **Цель:** тип `SubagentRole` (explorer | editor), лимит инструментов, отдельный мини-прогон  
- **Файлы:** `app/electron/main/subagentRunner.ts` (новый), `shared/subagent.ts`  
- **Действие:** интерфейс запуска с урезанным tool set и max steps  
- **Проверка:** `npm run typecheck`; unit-тест с мок-провайдером

**25 · L · Explorer subagent** — приор. Medium  
- **Цель:** read-only субагент (grep, read, list) для разведки перед основным прогоном  
- **Файлы:** `subagentRunner.ts`, `agent.ts`  
- **Действие:** `spawn_explorer` при сложном запросе; сводка в системный промпт  
- **Проверка:** сложный запрос → сначала explorer, затем edit с контекстом сводки

**26 · L · Editor subagent в цикле** — приор. Low  
- **Цель:** субагент с mutating tools выполняет план, основной агент только координирует  
- **Файлы:** `agent.ts`, `subagentRunner.ts`  
- **Действие:** делегирование шагов плана editor-роли  
- **Проверка:** E2E: «найди и исправь» — explorer + editor без зацикливания

### 🔗 Модели и обновления

**27 · S · Каналы обновлений stable/beta** — приор. Low  
- **Цель:** настройка канала: stable (latest release) / beta (pre-release) в `electron-updater`  
- **Файлы:** `updateChecker.ts`, `settings.ts`, `SettingsModal.tsx`  
- **Действие:** `allowPrerelease` по настройке; фильтр тегов GitHub  
- **Проверка:** beta находит pre-release; stable — только релизы

### 🔗 Интеграции и изоляция

**28 · L · Песочница для run_script** — приор. Medium  
- **Цель:** опциональный запуск скриптов в Docker-контейнере с mount только `projectPath`  
- **Файлы:** `app/electron/main/scriptSandbox.ts`, `agentHandlersProject.ts`, `settings.ts`  
- **Действие:** `docker run --rm -v projectPath` для python/bash; fallback на локальный run  
- **Проверка:** скрипт не может писать вне projectPath в sandbox-режиме

### 🔗 Далёкое будущее

**29 · L · Голосовой ввод и озвучка** — приор. Low  
- **Цель:** кнопка микрофона (Web Speech API / whisper.cpp); TTS последнего ответа  
- **Файлы:** `ChatInput.tsx`, `MessageBody.tsx`, опционально `whisperWorker.ts`  
- **Действие:** STT → текст в поле; TTS по кнопке «Озвучить»  
- **Проверка:** диктовка вставляет текст; TTS воспроизводит ответ

**30 · XL · LSP в редакторе** — приор. Low  
- **Цель:** go-to-definition, hover, diagnostics для открытого файла в встроенном просмотре  
- **Файлы:** `app/electron/main/lspClient.ts`, Monaco или CodeMirror интеграция  
- **Действие:** запуск typescript-language-server / pyright по типу файла  
- **Проверка:** Ctrl+click на символ → переход к определению

**31 · L · Skill marketplace** — приор. Low  
- **Цель:** каталог навыков из GitHub (`docs/collective/skills/` или отдельный репо); импорт одной кнопкой  
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`, IPC `import-remote-skill`  
- **Действие:** список remote skills + `git sparse-checkout` или raw fetch  
- **Проверка:** импорт skill из URL появляется локально

**32 · M · E2E на Linux/macOS в CI** — приор. Medium  
- **Цель:** Playwright+Electron в матрице ubuntu/macos для smoke-тестов UI  
- **Файлы:** `.github/workflows/ci.yml`, `app/tests/e2e/`  
- **Действие:** job `test:e2e` на linux/macos (headless); фикс путей POSIX  
- **Проверка:** CI green на трёх ОС для e2e smoke

### ⚡ Идеи (декомпозиция по запросу)

**33 · L · Авто-цикл «тесты → почини»** — приор. Medium  
- **Цель:** для проектов пользователя — `run_tests` → парс падений → итерация правок (сейчас автопроверка только после self-edit)  
- **Файлы:** `app/electron/main/agentTools.ts`, `agentHandlersProject.ts`, `agent.ts`  
- **Действие:** инструмент `run_tests`; эвристика повторного прогона при failed tests  
- **Проверка:** сломанный unit-тест → агент чинит и перезапускает до green

**34 · M · Счётчик стоимости облачных запросов** — приор. Medium  
- **Цель:** отображение $ и токенов по провайдеру в UI (сейчас `generationMetrics` считает tok/s, но не стоимость)  
- **Файлы:** `app/electron/main/generationMetrics.ts`, `app/src/components/AgentStatusBar.tsx`, `shared/constants.ts` (тарифы)  
- **Действие:** накопление input/output/cache tokens × тариф модели; чип в статус-баре  
- **Проверка:** после облачного прогона в UI видна оценка стоимости сессии

---

## ✅ Сделано

**P2P-вычисления**
- REST API сигнального сервера (`server/p2p/`) — Fastify 5 + ioredis, TTL-реестр узлов, in-memory fallback
- Auth на сервере — email/bcrypt + JWT + GitHub OAuth, rate limit, middleware `requireAuth`
- Тумблер «Поделиться мощностью» — `p2pClient.ts`, IPC `register-p2p-node`, UI на вкладке «Интеграции»

**Оркестратор (node-llama-cpp)**
- `nodeLlama.ts` — обёртка node-llama-cpp v3, ленивый singleton, unit + интеграционные тесты
- `orchestratorModel.ts` — `analyze()` → `{plan, rephrased, isComplex}`, 10 unit-тестов
- Выбор и скачивание GGUF — IPC `select-gguf-file` / `download-gguf`, прогресс + отмена в UI
- UI секция «Оркестратор» — тумблер, `minMessageLength`, кнопка удалить модель
- Интеграция в AgentRunner — `analyze()` перед запуском, чип «Планирую…», план в системный промпт

**Коллективное обучение**
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
- SHA-256 верификация при pull Ollama
- Rebase при конфликте push в `selfCommit.ts`
- Автопроверка после саморедактирования (typecheck + test)
- Бенчмарк моделей (tok/s, latency, tool call)
- Автоиндексация проекта в Qdrant при открытии

**UI и настройки**
- FileTimelinePanel, ChatHistoryPanel, поиск по настройкам, горячие клавиши, виртуализация
- Webhook «агент готов», режим инкогнито, редактор правил проекта `.codeviper/rules.md`
- Чеклист плана самоулучшения (`SelfImprovePlanPanel`)

**Ядро**
- Провайдеры: Claude, Gemini, Groq, Together AI, OpenRouter; TRON-сжатие; RAG Qdrant/Milvus
- Prompt caching Claude: system + tools через `cache_control: ephemeral` в `claudeProvider.ts`
- Плагины: `~/.codeviper/plugins/`, esbuild + worker_thread изоляция
- Рефакторинг агента на 6 модулей; параллельное выполнение инструментов; LRU-кэши
