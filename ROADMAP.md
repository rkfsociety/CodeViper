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

**Правила:** нумерация сквозная (1…7); внутри цепочки — строго по порядку; один пункт = один прогон самоулучшения; после проверки — `complete_self_improvement_item`.

## 📋 В планах

> Нумерация сквозная **1…7**. Сложность: S / M / L / XL. Приоритет указан в конце пункта. Пустые категории без пунктов не держим — выполненные цепочки (P2P, базовое коллективное обучение) см. в «✅ Сделано».

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

### ⚡ Независимые задачи (из анализа кода)

**5 · M · Семантический dedup в коллективной памяти** — приор. Medium
- **Цель:** дубликаты в collective memory определяются по смыслу (cosine similarity), а не точному тексту
- **Файлы:** `app/electron/main/collectiveMemorySync.ts`, `app/electron/main/embeddingQueue.ts`
- **Действие:** при добавлении записи проверять cosine similarity с существующими через уже имеющуюся embedding queue; если > 0.95 — пропускать как дубль
- **Проверка:** `npm run typecheck`; unit-тест: две семантически близкие записи → в память попадает одна

**6 · S · Mutex при синхронизации коллективной памяти** — приор. Medium
- **Цель:** два параллельных push в GitHub не затирают друг друга
- **Файлы:** `app/electron/main/collectiveMemorySync.ts`
- **Действие:** добавить async-mutex (или `AsyncLock`) вокруг операции push; повторная попытка при конфликте merge
- **Проверка:** `npm run typecheck`; unit-тест: два concurrent push → оба результата сохранены

**7 · S · Экспорт трейса агента в JSON** — приор. Low
- **Цель:** трейс выполнения можно сохранить на диск для post-mortem анализа
- **Файлы:** `app/src/components/TracePanel.tsx`, `app/electron/main/index.ts`, новый IPC `export-trace`
- **Действие:** кнопка «Экспортировать» в TracePanel → IPC с данными трейса → запись в `<projectPath>/.codeviper/traces/<timestamp>.json`
- **Проверка:** нажать кнопку → файл появляется в папке проекта с полным содержимым трейса

### ⚡ Идеи (декомпозиция по запросу)

---

## ✅ Сделано

**Технический долг**
- ChatPanel: монолит разбит на `ChatPanel/` (`index.tsx`, `ChatMessages`, `ChatInput`, `ChatStatusBar`, `ChatInputMeta`, `MessageRow`, `helpers`)

**Архитектура**
- Разбивка agentTools.ts на модули: `core.ts` (файловые/git/package), `integrations.ts` (GitHub/GitLab/Jira/Linear/Web/Memory/Skills/Todo), `mcp.ts` (CodeViper/Ollama/индексация/субагенты), `index.ts` (сборка + ToolArgs + ToolHandlers + getAgentTools)

**UX**
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

**Документация**
- CONTRIBUTING.md: диаграмма ReAct (mermaid), таблица ключевых модулей, пошаговый гайд добавления инструмента
- Шаблоны GitHub Issues (баг, идея, вопрос, docs) и Pull Request (feature, bugfix, self-improvement)
- TypeDoc + GitHub Pages — `npm run docs`, workflow `.github/workflows/docs.yml`
- README «Примеры запросов» — 7 готовых диалогов; GIF в `docs/media/`
