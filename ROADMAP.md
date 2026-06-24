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

### 🔗 UX и продуктивность

### 🔗 Коллективное обучение

### 🔗 Subagents

### 🔗 Модели и обновления

### 🔗 Интеграции и изоляция

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

**5 · M · E2E на Linux/macOS в CI** — приор. Medium  
- **Цель:** Playwright+Electron в матрице ubuntu/macos для smoke-тестов UI  
- **Файлы:** `.github/workflows/ci.yml`, `app/tests/e2e/`  
- **Действие:** job `test:e2e` на linux/macos (headless); фикс путей POSIX  
- **Проверка:** CI green на трёх ОС для e2e smoke

### ⚡ Идеи (декомпозиция по запросу)

**6 · L · Авто-цикл «тесты → почини»** — приор. Medium  
- **Цель:** для проектов пользователя — `run_tests` → парс падений → итерация правок (сейчас автопроверка только после self-edit)  
- **Файлы:** `app/electron/main/agentTools.ts`, `agentHandlersProject.ts`, `agent.ts`  
- **Действие:** инструмент `run_tests`; эвристика повторного прогона при failed tests  
- **Проверка:** сломанный unit-тест → агент чинит и перезапускает до green

**7 · M · Счётчик стоимости облачных запросов** — приор. Medium  
- **Цель:** отображение $ и токенов по провайдеру в UI (сейчас `generationMetrics` считает tok/s, но не стоимость)  
- **Файлы:** `app/electron/main/generationMetrics.ts`, `app/src/components/AgentStatusBar.tsx`, `shared/constants.ts` (тарифы)  
- **Действие:** накопление input/output/cache tokens × тариф модели; чип в статус-баре  
- **Проверка:** после облачного прогона в UI видна оценка стоимости сессии

---

## ✅ Сделано

- Песочница для run_script: `scriptSandbox.ts` — `docker run --rm --network none --memory 512m -v projectPath:/workspace`; `isDockerAvailable()` ping; fallback на локальный запуск при недоступности Docker; `scriptSandboxEnabled` в `AgentSettings` + Zod-схема + normalizer; тумблер «Песочница для скриптов» в SettingsModal (вкладка Безопасность)
- Каналы обновлений stable/beta: поле `updateChannel: 'stable' | 'beta'` в `AgentSettings` + Zod-схема; `autoUpdater.allowPrerelease` по настройке; `startUpdateChecks` принимает `allowPrerelease`; тумблер «Beta-версии» в SettingsModal (вкладка Модели)
- Editor subagent в цикле: инструмент `delegate_to_editor` — основной агент делегирует задачу субагенту-редактору (роль `editor`, до 20 шагов, полный набор файловых инструментов); защита от повторного делегирования одинаковой задачи; чип «Редактирую…» в AgentStatusBar; `'editing'` событие в AgentStreamPayload
- Explorer субагент: `runSubagent(explorer)` запускается при `explorerEnabled` + сложной задаче; сводка добавляется в системный промпт; чип «Разведываю…» в AgentStatusBar; тумблер в SettingsModal; тип `'exploring'` в AgentStreamPayload
- Контракт субагента: `shared/subagent.ts` (SubagentRole, EXPLORER_ALLOWED_TOOLS, EDITOR_ALLOWED_TOOLS, resolveAllowedTools, resolveMaxSteps); `subagentRunner.ts` (runSubagent — мини-прогон с urезанным tool set); 12 unit-тестов
- Экспорт урока в skill: кнопка «🎓 Сохранить как навык» в меню `···` ответа агента; диалог с полем имени; IPC `create-skill`; skill появляется в `list_skills`
- Рейтинг знаний collective: upvote/downvote (▲/▼) в MemoryPanel для коллективных записей; оценки хранятся локально в `collective-scores.json`; записи с рейтингом ≤ −2 скрываются в UI и не попадают в push; рейтинг −1 затемняет запись

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

**Документация**
- CONTRIBUTING.md: диаграмма ReAct (mermaid), таблица ключевых модулей, пошаговый гайд добавления инструмента
- Шаблоны GitHub Issues (баг, идея, вопрос, docs) и Pull Request (feature, bugfix, self-improvement)
- TypeDoc + GitHub Pages — `npm run docs` (shared API из JSDoc), workflow `.github/workflows/docs.yml`, публикация на GitHub Pages
- README «Примеры запросов» — 7 готовых диалогов (поиск, правка, самоулучшение, веб, git)
- Скринкасты для README — GIF в `docs/media/` (поиск, самоулучшение, Ollama); `npm run capture:readme-media`

- Шаблоны чатов: chatTemplates.ts (3 шаблона: Рефакторинг, Новый модуль, Code review); кнопка «▾» в тулбаре ChatHistoryPanel открывает меню шаблонов; createChatFromTemplate в App.tsx инжектирует системное сообщение-инструкцию в historию нового чата

- Авто-PR collective: autoCollectivePr в settings/types/ipcContracts; flushCollectiveMemoryToGit принимает флаг; после успешного push — createCodeViperPr(); «уже существует» не ошибка; тумблер «Авто-PR после sync» в SettingsModal
