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

**Правила:** нумерация сквозная (1…70); внутри цепочки — строго по порядку; один пункт = один прогон самоулучшения; после проверки — `complete_self_improvement_item`.

## 📋 В планах

> Нумерация сквозная. Сложность: S / M / L / XL. Приоритет указан в конце пункта.

### 🔗 Установленный CodeViper — самообновление без краша

**1 · S · Пропуск build в packaged-режиме** — приор. High  
- **Цель:** при `app.isPackaged` — самообучение не запускает `npm run build` (GitHub Actions соберёт)  
- **Файлы:** `app/electron/main/selfCommit.ts`  
- **Действие:** обернуть вызов build-команды в `if (!app.isPackaged)`  
- **Проверка:** `npm run typecheck`

**2 · M · Авто-тег после самообучения** — приор. High  
- **Цель:** после commit+push в packaged-режиме агент запускает `npm run bump` → `git tag vX.Y.Z` → `git push --tags`; это триггерит GitHub Actions release workflow  
- **Файлы:** `app/electron/main/selfCommit.ts`  
- **Действие:** если `app.isPackaged`, после успешного push вызвать bump+tag+push tags; сообщить пользователю версию и ссылку на Actions  
- **Проверка:** `npm run typecheck`; тег появляется в `git tag -l`

**3 · S · Сборка и установка первого установщика** — приор. High  
- **Цель:** NSIS-установщик собран и установлен на машине пользователя  
- **Файлы:** `app/package.json` (уже настроен), `app/resources/installer.nsh`  
- **Действие:** запустить `npm run dist` в `app/`; проверить что создаётся `.exe` в `release/`; установить  
- **Проверка:** установленный `CodeViper.exe` запускается из `C:\Users\roman\AppData\Local\Programs\CodeViper\`

### 🔗 node-llama-cpp + Оркестратор

**4 · S · electron-builder rebuild** — приор. Low  
- **Цель:** `npm run dist` пересобирает native-модуль без ручного rebuild  
- **Файлы:** `app/package.json` (секция `build`)  
- **Действие:** добавить `"npmRebuild": true`, `"buildDependenciesFromSource": false`  
- **Проверка:** сборка dist проходит (или документировать ограничение в README)

**5 · M · Обёртка nodeLlama.ts** — приор. Low  
- **Цель:** модуль с `loadModel`, `complete`, `unloadModel`, singleton  
- **Файлы:** `app/electron/main/nodeLlama.ts` (новый)  
- **Действие:** реализовать `NodeLlamaHandle`, ленивая инициализация  
- **Проверка:** `npm run typecheck`

**6 · S · Тест nodeLlama** — приор. Low  
- **Цель:** vitest-тест с `TEST_GGUF_PATH`, skip без пути  
- **Файлы:** `app/tests/nodeLlama.test.ts`, `README.md`  
- **Действие:** тест `loadModel → complete → unloadModel`; инструкция в README  
- **Проверка:** `npm test -- nodeLlama` (skip без env)

**7 · M · Выбор GGUF в настройках** — приор. Low  
- **Цель:** кнопка выбора `*.gguf`, путь в `AgentSettings.orchestratorModelPath`  
- **Файлы:** `app/src/components/SettingsModal.tsx`, `app/electron/main/settings.ts`, `app/src/types.ts`  
- **Действие:** `dialog.showOpenDialog` + поле в Zod-схеме  
- **Проверка:** UI сохраняет путь после выбора файла

**8 · L · orchestratorModel.ts** — приор. Low  
- **Цель:** `analyze(message)` → `{ plan, rephrased, isComplex }` JSON без стриминга  
- **Файлы:** `app/electron/main/orchestratorModel.ts` (новый)  
- **Действие:** singleton на `nodeLlama`, парсинг JSON ответа  
- **Проверка:** `npm run typecheck`; unit-тест с моком nodeLlama

**9 · M · Скачивание GGUF по умолчанию** — приор. Low  
- **Цель:** при первом включении оркестратора — загрузка Qwen2.5-1.5B в userData с прогрессом  
- **Файлы:** `app/electron/main/orchestratorModel.ts`, `SettingsModal.tsx`  
- **Действие:** download + `onProgressEvent`; кнопка «Скачать»  
- **Проверка:** прогресс в UI; файл появляется в `userData/orchestrator/`

**10 · S · UI секция «Оркестратор»** — приор. Low  
- **Цель:** тумблер `orchestratorEnabled`, поле `minMessageLength` (80), «Удалить модель»  
- **Файлы:** `SettingsModal.tsx`, `settings.ts`, `types.ts`  
- **Действие:** секция на вкладке «Модель»  
- **Проверка:** настройки сохраняются после перезапуска

**11 · M · Интеграция в AgentRunner** — приор. Low  
- **Цель:** перед прогоном — `analyze()`, plan в системный промпт, rephrased при `isComplex`  
- **Файлы:** `app/electron/main/agent.ts`  
- **Действие:** вызов оркестратора при `orchestratorEnabled`  
- **Проверка:** чип «Планирую…» в `AgentStatusBar`; `npm run typecheck`

### 🔗 Плагины

**12 · M · Сканирование plugins/*.js** — приор. Low  
- **Цель:** при старте main — загрузка `~/.codeviper/plugins/*.js`, регистрация tools  
- **Файлы:** `app/electron/main/pluginLoader.ts` (новый), `app/electron/main/index.ts`, `agentTools.ts`  
- **Действие:** `require()` + `export default { name, description, tools }`  
- **Проверка:** тест с фиктивным плагином в temp-папке

**13 · S · Вкладка «Плагины» в настройках** — приор. Low  
- **Цель:** список плагинов, вкл/выкл, «Открыть папку»  
- **Файлы:** `SettingsModal.tsx`, `settings.ts` (`AgentSettings.plugins`)  
- **Действие:** вкладка + `shell.openPath`  
- **Проверка:** UI отображает установленные плагины

**14 · M · Компиляция plugins/*.ts** — приор. Low  
- **Цель:** esbuild CommonJS во temp, кэш по mtime  
- **Файлы:** `app/electron/main/pluginLoader.ts`  
- **Действие:** `esbuild.buildSync` перед require  
- **Проверка:** тест: изменение mtime → перекомпиляция

**15 · L · Плагины в worker_thread** — приор. Low  
- **Цель:** изоляция плагина; fs только в projectPath; net заблокирован  
- **Файлы:** `app/electron/main/pluginWorker.ts` (новый), `pluginLoader.ts`  
- **Действие:** worker + ограниченный API  
- **Проверка:** краш воркера не роняет main; `npm test -- plugin`

### 🔗 P2P-вычисления

> Пункты 13–14 — код сервера в репозитории (`server/p2p/`); деплой VPS — вручную пользователем.

**16 · XL · REST API сигнального сервера** — приор. Low  
- **Цель:** API `POST /nodes/register`, `GET /nodes/available`, `DELETE /nodes/{id}`  
- **Файлы:** `server/p2p/` (новый каталог), `package.json` в корне или в server  
- **Действие:** Node + Express/Fastify + Redis для реестра узлов  
- **Проверка:** `curl` регистрации тестового узла локально

**17 · XL · Auth на сигнальном сервере** — приор. Low  
- **Цель:** JWT после email/GitHub OAuth; лимиты по токену  
- **Файлы:** `server/p2p/auth.ts`  
- **Действие:** регистрация + middleware  
- **Проверка:** запрос без токена → 401

**18 · M · Тумблер «Поделиться мощностью»** — приор. Low  
- **Цель:** UI + `POST /nodes/register` с GPU/RAM/моделью  
- **Файлы:** `SettingsModal.tsx`, `app/electron/main/p2pClient.ts` (новый), `settings.ts`  
- **Действие:** тумблер + регистрация узла  
- **Проверка:** mock-сервер принимает register

**20 · S · Диалог согласия P2P** — приор. Low  
- **Цель:** модалка при первом включении: что передаётся, лимиты, отказ блокирует режим  
- **Файлы:** `app/src/components/P2PConsentModal.tsx` (новый), `SettingsModal.tsx`  
- **Действие:** показ один раз, флаг в settings  
- **Проверка:** без согласия тумблер не активен

**21 · M · Пауза P2P при нагрузке** — приор. Low  
- **Цель:** GPU>20% или CPU>15% → входящие P2P-задачи в паузу  
- **Файлы:** `app/electron/main/agent.ts`, `p2pClient.ts`, `systemStats.ts`  
- **Действие:** проверка перед приёмом задачи  
- **Проверка:** unit-тест с моком systeminformation

**22 · M · Лимит 3 входящих P2P-задач** — приор. Low  
- **Цель:** очередь с таймаутом 60 с, сверх лимита → 503  
- **Файлы:** `app/electron/main/p2pClient.ts`  
- **Действие:** счётчик активных + очередь  
- **Проверка:** тест на отклонение 4-й задачи

**23 · M · TLS + шифрование промптов** — приор. Low  
- **Цель:** WSS между узлами; ECDH для тела промпта  
- **Файлы:** `server/p2p/`, `app/electron/main/p2pClient.ts`  
- **Действие:** TLS certs; симметричный ключ сессии  
- **Проверка:** узел не читает чужой plaintext в логах

**24 · L · Маршрутизация задач на сервере** — приор. Low  
- **Цель:** поиск свободного узла с моделью; иначе `{ fallback: true }`  
- **Файлы:** `server/p2p/router.ts`  
- **Действие:** логика выбора узла  
- **Проверка:** интеграционный тест с 2 mock-узлами

**25 · L · Кредиты P2P в UI** — приор. Low  
- **Цель:** баланс кредитов на сервере, отображение в `AgentStatusBar`  
- **Файлы:** `server/p2p/credits.ts`, `AgentStatusBar.tsx`, `p2pClient.ts`  
- **Действие:** +N/−N за задачи; IPC статуса  
- **Проверка:** баланс обновляется после mock-задачи

### 🔗 Коллективное обучение и UI агента

> База в коде: ветка `agent/self-improve`, `docs/collective/ViperMemory.md`, чип ☁️.

**26 · M · AgentLearningPanel** — приор. High  
- **Цель:** панель в чате: ветка, очередь, sync, кнопки «Синхронизировать» и «Создать PR»  
- **Файлы:** `app/src/components/AgentLearningPanel.tsx`, `ChatPanel.tsx`, `app/electron/main/index.ts`, `ipcContracts.ts`  
- **Действие:** IPC `get-collective-sync-status`  
- **Проверка:** панель показывает ветку и pending count

**27 · M · Pull collective при старте** — приор. High  
- **Цель:** при `gitSyncOnStartup` — fetch `origin/agent/self-improve`, обновить `docs/collective/ViperMemory.md`  
- **Файлы:** `app/electron/main/collectiveMemorySync.ts`, launcher sync  
- **Действие:** checkout/merge файла collective  
- **Проверка:** после pull знания из remote в контексте агента

**28 · S · MemoryPanel: локальные vs коллективные** — приор. Medium  
- **Цель:** две секции, бейдж источника, счётчик новых с remote  
- **Файлы:** `app/src/components/MemoryPanel.tsx`, `memory.ts`  
- **Действие:** разделить списки в UI  
- **Проверка:** коллективные записи видны отдельно

**29 · S · Фильтр перед push collective** — приор. Medium  
- **Цель:** отсечь короткий/пустой/дублирующий текст; лог отклонённых  
- **Файлы:** `app/electron/main/collectiveMemorySync.ts`, `AgentLearningPanel.tsx`  
- **Действие:** `minLength`, dedup с remote  
- **Проверка:** тест: пустая строка не пушится

**30 · M · Collective ViperSkills** — приор. Medium  
- **Цель:** sync навыков в `docs/collective/ViperSkills.md` + подгрузка в промпт  
- **Файлы:** `collectiveMemorySync.ts` или `collectiveSkillsSync.ts`, `skills.ts`  
- **Действие:** аналог памяти для global skills  
- **Проверка:** skill из remote в `list_skills`

**31 · S · Кнопка PR из панели** — приор. Medium  
- **Цель:** «Создать PR» → `create_codeviper_pr` с заголовком «Коллективные знания»  
- **Файлы:** `AgentLearningPanel.tsx`  
- **Действие:** вызов IPC существующего PR-инструмента  
- **Проверка:** после push кнопка создаёт PR (или сообщение «уже есть»)

**32 · M · Rebase при конфликте push** — приор. Low  
- **Цель:** non-fast-forward → `git pull --rebase` + retry  
- **Файлы:** `app/electron/main/selfCommit.ts`, `collectiveMemorySync.ts`  
- **Действие:** retry-цикл с rebase  
- **Проверка:** тест с моком git conflict

**33 · M · Чеклист плана самоулучшения** — приор. Low  
- **Цель:** sticky чеклист `self_improve_plan` над полем ввода (не только system-msg)  
- **Файлы:** `app/src/components/SelfImprovePlanPanel.tsx`, `ChatPanel.tsx`  
- **Действие:** подписка на `self_improve_plan` stream  
- **Проверка:** пункты done/pending видны при самоулучшении

### ⚡ Независимые задачи

**34 · L · POSIX-лаунчер и CI** — приор. Medium  
- **Цель:** `CodeViper.sh` для Linux/macOS; матрица CI ubuntu/macos  
- **Файлы:** `CodeViper.sh`, `.github/workflows/release.yml`  
- **Действие:** sh-скрипт аналог `.cmd`; пути POSIX в workflow  
- **Проверка:** `bash CodeViper.sh` на Linux (CI)

**35 · L · NSIS git clone при установке** — приор. Medium  
- **Цель:** установщик клонирует репо в `%APPDATA%\CodeViper\source\` (дополнить если нужно)  
- **Файлы:** `app/resources/installer.nsh`, `app/package.json`  
- **Действие:** проверить/дополнить clone + ярлык на `CodeViper.cmd`  
- **Проверка:** тестовая установка NSIS (или ревью скрипта)

**36 · M · Инструмент create_jira_issue** — приор. Low  
- **Цель:** POST Jira REST с `jiraUrl` + `jiraToken` из settings  
- **Файлы:** `agentHandlersGitHub.ts` или `agentHandlersJira.ts`, `agentTools.ts`, `settings.ts`, `SettingsModal.tsx`  
- **Действие:** схема инструмента + handler + поля settings  
- **Проверка:** `npm run typecheck`; mock POST

**37 · M · Инструмент create_linear_issue** — приор. Low  
- **Цель:** GraphQL `issueCreate` через Linear API  
- **Файлы:** `agentHandlersGitHub.ts`, `agentTools.ts`, `settings.ts` (`linearApiKey`)  
- **Действие:** handler + UI поле ключа  
- **Проверка:** `npm run typecheck`

**38 · M · Docker dev-окружение** — приор. Low  
- **Цель:** Dockerfile Node 20 + Ollama; compose с hot reload  
- **Файлы:** `Dockerfile`, `docker-compose.yml`, `README.md`  
- **Действие:** образ + том исходников + `npm run dev`  
- **Проверка:** `docker compose up` поднимает приложение

**39 · S · SHA-256 при pull Ollama** — приор. Low  
- **Цель:** сверка хеша с манифестом; при несовпадении — удалить файл и ошибка  
- **Файлы:** `app/electron/main/agentHandlersModels.ts` или `ollamaPull.ts`  
- **Действие:** проверка после скачивания  
- **Проверка:** тест с неверным хешем

**40 · M · Режим «Инкогнито»** — приор. Low  
- **Цель:** тумблер в топбаре; чаты и NDJSON-логи только в RAM  
- **Файлы:** `App.tsx`, `chats.ts`, `agentLogger.ts`, `settings.ts`  
- **Действие:** флаг `incognitoMode`; skip persist  
- **Проверка:** после перезапуска история инкогнито-чата пуста

**41 · S · README «Примеры запросов»** — приор. Low  
- **Цель:** 5–7 готовых диалогов (поиск, правка, самоулучшение, веб)  
- **Файлы:** `README.md`  
- **Действие:** новый раздел с промптами  
- **Проверка:** ревью текста

**42 · M · Скринкасты для README** — приор. Low  
- **Цель:** GIF/видео: поиск, самоулучшение, Ollama  
- **Файлы:** `docs/media/` (новый), `README.md`  
- **Действие:** добавить assets + ссылки  
- **Проверка:** файлы в репозитории, README ссылается

**43 · M · CONTRIBUTING.md** — приор. Low  
- **Цель:** диаграмма ReAct, ключевые модули, пример нового инструмента  
- **Файлы:** `CONTRIBUTING.md`  
- **Действие:** mermaid sequence + пошаговый гайд  
- **Проверка:** ревью документа

**44 · M · typedoc + GitHub Pages** — приор. Low  
- **Цель:** `npm run docs` генерирует API из JSDoc; деплой в Actions  
- **Файлы:** `package.json`, `.github/workflows/docs.yml` (новый), `typedoc.json`  
- **Действие:** typedoc config + workflow  
- **Проверка:** `npm run docs` локально без ошибок

### 🔗 Агент и проверки

**45 · S · Whitelist шаблонов команд** — приор. High  
- **Цель:** «Всегда разрешать» для паттернов (`npm test`, `git status`) поверх blocklist  
- **Файлы:** `app/electron/main/services.ts` (`validateCommand`), `settings.ts`, `SettingsModal.tsx` (Безопасность)  
- **Действие:** поле `commandAllowlist: string[]`; проверка allow перед deny  
- **Проверка:** `npm test -- validateCommand`; команда из allowlist не требует подтверждения

**46 · M · Автопроверка после правок** — приор. High  
- **Цель:** после успешного `edit_file` / `preview_patch` в self-improve — опционально `npm run typecheck` и/или `npm test`  
- **Файлы:** `app/electron/main/agentToolExecutor.ts`, `settings.ts` (`autoVerifyAfterEdit`)  
- **Действие:** детектор скриптов в `package.json`; запуск verify; результат tool_result в чат  
- **Проверка:** при включённой опции после edit появляется вывод typecheck/test

**47 · S · UI правил проекта** — приор. High  
- **Цель:** редактор `{projectPath}/.codeviper/rules.md` в настройках чата или панели проекта  
- **Файлы:** `app/src/components/ProjectRulesPanel.tsx` (новый), `ChatPanel.tsx`, `index.ts` (IPC read/write)  
- **Действие:** загрузка/сохранение rules; подсказка при отсутствии файла  
- **Проверка:** правка в UI → файл на диске; агент видит блок в контексте

**48 · M · Slash-команды** — приор. High  
- **Цель:** префиксы `/test`, `/commit`, `/roadmap N` раскрываются в готовый промпт перед отправкой  
- **Файлы:** `app/src/components/ChatInput.tsx` или `useSlashCommands.ts`, `app/shared/slashCommands.ts`  
- **Действие:** словарь команд + подстановка текста; `/roadmap 23` → «Выполни пункт 23…»  
- **Проверка:** ввод `/test` → в агент уходит полный промпт

**49 · M · Панель выбора ROADMAP** — приор. High  
- **Цель:** в режиме самоулучшения — список пунктов ROADMAP с кнопкой «Выполнить»  
- **Файлы:** `app/src/components/RoadmapPickerPanel.tsx`, `app/electron/main/roadmapParser.ts`, `ChatPanel.tsx`  
- **Действие:** парсинг `ROADMAP.md` (номер, название, цепочка); IPC `list-roadmap-items`  
- **Проверка:** клик по пункту 42 подставляет промпт в поле ввода

### 🔗 RAG и контекст

**50 · M · Автоиндексация при открытии проекта** — приор. Medium  
- **Цель:** при смене `projectPath` и настроенном Qdrant/Milvus — фоновый `index_project`  
- **Файлы:** `app/electron/main/contextRAG.ts`, `index.ts`, `settings.ts` (`autoIndexOnOpen`)  
- **Действие:** debounced index; статус в `AgentStatusBar`  
- **Проверка:** смена проекта → чип «Индексация…»; `search_knowledge_base` находит файлы

**51 · S · Nudge «используй RAG»** — приор. Medium  
- **Цель:** если grep пустой, RAG включён и проект проиндексирован — подсказка агенту вызвать `search_knowledge_base`  
- **Файлы:** `app/electron/main/agent.ts`, `agentContext.ts`  
- **Действие:** эвристика после пустого grep; system-hint в следующей итерации  
- **Проверка:** тест с моком пустого grep + включённым RAG

**52 · L · Символьный индекс (find_symbol)** — приор. Medium  
- **Цель:** инструменты `find_symbol` и `find_references` по tree-sitter или LSP  
- **Файлы:** `app/electron/main/symbolIndex.ts` (новый), `agentTools.ts`, `agentHandlersProject.ts`  
- **Действие:** парсинг AST для ts/js/py; возврат path:line:col  
- **Проверка:** `find_symbol` находит объявление известной функции в тестовом файле

### 🔗 UX и продуктивность

**53 · M · Дерево файлов проекта** — приор. High  
- **Цель:** панель слева с деревом; клик открывает файл; ПКМ → «Спросить агента»  
- **Файлы:** `app/src/components/ProjectTreePanel.tsx`, `services.ts` (`buildFileTree`), `App.tsx`  
- **Действие:** IPC `get-project-tree`; контекстное меню с вставкой пути в чат  
- **Проверка:** дерево совпадает с `list_directory`; ПКМ вставляет `@path`

**54 · M · Side-by-side diff** — приор. Medium  
- **Цель:** `preview_edit` показывает два столбца (было / стало), не только unified  
- **Файлы:** `app/src/components/DiffPreviewModal.tsx`, стили diff  
- **Действие:** переключатель unified / side-by-side; подсветка синтаксиса  
- **Проверка:** визуально два столбца при preview правки

**55 · S · Уведомление «агент закончил»** — приор. Medium  
- **Цель:** системный toast + звук (если включены уведомления) при завершении прогона  
- **Файлы:** `app/electron/main/index.ts` (`Notification`), `useAgentStream.ts`, `settings.ts`  
- **Действие:** `new Notification` при phase `idle` после `busy`; уважать `soundEnabled`  
- **Проверка:** фоновый чат → toast при готовности ответа

**56 · M · Шаблоны чатов** — приор. Medium  
- **Цель:** пресеты «Рефакторинг», «Новый модуль», «Code review» — стартовый промпт + preset tools  
- **Файлы:** `app/shared/chatTemplates.ts`, `ChatHistoryPanel.tsx`, `settings.ts`  
- **Действие:** создание чата из шаблона; опционально `disabledTools` preset  
- **Проверка:** новый чат из шаблона содержит системное сообщение-инструкцию

### 🔗 Коллективное обучение — продолжение

**57 · M · Авто-PR collective** — приор. Medium  
- **Цель:** после успешного push collective — опционально `create_codeviper_pr` без ручной кнопки  
- **Файлы:** `collectiveMemorySync.ts`, `settings.ts` (`autoCollectivePr`)  
- **Действие:** вызов PR-логики после push; дедуп «PR уже открыт»  
- **Проверка:** при включённой опции после sync создаётся PR или сообщение «уже есть»

**58 · M · Рейтинг знаний collective** — приор. Low  
- **Цель:** upvote/downvote в MemoryPanel для коллективных записей; фильтр push по рейтингу  
- **Файлы:** `MemoryPanel.tsx`, `docs/collective/ViperMemory.md` (метаданные), `collectiveMemorySync.ts`  
- **Действие:** голосование локально + sync score в markdown frontmatter  
- **Проверка:** downvote скрывает или понижает приоритет записи в UI

**59 · S · Экспорт урока в skill** — приор. Medium  
- **Цель:** кнопка «Сохранить как навык» у удачного ответа агента → `create_skill`  
- **Файлы:** `MessageBody.tsx`, IPC обёртка над `skills.ts`  
- **Действие:** диалог имени skill; тело из выбранных сообщений  
- **Проверка:** skill появляется в `list_skills`

### 🔗 Subagents

**60 · M · Контракт subagent** — приор. Medium  
- **Цель:** тип `SubagentRole` (explorer | editor), лимит инструментов, отдельный мини-прогон  
- **Файлы:** `app/electron/main/subagentRunner.ts` (новый), `shared/subagent.ts`  
- **Действие:** интерфейс запуска с урезанным tool set и max steps  
- **Проверка:** `npm run typecheck`; unit-тест с мок-провайдером

**61 · L · Explorer subagent** — приор. Medium  
- **Цель:** read-only субагент (grep, read, list) для разведки перед основным прогоном  
- **Файлы:** `subagentRunner.ts`, `agent.ts`  
- **Действие:** `spawn_explorer` при сложном запросе; сводка в системный промпт  
- **Проверка:** сложный запрос → сначала explorer, затем edit с контекстом сводки

**62 · L · Editor subagent в цикле** — приор. Low  
- **Цель:** субагент с mutating tools выполняет план, основной агент только координирует  
- **Файлы:** `agent.ts`, `subagentRunner.ts`  
- **Действие:** делегирование шагов плана editor-роли  
- **Проверка:** E2E: «найди и исправь» — explorer + editor без зацикливания

### 🔗 Модели и обновления

**63 · M · Бенчмарк локальных моделей** — приор. Low  
- **Цель:** UI «Проверить модель»: tok/s, latency, успех tool call на эталонном промпте  
- **Файлы:** `app/electron/main/modelBenchmark.ts`, `SettingsModal.tsx` (вкладка Модель)  
- **Действие:** 3 коротких прогона; таблица результатов в модалке  
- **Проверка:** кнопка «Бенчмарк» выводит tok/s для выбранной Ollama-модели

**64 · S · Каналы обновлений stable/beta** — приор. Low  
- **Цель:** настройка канала: stable (latest release) / beta (pre-release) в `electron-updater`  
- **Файлы:** `updateChecker.ts`, `settings.ts`, `SettingsModal.tsx`  
- **Действие:** `allowPrerelease` по настройке; фильтр тегов GitHub  
- **Проверка:** beta находит pre-release; stable — только релизы

### 🔗 Интеграции и изоляция

**65 · M · Webhook «агент готов»** — приор. Low  
- **Цель:** POST на Slack/Discord/n8n URL при завершении прогона (опционально)  
- **Файлы:** `app/electron/main/webhookNotify.ts`, `settings.ts` (`webhookUrl`), `agent.ts`  
- **Действие:** fetch POST с `{ chatId, summary, projectPath }`  
- **Проверка:** mock-сервер получает payload после idle

**66 · L · Песочница для run_script** — приор. Low  
- **Цель:** опциональный запуск скриптов в Docker-контейнере с mount только `projectPath`  
- **Файлы:** `app/electron/main/scriptSandbox.ts`, `agentHandlersProject.ts`, `settings.ts`  
- **Действие:** `docker run --rm -v projectPath` для python/bash; fallback на локальный run  
- **Проверка:** скрипт не может писать вне projectPath в sandbox-режиме

### 🔗 Далёкое будущее

**67 · L · Голосовой ввод и озвучка** — приор. Low  
- **Цель:** кнопка микрофона (Web Speech API / whisper.cpp); TTS последнего ответа  
- **Файлы:** `ChatInput.tsx`, `MessageBody.tsx`, опционально `whisperWorker.ts`  
- **Действие:** STT → текст в поле; TTS по кнопке «Озвучить»  
- **Проверка:** диктовка вставляет текст; TTS воспроизводит ответ

**68 · XL · LSP в редакторе** — приор. Low  
- **Цель:** go-to-definition, hover, diagnostics для открытого файла в встроенном просмотре  
- **Файлы:** `app/electron/main/lspClient.ts`, Monaco или CodeMirror интеграция  
- **Действие:** запуск typescript-language-server / pyright по типу файла  
- **Проверка:** Ctrl+click на символ → переход к определению

**69 · L · Skill marketplace** — приор. Low  
- **Цель:** каталог навыков из GitHub (`docs/collective/skills/` или отдельный репо); импорт одной кнопкой  
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`, IPC `import-remote-skill`  
- **Действие:** список remote skills + `git sparse-checkout` или raw fetch  
- **Проверка:** импорт skill из URL появляется локально

**70 · M · E2E на Linux/macOS в CI** — приор. Medium  
- **Цель:** Playwright+Electron в матрице ubuntu/macos для smoke-тестов UI  
- **Файлы:** `.github/workflows/ci.yml`, `app/tests/e2e/`  
- **Действие:** job `test:e2e` на linux/macos (headless); фикс путей POSIX  
- **Проверка:** CI green на трёх ОС для e2e smoke

---

## ✅ Сделано
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

**UI**
- `FileTimelinePanel`: NDJSON-лог изменений файла с вертикальной шкалой; вызывается ПКМ по пути файла в ответе агента; IPC `read-file-history`; diff раскрывается кнопкой; lazy-загрузка
- `ChatHistoryPanel`: группировка чатов без папки по `projectPath`; `collapsedProjects` state; `useEffect` авторазворачивает группу активного чата; сортировка по дате последнего обновления; группа «без проекта» — последняя
- `OllamaDownloadStatus`: скользящее окно 10 с для расчёта средней скорости; вывод «< 1 мин» / «~N мин» / «~N ч» рядом с процентом загрузки
- `customSystemPrompt`: поле «Дополнительные инструкции» в SettingsModal (Поведение); текст дописывается в конец системного промпта агента через `buildSystemPrompt()`
- Шпаргалка горячих клавиш (`KeyboardShortcutsModal`): открывается по `?` вне поля ввода или кнопкой `?` в топбаре; 4 секции с `<kbd>`-бейджами; lazy-загрузка
- Поиск по настройкам в `SettingsModal.tsx`: поле в sidebar, фильтрация по всем вкладкам через `SettingItem` + `SearchCtx`, подсветка совпадений `<mark>`, бейдж вкладки у каждого результата
- Кнопка «Сжать историю» в превью контекста: при заполнении > 60% появляется в поповере; вызывает принудительную суммаризацию через IPC `summarize-context`
- Убран заголовок активного чата из топбара (показывал внутренние задачи самоулучшения); иконка приложения из `resources/icon.png`; логотип PNG в топбаре вместо эмодзи
- Раздельные API-ключи для DeepSeek / OpenAI / OpenRouter (шифрование `safeStorage`); миграция со старого единого `providerApiKey`
- Список моделей OpenRouter с фильтром tool calling, поиском и отображением размера контекста
- Раздельные списки чатов для вкладок Chat и Code (`SavedChat.mode`); кнопки чата скрыты по умолчанию, появляются при наведении

**Производительность**
- LRU-кэш 200 записей для `find_files` в `fileSearchInWorker.ts`; ключ `{pattern, root}`, инвалидация по `mtime` корневой директории
- Профили суммаризации в `SettingsModal.tsx`: кнопки-пресеты «Экономичный» (55%), «Сбалансированный» (70%), «Качество» (85%) над слайдером; активный профиль подсвечивается
- LRU-кэш 500 записей для `grep_files` в `fileSearchInWorker.ts`; ключ `{query, root, subpath}`; инвалидация через `invalidateGrepCache()`, подключённый к `fs.watch`-вотчеру в `services.ts` — срабатывает при изменении любого файла в проекте
- Батчинг `find_files`: `findMultiInTree` в `fileSearch.ts` обходит ФС один раз для ≤5 паттернов; `fileSearchInWorker.ts` батчит `find` по аналогии с grep через `multi-find` тип воркера
- Динамический системный промпт: в режиме Chat — только базовый промпт (~200 токенов), без инструментов, дерева проекта и памяти; экономия 10–20% токенов на запрос
- `buildSystemPrompt()` динамически исключает неиспользуемые разделы: `buildProjectContext()` — только при непустом `projectPath`, `buildSelfEditContext()` — только в self-improve
- Вкладка «Производительность» в настройках: тумблеры «Режим энергосбережения» (батчинг 300 мс, без анимаций), «Отключить CPU/GPU-статы», «Обновлять PR только вручную»
- Интервал опроса CPU/GPU снижен с 1 с до 3 с (`systemStats.ts`)
- Устойчивость при смене монитора: флаги `--disable-gpu-process-crash-limit` + `--in-process-gpu`; авто-reload рендерера при крашах GPU/renderer → `CrashRecoveryDialog` восстанавливает сессию

**Ядро агента**
- Очистка editSnapshots при старте каждого прогона — предотвращает утечку памяти в длинных сессиях
- Стриминг, кнопка «Стоп», цикл `while(true)`, инструменты (create/edit/append/delete/move/grep/find/git), tool choice, парсинг text tool call, детектор опасных задач, защита `parseToolArgs`
- Рефакторинг `agent.ts` → 6 модулей: `ContextManager`, `ToolExecutor`, `SelfImprovementOrchestrator`, `LoopGuard`, `ResponseEmitter`, `agentOllamaApi`; параллельное выполнение инструментов (Promise.all) при cloud API; удалены жёсткие лимиты шагов/прогонов
- Агент не молчит при пустом ответе; не останавливается на «намерении»; пропускает tool call для информационных вопросов
- Добавлены инструменты для GitHub, файловых операций и кратких сводок по проекту

**Провайдеры**
- `StreamingChatProvider` (`providers/streamingChatProvider.ts`): абстрактный базовый класс с общим I/O-циклом стриминга (fetch + backoff retry + reader + TextDecoder + буфер + releaseLock); хуки `buildRequest()`, `createChunkParser()` (возвращает `ChunkParser` с `parse` + `finalize`), `handleHttpError()`; `BACKOFF_MS` переопределяется в подклассе; `OllamaProvider` и `OpenAIProvider` реализуют только специфику
- Circuit breaker в `modelRuntime.ts`: 5 последовательных ошибок → `open` (немедленный отказ), через 30 с → `half-open` (пробный запрос), успех → `closed`; модульный реестр `cbRegistry` для сохранения состояния между прогонами; статус отображается в `AgentStatusBar.tsx` с обратным отсчётом

**Провайдеры и модели**
- Провайдер Groq: `groqProvider.ts` (переиспользует `OpenAIProvider` с `baseUrl: 'https://api.groq.com/openai/v1'`); поле `groqApiKey` в `settings.ts` и `types.ts`
- Провайдер Together AI: `togetherProvider.ts` (переиспользует `OpenAIProvider` с `baseUrl: 'https://api.together.xyz/v1'`); поле `togetherApiKey`; оба провайдера добавлены в UI (`SettingsModal.tsx`)
- Dual-provider режим (Ollama + cloud одновременно); нативный tool calling OpenAI/DeepSeek; `max_tokens`, `temperature` для cloud; работа без Ollama при cloud-провайдере
- Провайдер OpenRouter (агрегатор: GPT-4o, Claude, Gemini, Llama и др.) — основной и облачный
- Выбор модели в топбаре; динамический список моделей DeepSeek; совместимость моделей (✓/⚠ по RAM); управление моделями Ollama (каталог, автовыбор, скачать/удалить)
- Статистика «Xс · Yk токенов» под последним сообщением агента; пульсирующая индикаторная полоса вместо бегущей; убрана нагрузка CPU/GPU из статусбара; оптимизация промпта и описаний инструментов
- Кэш контекст-превью в `useContextPreview`: IPC-запрос пропускается, если `{messagesKey, model}` не изменились с прошлого вызова

**Контекст и память**
- LRU-кэш 500 записей для `read_file` / `read_codeviper_file` в `services.ts`; ключ `{path, offset, limit}`, инвалидация по `mtime`; автоинвалидация при write/create/append/delete
- Обрезка старых tool-результатов в `compressContextMessages()`: оставляются последние 5, более старые → `[результат обрезан]`; экономия 10–15% на длинных диалогах
- Удаление ошибочных `tool_result` из истории: если для того же инструмента есть более поздний успешный результат, ошибочный удаляется
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

**Архитектура**
- `shared/ipcContracts.ts`: единый источник имён всех IPC-каналов (`IPC.*` константы) + Zod-схемы аргументов; `parseIpcArgs` валидирует входные данные на `write-file`, `run-terminal-command`, `save-settings`; `preload/index.ts` полностью переведён с строковых литералов на `IPC.*`
- `TaskPlanner` в `electron/main/taskPlanner.ts`: вынесена логика планирования из `AgentRunner` и `SelfImprovementOrchestrator`; `PlanningStrategy` интерфейс для подмены в тестах; `TaskPlanner.decide()` + `finalize()` + `detectMode()`; `selfImproveMode`-флаг удалён из `AgentRunner`
- `MemoryStorage` интерфейс в `memory.ts`: `FsMemoryStorage` (файловая система) и `InMemoryStorage` (для тестов); тесты переписаны без `vi.mock('electron')` и временных директорий

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
- NSIS-скрипт (`resources/installer.nsh`): `git clone --depth 1` репозитория в `%APPDATA%\CodeViper\source\` при установке; ярлык на рабочем столе запускает `CodeViper.cmd` через `cmd.exe /c`; при повторной установке — `git pull`; при удалении — опциональное удаление исходников
- `run_command` без `shell: true`; `assertInsideProject`; blocklist; шифрование API-ключей (`safeStorage`)
- ESLint + Prettier + lint-staged + husky; vitest 37+ тестов; E2E Playwright+Electron; нагрузочные тесты
- Семантическое версионирование; GitHub Actions CI; branch protection; доступность (WCAG AA)
- Статус PR в UI (CI-статус); `PrStatusPanel` опрашивает только при открытой панели (`isOpen`), интервал 300 с; автодополнение в терминале; метрики (tok/s, NDJSON-лог)
- Zod-схема `PersistedSettingsSchema` в `settings.ts`: тип `PersistedSettings` выведен через `z.infer<>`; `safeParse()` при загрузке с детальным логом ошибок и fallback на `normalize()`

**Portable Node.js**
- `scripts/download-node.js`: скачивание Node.js LTS в `app/resources/node/`; `npm run setup-node`; вызов перед `npm run dist`
- `extraResources` в electron-builder: portable Node в `node/` рядом с `resources/` в установленном дистрибутиве
- `getBundledNodeBin()` и PATH в `runCodeViperCommand` — самопересборка через bundled Node

**MCP-серверы**
- `mcpRegistry.ts`: регистрация MCP по `/.well-known/mcp`, хранение в `AgentSettings.mcpServers`; IPC `add-mcp-server` / `remove-mcp-server`
- Секция MCP в `SettingsModal` (вкладка «Интеграции»): список серверов, добавление и удаление по URL
- `getAgentTools()` + `mcpTools.ts`: динамические инструменты MCP, вызов через `POST /tools/call`, результат через `POST /tools/result`

**Агент**
- Проверка `node_modules` перед запуском только при непустых секциях зависимостей в `package.json` — проекты без npm-пакетов не блокируются
- Самоулучшение: автопуш в ветку `agent/self-improve` (настройка `selfImproveBranch`), checkout в начале прогона
- Коллективная память: синхронизация глобальных знаний в `docs/collective/ViperMemory.md` + push; UI-чип в статус-баре; подгрузка в контекст всех пользователей
- `electron-updater`: packaged-сборка проверяет GitHub Releases при старте; dev — git fetch `app/`; баннер с «Перезапустить и обновить»; `UpdateInfo` git/release
- ROADMAP «В планах»: единый формат самообучения, сквозная нумерация; расширение до 67 пунктов; правила в AGENTS.md, CLAUDE.md, docs/self-improvement.md, навык viper-self-improvement v3
- node-llama-cpp v3.18.1 и @electron/rebuild добавлены в зависимости; скрипт `npm run rebuild`; бинарник `llama-addon.node` (CPU, win-x64) загружен через `@node-llama-cpp/win-x64`
- Переопределённый путь к исходникам CodeViper: поле `sourceRootOverride` в настройках, `getCodeViperSourceRoot()` проверяет его первым; UI с текстовым полем и кнопкой «Выбрать папку»; сохраняется в конфиге и восстанавливается при перезапуске
