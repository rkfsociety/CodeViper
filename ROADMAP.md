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

### 🔗 Установленный CodeViper — самообновление без краша

### 🔗 node-llama-cpp + Оркестратор

**1 · M · Обёртка nodeLlama.ts** — приор. Low  
- **Цель:** модуль с `loadModel`, `complete`, `unloadModel`, singleton  
- **Файлы:** `app/electron/main/nodeLlama.ts` (новый)  
- **Действие:** реализовать `NodeLlamaHandle`, ленивая инициализация  
- **Проверка:** `npm run typecheck`

**2 · S · Тест nodeLlama** — приор. Low  
- **Цель:** vitest-тест с `TEST_GGUF_PATH`, skip без пути  
- **Файлы:** `app/tests/nodeLlama.test.ts`, `README.md`  
- **Действие:** тест `loadModel → complete → unloadModel`; инструкция в README  
- **Проверка:** `npm test -- nodeLlama` (skip без env)

**3 · M · Выбор GGUF в настройках** — приор. Low  
- **Цель:** кнопка выбора `*.gguf`, путь в `AgentSettings.orchestratorModelPath`  
- **Файлы:** `app/src/components/SettingsModal.tsx`, `app/electron/main/settings.ts`, `app/src/types.ts`  
- **Действие:** `dialog.showOpenDialog` + поле в Zod-схеме  
- **Проверка:** UI сохраняет путь после выбора файла

**4 · L · orchestratorModel.ts** — приор. Low  
- **Цель:** `analyze(message)` → `{ plan, rephrased, isComplex }` JSON без стриминга  
- **Файлы:** `app/electron/main/orchestratorModel.ts` (новый)  
- **Действие:** singleton на `nodeLlama`, парсинг JSON ответа  
- **Проверка:** `npm run typecheck`; unit-тест с моком nodeLlama

**5 · M · Скачивание GGUF по умолчанию** — приор. Low  
- **Цель:** при первом включении оркестратора — загрузка Qwen2.5-1.5B в userData с прогрессом  
- **Файлы:** `app/electron/main/orchestratorModel.ts`, `SettingsModal.tsx`  
- **Действие:** download + `onProgressEvent`; кнопка «Скачать»  
- **Проверка:** прогресс в UI; файл появляется в `userData/orchestrator/`

**6 · S · UI секция «Оркестратор»** — приор. Low  
- **Цель:** тумблер `orchestratorEnabled`, поле `minMessageLength` (80), «Удалить модель»  
- **Файлы:** `SettingsModal.tsx`, `settings.ts`, `types.ts`  
- **Действие:** секция на вкладке «Модель»  
- **Проверка:** настройки сохраняются после перезапуска

**7 · M · Интеграция в AgentRunner** — приор. Low  
- **Цель:** перед прогоном — `analyze()`, plan в системный промпт, rephrased при `isComplex`  
- **Файлы:** `app/electron/main/agent.ts`  
- **Действие:** вызов оркестратора при `orchestratorEnabled`  
- **Проверка:** чип «Планирую…» в `AgentStatusBar`; `npm run typecheck`

### 🔗 P2P-вычисления

> Пункты 9–10 — код сервера в репозитории (`server/p2p/`); деплой VPS — вручную пользователем.

**8 · XL · REST API сигнального сервера** — приор. Low  
- **Цель:** API `POST /nodes/register`, `GET /nodes/available`, `DELETE /nodes/{id}`  
- **Файлы:** `server/p2p/` (новый каталог), `package.json` в корне или в server  
- **Действие:** Node + Express/Fastify + Redis для реестра узлов  
- **Проверка:** `curl` регистрации тестового узла локально

**9 · XL · Auth на сигнальном сервере** — приор. Low  
- **Цель:** JWT после email/GitHub OAuth; лимиты по токену  
- **Файлы:** `server/p2p/auth.ts`  
- **Действие:** регистрация + middleware  
- **Проверка:** запрос без токена → 401

**10 · M · Тумблер «Поделиться мощностью»** — приор. Low  
- **Цель:** UI + `POST /nodes/register` с GPU/RAM/моделью  
- **Файлы:** `SettingsModal.tsx`, `app/electron/main/p2pClient.ts` (новый), `settings.ts`  
- **Действие:** тумблер + регистрация узла  
- **Проверка:** mock-сервер принимает register

**11 · S · Диалог согласия P2P** — приор. Low  
- **Цель:** модалка при первом включении: что передаётся, лимиты, отказ блокирует режим  
- **Файлы:** `app/src/components/P2PConsentModal.tsx` (новый), `SettingsModal.tsx`  
- **Действие:** показ один раз, флаг в settings  
- **Проверка:** без согласия тумблер не активен

**12 · M · Пауза P2P при нагрузке** — приор. Low  
- **Цель:** GPU>20% или CPU>15% → входящие P2P-задачи в паузу  
- **Файлы:** `app/electron/main/agent.ts`, `p2pClient.ts`, `systemStats.ts`  
- **Действие:** проверка перед приёмом задачи  
- **Проверка:** unit-тест с моком systeminformation

**13 · M · Лимит 3 входящих P2P-задач** — приор. Low  
- **Цель:** очередь с таймаутом 60 с, сверх лимита → 503  
- **Файлы:** `app/electron/main/p2pClient.ts`  
- **Действие:** счётчик активных + очередь  
- **Проверка:** тест на отклонение 4-й задачи

**14 · M · TLS + шифрование промптов** — приор. Low  
- **Цель:** WSS между узлами; ECDH для тела промпта  
- **Файлы:** `server/p2p/`, `app/electron/main/p2pClient.ts`  
- **Действие:** TLS certs; симметричный ключ сессии  
- **Проверка:** узел не читает чужой plaintext в логах

**15 · L · Маршрутизация задач на сервере** — приор. Low  
- **Цель:** поиск свободного узла с моделью; иначе `{ fallback: true }`  
- **Файлы:** `server/p2p/router.ts`  
- **Действие:** логика выбора узла  
- **Проверка:** интеграционный тест с 2 mock-узлами

**16 · L · Кредиты P2P в UI** — приор. Low  
- **Цель:** баланс кредитов на сервере, отображение в `AgentStatusBar`  
- **Файлы:** `server/p2p/credits.ts`, `AgentStatusBar.tsx`, `p2pClient.ts`  
- **Действие:** +N/−N за задачи; IPC статуса  
- **Проверка:** баланс обновляется после mock-задачи

### 🔗 Коллективное обучение и UI агента

> База в коде: ветка `agent/self-improve`, `docs/collective/ViperMemory.md`, чип ☁️.

**17 · M · AgentLearningPanel** — приор. High  
- **Цель:** панель в чате: ветка, очередь, sync, кнопки «Синхронизировать» и «Создать PR»  
- **Файлы:** `app/src/components/AgentLearningPanel.tsx`, `ChatPanel.tsx`, `app/electron/main/index.ts`, `ipcContracts.ts`  
- **Действие:** IPC `get-collective-sync-status`  
- **Проверка:** панель показывает ветку и pending count

**18 · M · Pull collective при старте** — приор. High  
- **Цель:** при `gitSyncOnStartup` — fetch `origin/agent/self-improve`, обновить `docs/collective/ViperMemory.md`  
- **Файлы:** `app/electron/main/collectiveMemorySync.ts`, launcher sync  
- **Действие:** checkout/merge файла collective  
- **Проверка:** после pull знания из remote в контексте агента

**19 · S · MemoryPanel: локальные vs коллективные** — приор. Medium  
- **Цель:** две секции, бейдж источника, счётчик новых с remote  
- **Файлы:** `app/src/components/MemoryPanel.tsx`, `memory.ts`  
- **Действие:** разделить списки в UI  
- **Проверка:** коллективные записи видны отдельно

**20 · S · Фильтр перед push collective** — приор. Medium  
- **Цель:** отсечь короткий/пустой/дублирующий текст; лог отклонённых  
- **Файлы:** `app/electron/main/collectiveMemorySync.ts`, `AgentLearningPanel.tsx`  
- **Действие:** `minLength`, dedup с remote  
- **Проверка:** тест: пустая строка не пушится

**21 · M · Collective ViperSkills** — приор. Medium  
- **Цель:** sync навыков в `docs/collective/ViperSkills.md` + подгрузка в промпт  
- **Файлы:** `collectiveMemorySync.ts` или `collectiveSkillsSync.ts`, `skills.ts`  
- **Действие:** аналог памяти для global skills  
- **Проверка:** skill из remote в `list_skills`

**22 · S · Кнопка PR из панели** — приор. Medium  
- **Цель:** «Создать PR» → `create_codeviper_pr` с заголовком «Коллективные знания»  
- **Файлы:** `AgentLearningPanel.tsx`  
- **Действие:** вызов IPC существующего PR-инструмента  
- **Проверка:** после push кнопка создаёт PR (или сообщение «уже есть»)

**23 · M · Rebase при конфликте push** — приор. Low  
- **Цель:** non-fast-forward → `git pull --rebase` + retry  
- **Файлы:** `app/electron/main/selfCommit.ts`, `collectiveMemorySync.ts`  
- **Действие:** retry-цикл с rebase  
- **Проверка:** тест с моком git conflict

**24 · M · Чеклист плана самоулучшения** — приор. Low  
- **Цель:** sticky чеклист `self_improve_plan` над полем ввода (не только system-msg)  
- **Файлы:** `app/src/components/SelfImprovePlanPanel.tsx`, `ChatPanel.tsx`  
- **Действие:** подписка на `self_improve_plan` stream  
- **Проверка:** пункты done/pending видны при самоулучшении

### ⚡ Независимые задачи

**25 · L · POSIX-лаунчер и CI** — приор. Medium  
- **Цель:** `CodeViper.sh` для Linux/macOS; матрица CI ubuntu/macos  
- **Файлы:** `CodeViper.sh`, `.github/workflows/release.yml`  
- **Действие:** sh-скрипт аналог `.cmd`; пути POSIX в workflow  
- **Проверка:** `bash CodeViper.sh` на Linux (CI)

**26 · M · Инструмент create_jira_issue** — приор. Low  
**27 · M · Инструмент create_linear_issue** — приор. Low  
**28 · M · Docker dev-окружение** — приор. Low  
**29 · S · SHA-256 при pull Ollama** — приор. Low  
**30 · M · Режим «Инкогнито»** — приор. Low  
**31 · S · README «Примеры запросов»** — приор. Low  
**32 · M · Скринкасты для README** — приор. Low  
**33 · M · CONTRIBUTING.md** — приор. Low  
**34 · M · typedoc + GitHub Pages** — приор. Low  
**35 · S · Whitelist шаблонов команд** — приор. High  
**36 · M · Автопроверка после правок** — приор. High  
**37 · S · UI правил проекта** — приор. High  
**38 · M · Slash-команды** — приор. High  
**39 · M · Панель выбора ROADMAP** — приор. High  
**40 · M · Автоиндексация при открытии проекта** — приор. Medium  
**41 · S · Nudge «используй RAG»** — приор. Medium  
**42 · L · Символьный индекс (find_symbol)** — приор. Medium  
**43 · M · Дерево файлов проекта** — приор. High  
**44 · M · Side-by-side diff** — приор. Medium  
**45 · S · Уведомление «агент закончил»** — приор. Medium  
**46 · M · Шаблоны чатов** — приор. Medium  
**47 · M · Авто-PR collective** — приор. Medium  
**48 · M · Рейтинг знаний collective** — приор. Low  
**49 · S · Экспорт урока в skill** — приор. Medium  
**50 · M · Контракт subagent** — приор. Medium  
**51 · L · Explorer subagent** — приор. Medium  
**52 · L · Editor subagent в цикле** — приор. Low  
**53 · M · Бенчмарк локальных моделей** — приор. Low  
**54 · S · Каналы обновлений stable/beta** — приор. Low  
**55 · M · Webhook «агент готов»** — приор. Low  
**56 · L · Песочница для run_script** — приор. Low  
**57 · L · Голосовой ввод и озвучка** — приор. Low  
**58 · XL · LSP в редакторе** — приор. Low  
**59 · L · Skill marketplace** — приор. Low  
**60 · M · E2E на Linux/macOS в CI** — приор. Medium  
---

## ✅ Сделано
- NSIS git clone: установщик клонирует репо в %APPDATA%\CodeViper\source\ с флагом --depth 1; проверка git перед установкой; обновление через git pull --ff-only при повторной установке; ярлыки на Desktop и в Start Menu Programs запускают CodeViper.cmd через cmd.exe; опция удалить исходный код при дезинсталляции; обработка ошибок (нет git, нет интернета)
- create_linear_issue: инструмент для создания Issue в Linear через GraphQL API; поле linearApiKey в настройках с шифрованием; UI в разделе «Интеграции» с ссылкой на получение ключа; параметры: title, team_key, description, priority (0-4)
- create_jira_issue: инструмент для создания Issue в Jira через REST API; поля jiraUrl и jiraToken в настройках с шифрованием; UI в разделе «Интеграции»; параметры: summary, project_key, description, issue_type
- POSIX-лаунчер: CodeViper.sh для Linux/macOS; аналог CodeViper.cmd; проверка Node.js, хеш package-lock.json, автосборка если изменились файлы в electron/shared; интеграция в CI workflow на ubuntu/macos с проверкой синтаксиса bash
- `disabledTools`: чекбоксы по 11 группам инструментов в SettingsModal (Поведение → Инструменты агента); `getAgentTools(selfImproveMode, disabledTools?)` фильтрует отключённые; кэш по ключу `${selfImproveMode}_${sorted disabled}`; поле `disabledTools?: string[]` в `AgentSettings` + Zod-схема
- `commandBlocklist`: пользовательские запрещённые паттерны команд (`AgentSettings.commandBlocklist: string[]`); строки или regexp; редактирование в `SettingsModal.tsx` (Поведение → Безопасность); применяется в `validateCommand()` поверх встроенного списка
- Per-chat `projectPath`: поле в `SavedChat`, агент берёт путь из чата через явный параметр `AgentRunner`, UI переключает проект при смене чата через изолированные `ChatContext.Provider`
- `search_in_project`: `type="content"` → `grepInTreeWorker`, `type="name"` → `findFilesInTreeWorker`; единый инструмент вместо выбора между `grep_files` и `find_files`
- `read_multiple_files`: принимает `paths: string[]`, читает все файлы параллельно через `Promise.all`, возвращает `JSON.stringify([{path, content}])`; ошибки на уровне файла не прерывают остальные
- `run_script`: принимает `interpreter: 'python' | 'powershell' | 'bash'`, `script: string`, опционально `cwd`; записывает скрипт во временный файл, запускает через соответствующий интерпретатор с проверкой `assertInsideProject`, удаляет файл после выполнения
- `review_code`: принимает `path`; `.ts/.tsx/.js/.jsx` → `npx eslint --format json`, `.py` → `ruff check --output-format json`; форматирует нарушения как `[N] L{line}:C{col}  {rule}\n    {message}`
- `agentHandlersGitLab.ts` + `gitlabTools.ts`: `list_gitlab_mrs`, `create_gitlab_mr`, `get_gitlab_pipeline`; проект определяется из git remote origin; `gitlabToken` шифруется через `safeStorage`; `gitlabUrl` поддерживает self-hosted инстансы
- `.github/workflows/release.yml`: матрица windows/ubuntu/macos; при push тега `v*` → `electron-vite build` → `electron-builder --publish always`; артефакты `.exe` (NSIS), `.AppImage`, `.dmg` публикуются в GitHub Releases через `GITHUB_TOKEN`
- `VectorStore` абстракция в `contextRAG.ts`: Qdrant и Milvus как взаимозаменяемые бэкенды; выбор через `AgentSettings.ragProvider`; поля `qdrantUrl`, `qdrantApiKey`, `ragProvider` в настройках; кнопка проверки соединения в SettingsModal; инструменты `index_project` (рекурсивная индексация проекта в Qdrant) и `search_knowledge_base` (top-5 чанков по семантическому запросу)
- Дедупликация повторяющихся tool results перед суммаризацией: одинаковый инструмент + вывод → `(повторено N раз)`
- Авто-превью файлов >20 КБ: первые/последние 50 строк с маркером `... (X строк обрезано) ...`
- Батчинг параллельных grep-запросов за один тик event loop в `fileSearch.ts`
- Интеграционные тесты OllamaProvider и OpenAIProvider: стриминг, tool call, 429, разрыв соединения
- Exponential backoff с jitter для HTTP 429 в `openaiProvider.ts`: 1 с → 2 с → 4 с → 8 с, макс. 4 попытки; статус «Лимит запросов, жду N с…» в `AgentStatusBar`
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
