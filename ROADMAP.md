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

**Правила:** нумерация сквозная (1…16); внутри цепочки — строго по порядку; один пункт = один прогон самоулучшения; после проверки — `complete_self_improvement_item`.

## 📋 В планах

> Нумерация сквозная **1…16**. Сложность: S / M / L / XL. Приоритет указан в конце пункта. Пустые категории без пунктов не держим — выполненные цепочки (P2P, базовое коллективное обучение) см. в «✅ Сделано».

### ⚡ Независимые задачи

**1 · M · Docker dev-окружение** — приор. Low  
- **Цель:** Dockerfile Node 20 + Ollama; compose с hot reload  
- **Файлы:** `Dockerfile`, `docker-compose.yml`, `README.md`  
- **Действие:** образ + том исходников + `npm run dev`  
- **Проверка:** `docker compose up` поднимает приложение

### 🔗 Далёкое будущее

**2 · L · Голосовой ввод и озвучка** — приор. Low  
- **Цель:** кнопка микрофона (Web Speech API / whisper.cpp); TTS последнего ответа  
- **Файлы:** `ChatInput.tsx`, `MessageBody.tsx`, опционально `whisperWorker.ts`  
- **Действие:** STT → текст в поле; TTS по кнопке «Озвучить»  
- **Проверка:** диктовка вставляет текст; TTS воспроизводит ответ

**3 · XL · LSP в редакторе** — приор. Low  
- **Цель:** go-to-definition, hover, diagnostics для открытого файла в встроенном просмотре  
- **Файлы:** `app/electron/main/lspClient.ts`, Monaco или CodeMirror интеграция  
- **Действие:** запуск typescript-language-server / pyright по типу файла  
- **Проверка:** Ctrl+click на символ → переход к определению

**4 · L · Skill marketplace** — приор. Low  
- **Цель:** каталог навыков из GitHub (`docs/collective/skills/` или отдельный репо); импорт одной кнопкой  
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`, IPC `import-remote-skill`  
- **Действие:** список remote skills + `git sparse-checkout` или raw fetch  
- **Проверка:** импорт skill из URL появляется локально

### 🔗 Безопасность

**5 · S · Безопасный fallback в encryptApiKey** — приор. High
- **Цель:** при ошибке шифрования API-ключ не попадает в настройки в открытом виде
- **Файлы:** `app/electron/main/settings.ts`
- **Действие:** в catch-блоке `encryptApiKey()` вернуть пустую строку и залогировать критическую ошибку вместо `return plaintext`
- **Проверка:** `npm run typecheck`; unit-тест: mock `safeStorage.encryptString` throws → результат `''`, в лог попадает `ERROR`

**6 · S · Усиление validateCommand против обфускации** — приор. High
- **Цель:** fallback на `.includes()` при сбое RegExp не пропускает закодированные команды
- **Файлы:** `app/electron/main/services.ts`
- **Действие:** нормализовать строку (unescape hex/unicode) перед обеими проверками; сравнивать `errno` вместо текста ошибки в `safeCreateFile()`
- **Проверка:** `npm run typecheck`; unit-тест: `validateCommand('rm\\x20-rf /')` возвращает `null`

### 🔗 Надёжность агентного цикла

**7 · S · Логирование ошибок в catch-блоках агента** — приор. High
- **Цель:** ошибки оркестратора и explorer-субагента не теряются молча
- **Файлы:** `app/electron/main/agent.ts`
- **Действие:** в оба catch-блока (строки ~207 и ~251) добавить `console.error` с текстом ошибки и emit события с полем `error` для отображения в UI
- **Проверка:** `npm run typecheck`; в dev-режиме искусственно бросить ошибку → сообщение видно в консоли и в трейсе

**8 · M · Per-step таймаут в агентном цикле** — приор. High
- **Цель:** зависший LLM-запрос не блокирует агента вечно; пользователь видит сообщение об истечении шага
- **Файлы:** `app/electron/main/agent.ts`, `app/shared/constants.ts`
- **Действие:** добавить константу `AGENT_STEP_TIMEOUT_MS = 120_000`; обернуть каждый шаг LLM-цикла в `Promise.race([step(), timeout()])` с понятным сообщением об ошибке
- **Проверка:** `npm run typecheck`; mock провайдера с задержкой > 120 с → агент завершается с ошибкой таймаута через ~120 с

### 🔗 UX / Управление изменениями

**9 · M · Fallback на Ollama при circuit open** — приор. High
- **Цель:** если облачный провайдер недоступен (circuit breaker open), агент предлагает переключиться на локальную Ollama вместо остановки
- **Файлы:** `app/electron/main/modelRuntime.ts`, `app/electron/main/agent.ts`
- **Действие:** при `CircuitBreakerOpenError` проверить доступность Ollama (`ping()`), если успешно — emit событие с предложением переключиться и ждать ответа пользователя через IPC
- **Проверка:** mock circuit open + Ollama ping OK → в UI появляется предложение fallback

**10 · M · Cherry-pick hunks в DiffPreviewModal** — приор. Medium
- **Цель:** перед применением правок пользователь может выбрать отдельные куски diff (как `git add -p`)
- **Файлы:** `app/src/components/DiffPreviewModal.tsx`, IPC `apply-partial-diff`
- **Действие:** разбить diff на hunks; добавить чекбокс на каждый; кнопка «Применить выбранное» отправляет только отмеченные hunks
- **Проверка:** в UI открыть DiffPreviewModal, снять чекбокс с одного hunk → он не применяется

### ⚡ Независимые задачи (из анализа кода)

**11 · M · Семантический dedup в коллективной памяти** — приор. Medium
- **Цель:** дубликаты в collective memory определяются по смыслу (cosine similarity), а не точному тексту
- **Файлы:** `app/electron/main/collectiveMemorySync.ts`, `app/electron/main/embeddingQueue.ts`
- **Действие:** при добавлении записи проверять cosine similarity с существующими через уже имеющуюся embedding queue; если > 0.95 — пропускать как дубль
- **Проверка:** `npm run typecheck`; unit-тест: две семантически близкие записи → в память попадает одна

**12 · S · Mutex при синхронизации коллективной памяти** — приор. Medium
- **Цель:** два параллельных push в GitHub не затирают друг друга
- **Файлы:** `app/electron/main/collectiveMemorySync.ts`
- **Действие:** добавить async-mutex (или `AsyncLock`) вокруг операции push; повторная попытка при конфликте merge
- **Проверка:** `npm run typecheck`; unit-тест: два concurrent push → оба результата сохранены

**13 · S · Экспорт трейса агента в JSON** — приор. Low
- **Цель:** трейс выполнения можно сохранить на диск для post-mortem анализа
- **Файлы:** `app/src/components/TracePanel.tsx`, `app/electron/main/index.ts`, новый IPC `export-trace`
- **Действие:** кнопка «Экспортировать» в TracePanel → IPC с данными трейса → запись в `<projectPath>/.codeviper/traces/<timestamp>.json`
- **Проверка:** нажать кнопку → файл появляется в папке проекта с полным содержимым трейса

### 🔗 Технический долг

**14 · L · Разбить agentTools.ts на модули** — приор. Low
- **Цель:** файл 61 KB с 60+ инструментами разделён на читаемые модули; новые инструменты легче добавлять
- **Файлы:** `app/electron/main/agentTools.ts` → `agentTools/core.ts`, `agentTools/integrations.ts`, `agentTools/mcp.ts`, `agentTools/index.ts`
- **Действие:** split по группам (fs/shell, git/github, memory/skills, mcp); реэкспорт из `index.ts`; все импорты `agentTools` обновить
- **Проверка:** `npm run typecheck && npm run build`; `npm test`

**15 · L · Разбить ChatPanel.tsx на подкомпоненты** — приор. Low
- **Цель:** файл 70 KB разделён; каждый компонент < 300 строк; легче тестировать и дополнять
- **Файлы:** `app/src/components/ChatPanel.tsx` → `ChatPanel/`, `ChatPanel/ChatMessages.tsx`, `ChatPanel/ChatInput.tsx`, `ChatPanel/ChatStatusBar.tsx`
- **Действие:** выделить по визуальным зонам; сохранить все пропсы и контексты без изменения поведения
- **Проверка:** `npm run typecheck && npm run build`; приложение запускается, UI не сломан

### ⚡ Идеи (декомпозиция по запросу)

---

## ✅ Сделано

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

**Документация**
- CONTRIBUTING.md: диаграмма ReAct (mermaid), таблица ключевых модулей, пошаговый гайд добавления инструмента
- Шаблоны GitHub Issues (баг, идея, вопрос, docs) и Pull Request (feature, bugfix, self-improvement)
- TypeDoc + GitHub Pages — `npm run docs`, workflow `.github/workflows/docs.yml`
- README «Примеры запросов» — 7 готовых диалогов; GIF в `docs/media/`
