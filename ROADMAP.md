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

**Правила:** нумерация сквозная (1…68); внутри цепочки — строго по порядку; один пункт = один прогон самоулучшения; после проверки — `complete_self_improvement_item`.

## 📋 В планах

> Нумерация сквозная **1…68**. Сложность: S / M / L / XL. Приоритет указан в конце пункта. Пустые категории без пунктов не держим — выполненные цепочки (P2P, базовое коллективное обучение) см. в «✅ Сделано».

### ⚡ Независимые задачи

**1 · M · Docker dev-окружение** — приор. Low  
- **Цель:** Dockerfile Node 20 + Ollama; compose с hot reload  
- **Файлы:** `Dockerfile`, `docker-compose.yml`, `README.md`  
- **Действие:** образ + том исходников + `npm run dev`  
- **Проверка:** `docker compose up` поднимает приложение

**2 · S · README: Linux и macOS в быстром старте** — приор. Medium  
- **Цель:** бейджи платформ, ссылки на AppImage/DMG и `CodeViper.sh` из релизов  
- **Файлы:** `README.md`  
- **Действие:** дополнить «Быстрый старт» установкой не только через Windows-установщик  
- **Проверка:** README содержит AppImage, dmg и POSIX-лаунчер

### 🔗 Горячие клавиши

**3 · M · Расширение горячих клавиш** — приор. Medium  
- **Цель:** Escape — стоп агента; Ctrl+Shift+N — новый чат; Ctrl+B — фокус/переключение дерева файлов  
- **Файлы:** `app/src/App.tsx`, `app/src/components/KeyboardShortcutsModal.tsx`  
- **Действие:** обработчики `keydown` + строки в модалке `?`  
- **Проверка:** каждая комбинация работает в UI; модалка отображает новые шорткаты

### 🔗 Split-view превью файла

**4 · M · Resizable split layout** — приор. Medium  
- **Цель:** основной layout с изменяемой шириной панели превью справа от чата  
- **Файлы:** `app/src/App.tsx`, `app/src/App.module.css` (или `styles.css`)  
- **Действие:** splitter между чатом и правой панелью; ширина в `localStorage`  
- **Проверка:** перетаскивание границы меняет ширину; после перезапуска ширина сохранена

**5 · M · FilePreviewPanel read-only** — приор. Medium  
- **Цель:** компонент просмотра файла с подсветкой синтаксиса (как в DiffPreviewModal)  
- **Файлы:** `app/src/components/FilePreviewPanel.tsx`, `shared/diffPreview.ts`  
- **Действие:** IPC `read-file` → highlight.js; заголовок с путём и кнопкой закрыть  
- **Проверка:** открытие `.ts` файла показывает подсветку

**6 · S · ProjectTree открывает превью** — приор. Medium  
- **Цель:** клик по файлу в `ProjectTreePanel` открывает его в `FilePreviewPanel`  
- **Файлы:** `app/src/components/ProjectTreePanel.tsx`, `app/src/App.tsx`  
- **Действие:** callback `onFileOpen(path)` → state `previewPath` в App  
- **Проверка:** клик в дереве → файл виден в split-панели

### 🔗 Голосовой ввод и озвучка

**7 · M · STT — кнопка микрофона** — приор. Low  
- **Цель:** диктовка в поле ввода через Web Speech API (`SpeechRecognition`)  
- **Файлы:** `app/src/components/ChatPanel/ChatInput.tsx`  
- **Действие:** кнопка 🎤 → `recognition.start()` → текст в `onInputChange`  
- **Проверка:** диктовка вставляет распознанный текст в поле

**8 · M · TTS — кнопка «Озвучить»** — приор. Low  
- **Цель:** озвучка последнего ответа ассистента через `speechSynthesis`  
- **Файлы:** `app/src/components/MessageBody.tsx` (или `MessageRow.tsx`)  
- **Действие:** кнопка «🔊» на сообщении assistant → `SpeechSynthesisUtterance`  
- **Проверка:** нажатие воспроизводит текст ответа

### 🔗 Встроенный редактор и LSP

**9 · M · CodeEditorPanel на CodeMirror** — приор. Medium  
- **Цель:** редактируемая вкладка файла вместо read-only `FilePreviewPanel` (п. 5)  
- **Файлы:** `app/src/components/CodeEditorPanel.tsx`, `app/package.json`  
- **Действие:** зависимость `@codemirror/*`; обёртка с темой под тёмный UI  
- **Проверка:** файл открывается в редакторе; курсор и правка работают

**10 · M · Сохранение из редактора** — приор. Medium  
- **Цель:** Ctrl+S / кнопка «Сохранить» пишет файл через существующий IPC  
- **Файлы:** `CodeEditorPanel.tsx`, `app/electron/main/ipc/registerFileIpc.ts`  
- **Действие:** `window.codeviper.writeFile(path, content)`; индикатор «несохранено»  
- **Проверка:** правка + сохранение → содержимое на диске изменилось

**11 · M · lspClient — spawn language server** — приор. Low  
- **Цель:** main-процесс запускает `typescript-language-server` / `pyright-langserver` по расширению файла  
- **Файлы:** `app/electron/main/lspClient.ts` (новый)  
- **Действие:** JSON-RPC over stdio; `didOpen`/`didChange`/`shutdown`  
- **Проверка:** unit-тест с mock child_process; лог «LSP ready» для `.ts`

**12 · M · LSP hover и go-to-definition (TS/JS)** — приор. Low  
- **Цель:** hover tooltip и Ctrl+click → переход к определению в `CodeEditorPanel` (п. 9)  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** IPC `lsp-request` → `textDocument/hover`, `textDocument/definition`  
- **Проверка:** Ctrl+click на символ → курсор на определении в том же файле

**13 · M · LSP pyright для Python** — приор. Low  
- **Цель:** те же hover/definition для `.py` через pyright-langserver  
- **Файлы:** `lspClient.ts`  
- **Действие:** ветка выбора сервера по `languageFromPath`; инициализация pyright  
- **Проверка:** Ctrl+click на `def foo` в `.py` → переход к определению

### 🔗 Символьный индекс (find_symbol)

**14 · M · find_symbol для Go** — приор. Medium  
- **Цель:** `find_symbol` / `find_references` для `.go` через `go/ast` или tree-sitter  
- **Файлы:** `app/electron/main/symbolIndex.ts`, `agentHandlersProjectSearch.ts`  
- **Действие:** парсер Go → символы с `path:line:col`  
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.go` файлом

**15 · M · find_symbol для Rust** — приор. Medium  
- **Цель:** символы для `.rs` (tree-sitter-rust или синтаксический обход)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** расширить `walkProjectForSymbols` для `.rs`  
- **Проверка:** unit-тест: `fn main` и `struct Foo` находятся по имени

**16 · M · find_symbol для Java** — приор. Medium  
- **Цель:** символы для `.java` (class/method)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** regex или tree-sitter-java для объявлений top-level  
- **Проверка:** unit-тест на простом `.java` с `public class Bar`

### 🔗 Тесты ядра агента

**17 · M · Unit-тесты agentLoopGuard** — приор. High  
- **Цель:** покрытие `MAX_CONSECUTIVE_SAME_TOOL` и `MAX_SAME_TOOL_TOTAL`  
- **Файлы:** `app/electron/main/agentLoopGuard.ts`, `app/tests/agentLoopGuard.test.ts`  
- **Действие:** кейсы: 5 подряд → блок; 50 всего → блок; сброс при смене tool  
- **Проверка:** `npm test -- agentLoopGuard`

**18 · M · Unit-тесты runCheckpoint** — приор. High  
- **Цель:** stash создаётся перед первым mutating tool; rollback восстанавливает  
- **Файлы:** `app/electron/main/runCheckpoint.ts`, `app/tests/runCheckpoint.test.ts`  
- **Действие:** mock `git stash create` + `git stash apply`  
- **Проверка:** `npm test -- runCheckpoint`

**19 · M · Unit-тесты parallel tool execution** — приор. High  
- **Цель:** `agentToolExecutor` выполняет независимые tool calls параллельно  
- **Файлы:** `app/electron/main/agentToolExecutor.ts`, `app/tests/agentToolExecutor.test.ts`  
- **Действие:** два mock handler с задержкой → wall time < sum  
- **Проверка:** `npm test -- agentToolExecutor`

**20 · M · Unit-тест Ollama fallback** — приор. Medium  
- **Цель:** `CircuitBreakerOpenError` → emit `ollama_fallback_offer`  
- **Файлы:** `app/electron/main/agent.ts`, `app/tests/agentFallback.test.ts`  
- **Действие:** mock provider throws circuit open → проверить payload события  
- **Проверка:** `npm test -- agentFallback`

### 🔗 Рефакторинг монолитов

**21 · M · Разбивка App.tsx** — приор. Low  
- **Цель:** вынести layout и модалки из ~1000-строчного `App.tsx`  
- **Файлы:** `app/src/App.tsx` → `AppLayout.tsx`, `useAppModals.ts`  
- **Действие:** перенести JSX layout + state модалок без изменения поведения  
- **Проверка:** `npm run typecheck`; E2E или ручной smoke UI

**22 · M · Разбивка agent.ts** — приор. Low  
- **Цель:** отделить цикл ReAct от dispatch инструментов  
- **Файлы:** `agent.ts` → `agentLoop.ts`, `agentStreamHandler.ts`  
- **Действие:** `AgentRunner.run()` делегирует в `runAgentLoop()`  
- **Проверка:** `npm run typecheck`; существующие agent-тесты зелёные

**23 · M · Хук useChatPanelState** — приор. Low  
- **Цель:** сократить `ChatPanel/index.tsx` — state и refs в отдельный хук  
- **Файлы:** `app/src/components/ChatPanel/index.tsx`, `useChatPanelState.ts`  
- **Действие:** перенести useState/useRef блоки в хук; index — только композиция  
- **Проверка:** `npm run typecheck`; отправка сообщения в UI работает

### 🔗 Git worktree на чат

**24 · M · gitWorktree.ts** — приор. Medium  
- **Цель:** create / remove / list worktrees через `git worktree`  
- **Файлы:** `app/electron/main/gitWorktree.ts` (новый), `gitTools.ts`  
- **Действие:** `createWorktree(repoPath, branch)` → путь worktree; `removeWorktree`  
- **Проверка:** unit-тест с temp git repo; `git worktree list` содержит запись

**25 · M · worktreePath в чате + IPC** — приор. Medium  
- **Цель:** поле `worktreePath?` в persisted chat; IPC `create-chat-worktree`  
- **Файлы:** `chats.ts`, `types.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** кнопка «Изолировать в worktree» в меню чата  
- **Проверка:** новый чат получает отдельную папку worktree

**26 · M · AgentRunner — корень worktree** — приор. Medium  
- **Цель:** если у чата есть `worktreePath`, агент работает в нём, а не в `projectPath`  
- **Файлы:** `agent.ts`, `registerAgentIpc.ts`, `agentHandlersProjectContext.ts`  
- **Действие:** `resolveProjectRoot(chat)` → `worktreePath ?? projectPath`  
- **Проверка:** правка файла в изолированном чате не затрагивает основную копию

### 🔗 Режим «только план»

**27 · M · planBeforeExecute в настройках** — приор. Medium  
- **Цель:** тумблер «Сначала показать план» в BehaviorTab  
- **Файлы:** `settings.ts`, `BehaviorTab.tsx`, `types.ts`  
- **Действие:** `planBeforeExecute: boolean` в Zod-схеме с default `false`  
- **Проверка:** настройка сохраняется и загружается

**28 · M · Пауза после плана до подтверждения** — приор. Medium  
- **Цель:** при `planBeforeExecute` оркестратор показывает план и ждёт кнопку «Выполнить»  
- **Файлы:** `agent.ts`, `orchestratorModel.ts`, `ChatPanel/index.tsx`  
- **Действие:** emit `plan_awaiting_confirm`; UI-кнопка продолжает прогон  
- **Проверка:** с включённым тумблером агент не вызывает tools до «Выполнить»

**29 · S · Toast при ожидании подтверждения** — приор. Medium  
- **Цель:** системное уведомление, если агент ждёт `preview_edit`/danger-dialog, а окно не в фокусе  
- **Файлы:** `app/src/App.tsx`, `app/electron/main/tray.ts` или `webhookNotify.ts`  
- **Действие:** при `pendingApproval` + `!document.hasFocus()` → toast «Агент ждёт подтверждения»  
- **Проверка:** сценарий в UI: свернуть окно → агент вызывает preview → toast появляется

### 🔗 Onboarding первого запуска

**30 · M · Флаг firstRunCompleted** — приор. Medium  
- **Цель:** `firstRunCompleted: boolean` в settings; false при первой установке  
- **Файлы:** `settings.ts`, `types.ts`  
- **Действие:** поле в Zod с default `false`; true после завершения визарда  
- **Проверка:** чистый settings.json → `firstRunCompleted === false`

**31 · M · OnboardingWizard** — приор. Medium  
- **Цель:** модалка: выбор провайдера → модель → открыть проект  
- **Файлы:** `app/src/components/OnboardingWizard.tsx`, `App.tsx`  
- **Действие:** 3 шага; показ при `!firstRunCompleted`; «Пропустить» → true  
- **Проверка:** первый запуск показывает визард; повторный — нет

**32 · S · Ссылка на example-prompts в визарде** — приор. Low  
- **Цель:** финальный шаг визарда — кнопка «Примеры запросов» → `docs/example-prompts.md`  
- **Файлы:** `OnboardingWizard.tsx`  
- **Действие:** `shell.openExternal` или открытие вики/GitHub  
- **Проверка:** клик открывает страницу с примерами

### 🔗 Экспорт и импорт чата

**33 · M · IPC export-chat** — приор. Medium  
- **Цель:** экспорт сообщений и метаданных чата в JSON  
- **Файлы:** `chats.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** `export-chat` → `{ messages, settings, projectPath }`; save dialog  
- **Проверка:** экспорт → файл валидный JSON с messages

**34 · M · IPC import-chat** — приор. Medium  
- **Цель:** импорт чата из JSON в новый чат в store  
- **Файлы:** `chats.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** open dialog → parse → `createChat` с messages  
- **Проверка:** импортированный чат отображает историю

### 🔗 Skill marketplace

**35 · M · Fetch remote skill manifest** — приор. Low  
- **Цель:** список навыков с GitHub raw URL или индекс-файла  
- **Файлы:** `app/electron/main/skills.ts`, `registerMiscIpc.ts`  
- **Действие:** `list-remote-skills(url)` → `{ name, description, url }[]`  
- **Проверка:** unit-тест с mock fetch на тестовый manifest.json

**36 · M · import-remote-skill UI** — приор. Low  
- **Цель:** кнопка «Импорт из каталога» в SkillsPanel  
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`  
- **Действие:** выбор из списка → download SKILL.md → локальный skill  
- **Проверка:** импорт skill из URL появляется в списке навыков

### 🔗 Автоматизации

**37 · M · AutomationRule в settings** — приор. Medium  
- **Цель:** тип `{ id, cron, prompt, enabled }` + Zod-массив в настройках  
- **Файлы:** `settings.ts`, `types.ts`  
- **Действие:** `automations: AutomationRule[]` с default `[]`  
- **Проверка:** `npm run typecheck`; сохранение массива в settings.json

**38 · M · automationScheduler в main** — приор. Medium  
- **Цель:** таймер проверяет cron-выражения и ставит промпт в очередь чата  
- **Файлы:** `app/electron/main/automationScheduler.ts`, `index.ts`  
- **Действие:** `node-cron` или setInterval + parse; emit в default chat  
- **Проверка:** unit-тест: rule `* * * * *` + mock time → enqueue вызван

**39 · M · AutomationsTab в настройках** — приор. Medium  
- **Цель:** CRUD автоматизаций: cron, промпт, вкл/выкл  
- **Файлы:** `SettingsModal/AutomationsTab.tsx`, `SettingsModal/index.tsx`  
- **Действие:** форма добавления; список с удалением  
- **Проверка:** созданная автоматизация сохраняется и видна после reopen settings

### 🔗 Сравнение моделей (A/B)

**40 · M · Дублировать промпт во второй чат** — приор. Low  
- **Цель:** кнопка «Сравнить с другой моделью» копирует промпт в новый чат  
- **Файлы:** `ChatPanel/index.tsx`, `ChatHistoryPanel.tsx`  
- **Действие:** `createChat` + тот же `input` + подсказка выбрать модель  
- **Проверка:** два чата с одинаковым первым сообщением пользователя

**41 · M · SplitChatView** — приор. Low  
- **Цель:** два чата side-by-side для сравнения ответов  
- **Файлы:** `app/src/App.tsx`, `SplitChatView.tsx`  
- **Действие:** режим «Сравнение» — два `ChatPanel` с общим projectPath  
- **Проверка:** оба чата видны одновременно; отправка в каждый независима

### 🔗 P2P-сервер

**42 · M · docker-compose для server/p2p** — приор. Medium  
- **Цель:** one-click деплой сигнального сервера + Redis  
- **Файлы:** `server/p2p/docker-compose.yml`, `server/p2p/README.md`, `docs/integrations.md`  
- **Действие:** сервисы `p2p` + `redis`; env-шаблон `.env.example`  
- **Проверка:** `docker compose up` → `GET /health` → 200

**43 · M · Dashboard статуса узлов** — приор. Low  
- **Цель:** `GET /admin/dashboard` — онлайн-узлы, задачи, кредиты (auth)  
- **Файлы:** `server/p2p/src/routes/admin.ts`  
- **Действие:** JSON `{ nodes, activeTasks, totalCredits }`  
- **Проверка:** интеграционный тест с mock-узлами

**44 · M · Рейтинг узлов по latency** — приор. Low  
- **Цель:** `router.ts` предпочитает узлы с меньшим средним RTT  
- **Файлы:** `server/p2p/src/router.ts`, `server/p2p/src/credits.ts`  
- **Действие:** хранить `avgLatencyMs` per node; сортировка при route  
- **Проверка:** unit-тест: два узла → выбирается с меньшей latency

### 🔗 Плагины

**45 · S · Документация plugin-authoring** — приор. Medium  
- **Цель:** гайд автора плагина: схема tool, пример `.js`, hot-reload  
- **Файлы:** `docs/plugin-authoring.md`, ссылка в `README.md`  
- **Действие:** минимальный working example + ограничения (только `.js`)  
- **Проверка:** файл существует; README ссылается на него

**46 · M · Валидация схемы tool при загрузке** — приор. Medium  
- **Цель:** невалидный плагин логируется и пропускается, не ломая остальные  
- **Файлы:** `app/electron/main/pluginLoader.ts`  
- **Действие:** Zod-схема `{ name, description, parameters }`; catch per plugin  
- **Проверка:** unit-тест: плагин без `name` → skip + остальные загружены

### 🔗 Интернационализация (i18n)

**47 · M · Инфраструктура i18n** — приор. Low  
- **Цель:** функция `t(key)` + `locales/ru.json` (текущие строки) + `en.json`  
- **Файлы:** `app/src/i18n/index.ts`, `app/src/i18n/locales/`  
- **Действие:** React context `I18nProvider`; fallback на ключ  
- **Проверка:** `t('settings.title')` возвращает строку на обоих языках

**48 · M · Переключатель языка в настройках** — приор. Low  
- **Цель:** `locale: 'ru' | 'en'` в settings + UI в BehaviorTab  
- **Файлы:** `settings.ts`, `BehaviorTab.tsx`, `App.tsx`  
- **Действие:** select «Язык»; `I18nProvider` читает settings.locale  
- **Проверка:** смена на en → хотя бы один переведённый заголовок меняется

**49 · M · i18n: строки App и шапки** — приор. Low  
- **Цель:** вынести строки `App.tsx` (кнопки, заголовки панелей) в locale-файлы  
- **Файлы:** `App.tsx`, `locales/ru.json`, `locales/en.json`  
- **Действие:** заменить литералы на `t('…')`  
- **Проверка:** en locale — шапка и «Настройки» на английском

**50 · M · i18n: SettingsModal** — приор. Low  
- **Цель:** перевести вкладки и подписи настроек  
- **Файлы:** `SettingsModal/*.tsx`, locale-файлы  
- **Действие:** ключи `settings.model.*`, `settings.behavior.*` и т.д.  
- **Проверка:** en locale — названия вкладок на английском

**51 · M · i18n: ChatPanel и сообщения UI** — приор. Low  
- **Цель:** перевести placeholder, кнопки отправки, статус-бар  
- **Файлы:** `ChatPanel/`, `AgentStatusBar.tsx`, locale-файлы  
- **Действие:** ключи `chat.*`, `status.*`  
- **Проверка:** en locale — placeholder поля ввода на английском

### 🔗 Рефакторинг монолитов (продолжение)

> Самые крупные файлы сейчас: `ModelTab.tsx` (~1100), `ChatPanel/index.tsx` (~980), `App.tsx` (~940), `ipcContracts.ts` (~790), `ChatHistoryPanel.tsx` (~740). Пп. 21–23 покрывают App/agent/ChatPanel; ниже — остальные.

**52 · M · ModelTab: формы провайдеров** — приор. Medium  
- **Цель:** вынести JSX-блоки `provider === '…'` в `ModelTab/providers/*.tsx`  
- **Файлы:** `SettingsModal/ModelTab.tsx` → `SettingsModal/ModelTab/providers/` (Ollama, DeepSeek, Gemini, …)  
- **Действие:** каждый провайдер — отдельный компонент с props `{ settings, onSettingsChange }`; ModelTab — switch по `modelProvider`  
- **Проверка:** `npm run typecheck`; смена провайдера в настройках работает как раньше

**53 · M · ModelTab: оркестратор, бенчмарк, канал обновлений** — приор. Medium  
- **Цель:** вынести нижнюю часть ModelTab (~300 строк) в отдельные секции  
- **Файлы:** `OrchestratorSection.tsx`, `BenchmarkSection.tsx`, `UpdateChannelSection.tsx` в `SettingsModal/ModelTab/`  
- **Действие:** перенести GGUF-download, benchmark, orchestrator toggle, beta-channel без изменения логики  
- **Проверка:** бенчмарк и скачивание GGUF работают; `ModelTab.tsx` < 400 строк

**54 · M · ipcContracts: Zod-схемы данных** — приор. Medium  
- **Цель:** схемы `ChatMessage`, `AgentSettings`, `SavedChat` и др. — в `shared/ipc/schemas.ts`  
- **Файлы:** `shared/ipcContracts.ts` → `shared/ipc/schemas.ts`  
- **Действие:** re-export из `ipcContracts.ts` для обратной совместимости импортов  
- **Проверка:** `npm run typecheck`; импорты `ChatMessageSchema` не сломаны

**55 · M · ipcContracts: IPC enum и Contracts** — приор. Medium  
- **Цель:** объект `IPC` и `Contracts` — в `shared/ipc/channels.ts`  
- **Файлы:** `shared/ipcContracts.ts` → `shared/ipc/channels.ts`  
- **Действие:** `ipcContracts.ts` — barrel re-export; `parseIpcArgs` остаётся рядом с Contracts  
- **Проверка:** `npm run typecheck`; preload и register*Ipc компилируются

**56 · M · ChatHistoryPanel: виртуализированный список** — приор. Low  
- **Цель:** JSX рендера `FlatItem` и virtualizer — в `ChatHistoryList.tsx`  
- **Файлы:** `ChatHistoryPanel.tsx` → `ChatHistoryList.tsx`  
- **Действие:** props: `items`, `activeChatId`, `onSelect`; панель — композиция + toolbar  
- **Проверка:** скролл длинной истории чатов без регрессий

**57 · M · ChatHistoryPanel: DnD и диалоги** — приор. Low  
- **Цель:** drag-and-drop, Prompt/Confirm state — в `useChatHistoryDnD.ts`  
- **Файлы:** `ChatHistoryPanel.tsx`, `useChatHistoryDnD.ts`  
- **Действие:** хук возвращает handlers и dialog state; панель < 400 строк  
- **Проверка:** перетаскивание чата в папку работает

**58 · M · types.ts: доменные модули** — приор. Low  
- **Цель:** разнести ~720 строк на `types/chat.ts`, `types/settings.ts`, `types/memory.ts`, `types/api.ts`  
- **Файлы:** `app/src/types/` (новая папка), `types.ts` — re-export  
- **Действие:** `CodeViperAPI` в `api.ts`; `AgentSettings` в `settings.ts`  
- **Проверка:** `npm run typecheck`; нет циклических импортов

**59 · M · agentContext: RAG-hints** — приор. Low  
- **Цель:** grep-nudge и `maybeAppendRagSearchHintAfterEmptyGrep` — в `agentContextRag.ts`  
- **Файлы:** `agentContext.ts` → `agentContextRag.ts`  
- **Действие:** re-export из `agentContext.ts`  
- **Проверка:** `npm test` — существующие тесты RAG-hint зелёные

**60 · M · agentContext: preview и prepare** — приор. Low  
- **Цель:** `buildAgentContextPreview`, `prepareAgentRunContext`, `summarizeChatHistory` — в `agentContextBuild.ts`  
- **Файлы:** `agentContext.ts` → `agentContextBuild.ts`  
- **Действие:** `agentContext.ts` < 150 строк, только re-export и `OllamaMessage`  
- **Проверка:** `npm run typecheck`; превью контекста в UI открывается

**61 · M · services.ts: файловые операции** — приор. Medium  
- **Цель:** `safeRead*`, `safeWrite*`, `buildFileTree`, кэши — в `fileServices.ts`  
- **Файлы:** `services.ts` → `fileServices.ts`  
- **Действие:** `services.ts` re-export для handler-импортов  
- **Проверка:** `npm test -- services` зелёный

**62 · M · services.ts: runCommand** — приор. Medium  
- **Цель:** `validateCommand`, `normalizeCommand`, `runCommand`, лимит буфера — в `commandRunner.ts`  
- **Файлы:** `services.ts` → `commandRunner.ts`  
- **Действие:** handlers импортируют из `commandRunner.ts` или barrel `services.ts`  
- **Проверка:** `npm test -- services.test` — validateCommand и buffer limit

**63 · M · useAgentStream: обработчики событий** — приор. Low  
- **Цель:** switch по `AgentStreamEvent.type` — в `agentStreamHandlers.ts`  
- **Файлы:** `useAgentStream.ts` → `agentStreamHandlers.ts`  
- **Действие:** чистые функции `(event, ctx) => partialState`; хук — подписка и setState  
- **Проверка:** `npm run typecheck`; стрим агента в UI без регрессий

**64 · M · preload: группы API** — приор. Low  
- **Цель:** `codeviper` object разбить на `preload/agentApi.ts`, `preload/chatApi.ts`, `preload/fileApi.ts`  
- **Файлы:** `electron/preload/index.ts`, `electron/preload/*.ts`  
- **Действие:** `Object.assign` или spread в `contextBridge.exposeInMainWorld`  
- **Проверка:** `npm run typecheck`; `window.codeviper.*` доступен в renderer

**65 · M · agentTools/core: files / git / package** — приор. Low  
- **Цель:** `FILE_TOOLS`, `GIT_TOOLS`, `PACKAGE_TOOLS` — в отдельные файлы (~200 строк каждый)  
- **Файлы:** `agentTools/core.ts` → `coreFiles.ts`, `coreGit.ts`, `corePackage.ts`; `core.ts` — сборка  
- **Действие:** `getAgentTools()` без изменений снаружи  
- **Проверка:** `npm run typecheck`; список инструментов агента тот же

**66 · S · Поиск по истории чатов** — приор. Medium  
- **Цель:** поле фильтра в `ChatHistoryPanel` по заголовку и последнему сообщению  
- **Файлы:** `ChatHistoryPanel.tsx`  
- **Действие:** `searchQuery` state + `useMemo` фильтр `FlatItem`  
- **Проверка:** ввод текста сужает список чатов

### 🔗 CI и покрытие тестами

**67 · M · E2E: smoke настройки и отправка** — приор. Medium  
- **Цель:** Playwright-тест: открыть настройки → закрыть → ввести промпт (mock LLM)  
- **Файлы:** `app/tests/e2e/smoke.spec.ts`  
- **Действие:** `CODEVIPER_E2E=1`; stub agent-stream или пустой ответ  
- **Проверка:** `npm run test:e2e` — новый тест зелёный в CI

**68 · M · Coverage пороги electron/main** — приор. Medium  
- **Цель:** расширить `vitest.config.ts` coverage на `agentLoopGuard.ts`, `runCheckpoint.ts`, `commandRunner.ts`  
- **Файлы:** `vitest.config.ts`, тесты в `tests/`  
- **Действие:** `include` + thresholds 50% branches для выбранных модулей  
- **Проверка:** `npm test -- --coverage` проходит пороги в CI

---

## ✅ Сделано

- Чистка кода: `loadPlugins` через `readdirSync({ withFileTypes: true })` без `statSync`; контекстное меню — Cut в одном условии `isEditable && selectionText`

- pluginLoader: `delete require.cache` перед `require` + перезагрузка плагинов при каждом `getPluginTools()`; отпечаток плагинов в ключе `transformedToolsCache` — правки `.js` видны без перезапуска

- pluginLoader: `statSync` внутри `try/catch` — ENOENT при исчезновении файла плагина не прерывает загрузку остальных

- Дашборд метрик агента: `agentLogger.readMetrics(days)` парсит NDJSON-логи → агрегация по моделям (прогоны, % успеха, токены, стоимость, инструменты); IPC `get-agent-metrics`; `MetricsPanel.tsx` с карточками сводки, таблицей по моделям и топ-10 инструментов; кнопка «Метрики» в шапке; `status: ok|error` в событии `run_end`

- Повтор прогона с шага из TracePanel: кнопка ↩ на `llm_request`-событиях трейса → реконструкция истории до выбранного шага → `replayRun` в `useMessageQueue`; `replayFromStep` в `ChatPanelHandle`

- isInsideProject регистрозависимость: toLowerCase только на win32; unit-тесты для Windows и не-Windows платформ

- AgentRunner options-объект: интерфейс `AgentRunnerOptions` + деструктуризация в конструкторе; удалён мёртвый параметр `_summarizeModel`; убран `resolveSummarizeModel` из registerAgentIpc; обновлены все call sites (agent.ts P2P, registerAgentIpc.ts, тесты)

- Лимит буфера runCommand: `COMMAND_OUTPUT_BUFFER_LIMIT_BYTES = 10 МБ` в `constants.ts`; счётчик байт в обработчиках `data` → `killProcessTree` + сообщение «вывод обрезан» при превышении; unit-тест в `services.test.ts`

- Библиотека промптов / слэш-шаблоны: `PromptTemplate` в типах + Zod-schema; `matchSlashCommands`/`expandSlashCommand` принимают пользовательские шаблоны (с приоритетом над встроенными); CRUD-секция в BehaviorTab (добавить/удалить), ChatPanel передаёт `settings.promptTemplates`
- ErrorBoundary в renderer: `ErrorBoundary` class-компонент с `getDerivedStateFromError` + fallback «Перезагрузить» обёртывает корень App — белый экран при исключении заменён информативным UI
- Сокращение any + порог coverage в CI: убраны ~60 явных `args: any` из всех agentHandlers-файлов (контекстуальный вывод от `Partial<ToolHandlers>`); v8-coverage с порогами 60/50/60/60% для `shared/` и `services.ts` в `vitest.config.ts`; CI запускает `npm test -- --coverage`
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
- E2E на Linux/macOS: матрица `ubuntu-latest`/`macos-latest`, отдельный job `e2e`; `--no-sandbox` on Linux; `CODEVIPER_E2E=1` пропускает git-sync
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
