# Дорожная карта CodeViper

Задачи для самоулучшения агента. Выполненное — [ROADMAP_DONE.md](ROADMAP_DONE.md). Назад в [README](README.md).

### Формат задач для самообучения агента

Каждый пункт следует **одному шаблону** — агент читает `ROADMAP.md` и строит `set_self_improvement_plan`.

**Шаблон пункта:**

```text
N · [S/M/L/XL] · Краткое название — уровень 1|2|3|4
- Цель: один измеримый результат
- Файлы: конкретные пути (app/electron/main/…, app/src/…)
- Действие: одна атомарная правка
- Проверка: npm run typecheck | npm test -- … | сценарий в UI
```

**Промпт:** `Выполни пункт N из ROADMAP.md — самоулучшение CodeViper.`

**Правила:** пункты **1…126**; внутри цепочки — строго по порядку.

## 📋 В планах

> Пункты **1…126**. Цепочки 🔗 — строгий порядок внутри группы: split/preview (готово), plan **10–11**, onboarding **12–14**, редактор **41–42**, worktree **46–48**, LSP **70–72**, i18n **125–128**.

### 🟠 Уровень 2 — высокая польза

> Ежедневный UX, превью файлов, onboarding, провайдеры, субагенты, E2E, ModelTab. Пункты **5–50** — выполнять сверху вниз; цепочки см. шапку раздела.










**1 · S · Сохранение светлой темы в settings** — уровень 2
- **Цель:** `lightMode` не сбрасывается после перезапуска (`App.tsx` сейчас только `useState`)  
- **Файлы:** `settings.ts`, `types.ts`, `App.tsx`  
- **Действие:** `uiLightMode: boolean` в Zod; загрузка при старте  
- **Проверка:** включить ☀️ → перезапуск → тема сохранена


**2 · M · Quick Open — палитра файлов Ctrl+P** — уровень 2
- **Цель:** fuzzy search по project tree → открыть превью  
- **Файлы:** `QuickOpenPalette.tsx`, `App.tsx`  
- **Действие:** модалка + IPC `get-project-tree`; Enter → `onFileOpen`  
- **Проверка:** Ctrl+P → ввод → Enter открывает файл


**3 · S · Ctrl+` — переключить терминал** — уровень 2
- **Цель:** быстро показать/скрыть `TerminalPanel` без мыши  
- **Файлы:** `App.tsx`, `KeyboardShortcutsModal.tsx`  
- **Действие:** toggle state `terminalVisible` по Ctrl+`  
- **Проверка:** терминал показывается/скрывается


**4 · M · Недавние проекты** — уровень 2
- **Цель:** список последних 10 `projectPath` в WelcomePanel и меню «Открыть»  
- **Файлы:** `settings.ts`, `WelcomePanel.tsx`, `App.tsx`  
- **Действие:** `recentProjects: string[]` при `selectProjectFolder`  
- **Проверка:** после открытия 2 проектов оба в списке


**5 · M · planBeforeExecute в настройках** — уровень 2
- **Цель:** тумблер «Сначала показать план» в BehaviorTab  
- **Файлы:** `settings.ts`, `BehaviorTab.tsx`, `types.ts`  
- **Действие:** `planBeforeExecute: boolean` в Zod-схеме с default `false`  
- **Проверка:** настройка сохраняется и загружается


**6 · M · Пауза после плана до подтверждения** — уровень 2
- **Цель:** при `planBeforeExecute` оркестратор показывает план и ждёт кнопку «Выполнить»  
- **Файлы:** `agent.ts`, `orchestratorModel.ts`, `ChatPanel/index.tsx`  
- **Действие:** emit `plan_awaiting_confirm`; UI-кнопка продолжает прогон  
- **Проверка:** с включённым тумблером агент не вызывает tools до «Выполнить»


**7 · M · Флаг firstRunCompleted** — уровень 2
- **Цель:** `firstRunCompleted: boolean` в settings; false при первой установке  
- **Файлы:** `settings.ts`, `types.ts`  
- **Действие:** поле в Zod с default `false`; true после завершения визарда  
- **Проверка:** чистый settings.json → `firstRunCompleted === false`


**8 · M · OnboardingWizard** — уровень 2
- **Цель:** модалка: выбор провайдера → модель → открыть проект  
- **Файлы:** `app/src/components/OnboardingWizard.tsx`, `App.tsx`  
- **Действие:** 3 шага; показ при `!firstRunCompleted`; «Пропустить» → true  
- **Проверка:** первый запуск показывает визард; повторный — нет


**9 · S · Ссылка на example-prompts в визарде** — уровень 2
- **Цель:** финальный шаг визарда — кнопка «Примеры запросов» → `docs/example-prompts.md`  
- **Файлы:** `OnboardingWizard.tsx`  
- **Действие:** `shell.openExternal` или открытие вики/GitHub  
- **Проверка:** клик открывает страницу с примерами


**10 · M · OpenAI-compatible произвольный endpoint** — уровень 2
- **Цель:** провайдер `custom` — `baseUrl` + `apiKey` + model id (LM Studio, vLLM)  
- **Файлы:** `openaiProvider.ts`, `modelRuntime.ts`, `ModelTab/providers/`  
- **Действие:** переиспользовать OpenAI client с custom baseURL  
- **Проверка:** ping к mock server


**11 · M · Цепочка fallback моделей** — уровень 2
- **Цель:** `fallbackModels: string[]` — при ошибке провайдера пробовать следующую  
- **Файлы:** `agentContextManager.ts`, `settings.ts`, `BehaviorTab.tsx`  
- **Действие:** loop в `AgentRunner` при 429/5xx  
- **Проверка:** mock: primary fail → secondary ok


**12 · S · Чип прогресса индексации** — уровень 2
- **Цель:** «Индекс 42%» в `AgentStatusBar` при `index_project`  
- **Файлы:** `AgentStatusBar.tsx`, stream event `index_progress`  
- **Действие:** подписка на `index_progress` → обновление чипа  
- **Проверка:** чип виден во время индексации


**13 · S · Ручная переиндексация** — уровень 2
- **Цель:** кнопка в `ProjectTreePanel` ПКМ → «Переиндексировать»  
- **Файлы:** `ProjectTreePanel.tsx`, IPC вызов `index_project`  
- **Действие:** пункт меню → `index_project` для текущего `projectPath`  
- **Проверка:** индексация запускается


**14 · M · Аудит focus trap в модалках** — уровень 2
- **Цель:** все `role="dialog"` используют `useModalA11y` + Tab cycle  
- **Файлы:** модалки без хука (`MetricsPanel`, `TracePanel`, …)  
- **Действие:** подключить `useModalA11y`; initial focus на первый интерактивный элемент  
- **Проверка:** Tab не уходит за пределы открытой модалки


**15 · S · aria-live для статуса агента** — уровень 2
- **Цель:** screen reader объявляет «Агент работает» / «Готово»  
- **Файлы:** `AgentStatusBar.tsx`  
- **Действие:** `aria-live="polite"` region с текстом фазы  
- **Проверка:** accessibility inspector показывает live region


**16 · M · Просмотр NDJSON-логов агента** — уровень 2
- **Цель:** вкладка или панель «Логи» — tail `agent-*.ndjson`  
- **Файлы:** `agentLogger.ts`, `LogViewerPanel.tsx`, IPC `read-agent-logs`  
- **Действие:** фильтр по event type; последние 500 строк  
- **Проверка:** после прогона логи видны в UI


**17 · S · Подтверждение внешних ссылок** — уровень 2
- **Цель:** клик по `http(s)` в MessageBody → ConfirmDialog перед `openExternal`  
- **Файлы:** `MessageBody.tsx`, `App.tsx`  
- **Действие:** перехват click на `<a>`  
- **Проверка:** без подтверждения браузер не открывается


**18 · M · Клик по пути в code block → открыть файл** — уровень 2
- **Цель:** `src/foo.ts:12` в коде → открыть в превью (п. 8–10)  
- **Файлы:** `MessageBody.tsx`, `App.tsx`  
- **Действие:** regex path:line; IPC read + preview  
- **Проверка:** клик открывает файл на строке


**19 · M · Субагент Reviewer** — уровень 2
- **Цель:** `delegate_to_reviewer` — read-only обзор diff без правок  
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`, `agent.ts`  
- **Проверка:** unit-тест контракта; чип «Ревью…»


**20 · M · Субагент Tester** — уровень 2
- **Цель:** `delegate_to_tester` — только `run_tests` / `run_command` test  
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`  
- **Проверка:** не вызывает write_file


### 🔗 Дополнительные инструменты агента

**21 · M · git_blame и git_show** — уровень 2
- **Цель:** read-only `git_blame` (path, line?) и `git_show` (commit, path?)
- **Файлы:** `gitTools.ts`, `agentTools/core.ts`, `agentHandlersProject.ts`
- **Действие:** лимит строк вывода; только внутри projectPath
- **Проверка:** unit-тест temp git repo


**22 · M · diff_files** — уровень 2
- **Цель:** unified diff двух файлов проекта без git
- **Файлы:** `diffUtil.ts`, `agentTools/core.ts`, `agentHandlersProjectFile.ts`
- **Действие:** параметры `path_a`, `path_b`; оба внутри projectPath
- **Проверка:** unit-тест на два fixture-файла


**23 · M · read_agent_log** — уровень 2
- **Цель:** tool `read_agent_log` — tail `agent-*.ndjson` (до UI LogViewerPanel)
- **Файлы:** `agentLogger.ts`, `agentTools/integrations.ts`, handler
- **Действие:** параметры `lines?` (default 100), `event?`; NDJSON → текст
- **Проверка:** unit-тест на fixture log file


**24 · M · npm_install / add_package** — уровень 2
- **Цель:** безопасная установка зависимостей без произвольного `run_command`
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`, `commandRunner.ts`
- **Действие:** `npm_install` с `package`, `dev?`; блок `&&` и лишних флагов
- **Проверка:** unit-тест: опасная строка → отказ


**25 · S · create_pr vs create_codeviper_pr** — уровень 2
- **Цель:** агент не путает PR проекта и PR исходников CodeViper
- **Файлы:** `agentTools/integrations.ts`, `agentTools/mcp.ts`, `defaultSkills.ts`
- **Действие:** descriptions: `create_pr` — проект; `create_codeviper_pr` — CodeViper
- **Проверка:** grep descriptions содержит «проект» и «CodeViper»


**26 · M · E2E: smoke настройки и отправка** — уровень 2
- **Цель:** Playwright-тест: открыть настройки → закрыть → ввести промпт (mock LLM)  
- **Файлы:** `app/e2e/smoke.spec.ts`  
- **Действие:** `CODEVIPER_E2E=1`; stub agent-stream или пустой ответ  
- **Проверка:** `npm run test:e2e` — новый тест зелёный в CI


**27 · M · Component test MessageRow** — уровень 2
- **Цель:** vitest + @testing-library/react для pin/retry menu  
- **Файлы:** `tests/MessageRow.test.tsx`, vitest config jsdom  
- **Проверка:** `npm test -- MessageRow`


**28 · M · E2E: навигация по вкладкам настроек** — уровень 2
- **Файлы:** `e2e/settings.test.ts`  
- **Проверка:** `npm run test:e2e`


**29 · S · docs/troubleshooting.md** — уровень 2
- **Цель:** GPUCache, чёрный экран, plugins, portable Node  
- **Файлы:** `docs/troubleshooting.md`, ссылка в README  
- **Проверка:** README ссылается на troubleshooting


**30 · S · README: Linux и macOS в быстром старте** — уровень 2
- **Цель:** бейджи платформ, ссылки на AppImage/DMG и `CodeViper.sh` из релизов  
- **Файлы:** `README.md`  
- **Действие:** дополнить «Быстрый старт» установкой не только через Windows-установщик  
- **Проверка:** README содержит AppImage, dmg и POSIX-лаунчер


**31 · M · ModelTab: формы провайдеров** — уровень 2
- **Цель:** вынести JSX-блоки `provider === '…'` в `ModelTab/providers/*.tsx`  
- **Файлы:** `SettingsModal/ModelTab.tsx` → `SettingsModal/ModelTab/providers/` (Ollama, DeepSeek, Gemini, …)  
- **Действие:** каждый провайдер — отдельный компонент с props `{ settings, onSettingsChange }`; ModelTab — switch по `modelProvider`  
- **Проверка:** `npm run typecheck`; смена провайдера в настройках работает как раньше


**32 · M · ModelTab: оркестратор, бенчмарк, канал обновлений** — уровень 2
- **Цель:** вынести нижнюю часть ModelTab (~300 строк) в отдельные секции  
- **Файлы:** `OrchestratorSection.tsx`, `BenchmarkSection.tsx`, `UpdateChannelSection.tsx` в `SettingsModal/ModelTab/`  
- **Действие:** перенести GGUF-download, benchmark, orchestrator toggle, beta-channel без изменения логики  
- **Проверка:** бенчмарк и скачивание GGUF работают; `ModelTab.tsx` < 400 строк


**33 · M · Экспорт чата в Markdown** — уровень 2
- **Цель:** кнопка в меню чата → `.md` с ролями и код-блоками  
- **Файлы:** `ChatHistoryPanel.tsx`, `chats.ts`, `registerChatsIpc.ts`  
- **Действие:** `export-chat-markdown` IPC + save dialog  
- **Проверка:** файл читается в любом MD-viewer


**34 · M · IPC export-chat** — уровень 2
- **Цель:** экспорт сообщений и метаданных чата в JSON  
- **Файлы:** `chats.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** `export-chat` → `{ messages, settings, projectPath }`; save dialog  
- **Проверка:** экспорт → файл валидный JSON с messages


**35 · M · IPC import-chat** — уровень 2
- **Цель:** импорт чата из JSON в новый чат в store  
- **Файлы:** `chats.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** open dialog → parse → `createChat` с messages  
- **Проверка:** импортированный чат отображает историю


**36 · M · CodeEditorPanel на CodeMirror** — уровень 2
- **Цель:** редактируемая вкладка файла вместо read-only `FilePreviewPanel` (п. 9)  
- **Файлы:** `app/src/components/CodeEditorPanel.tsx`, `app/package.json`  
- **Действие:** зависимость `@codemirror/*`; обёртка с темой под тёмный UI  
- **Проверка:** файл открывается в редакторе; курсор и правка работают


**37 · M · Сохранение из редактора** — уровень 2
- **Цель:** Ctrl+S / кнопка «Сохранить» пишет файл через существующий IPC  
- **Файлы:** `CodeEditorPanel.tsx`, `app/electron/main/ipc/registerFileIpc.ts`  
- **Действие:** `window.codeviper.writeFile(path, content)`; индикатор «несохранено»  
- **Проверка:** правка + сохранение → содержимое на диске изменилось


### 🟡 Уровень 3 — средняя польза

> Символы, worktree, рефакторинг IPC/services, интеграции, LSP, автоматизации, P2P. Пункты **52–96**.

**38 · M · find_symbol для Go** — уровень 3
- **Цель:** `find_symbol` / `find_references` для `.go` через `go/ast` или tree-sitter  
- **Файлы:** `app/electron/main/symbolIndex.ts`, `agentHandlersProjectSearch.ts`  
- **Действие:** парсер Go → символы с `path:line:col`  
- **Проверка:** `npm test -- symbolIndex` — кейс с тестовым `.go` файлом


**39 · M · find_symbol для Rust** — уровень 3
- **Цель:** символы для `.rs` (tree-sitter-rust или синтаксический обход)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** расширить `walkProjectForSymbols` для `.rs`  
- **Проверка:** unit-тест: `fn main` и `struct Foo` находятся по имени


**40 · M · find_symbol для Java** — уровень 3
- **Цель:** символы для `.java` (class/method)  
- **Файлы:** `symbolIndex.ts`  
- **Действие:** regex или tree-sitter-java для объявлений top-level  
- **Проверка:** unit-тест на простом `.java` с `public class Bar`


**41 · M · gitWorktree.ts** — уровень 3
- **Цель:** create / remove / list worktrees через `git worktree`  
- **Файлы:** `app/electron/main/gitWorktree.ts` (новый), `gitTools.ts`  
- **Действие:** `createWorktree(repoPath, branch)` → путь worktree; `removeWorktree`  
- **Проверка:** unit-тест с temp git repo; `git worktree list` содержит запись


**42 · M · worktreePath в чате + IPC** — уровень 3
- **Цель:** поле `worktreePath?` в persisted chat; IPC `create-chat-worktree`  
- **Файлы:** `chats.ts`, `types.ts`, `registerChatsIpc.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** кнопка «Изолировать в worktree» в меню чата  
- **Проверка:** новый чат получает отдельную папку worktree


**43 · M · AgentRunner — корень worktree** — уровень 3
- **Цель:** если у чата есть `worktreePath`, агент работает в нём, а не в `projectPath`  
- **Файлы:** `agent.ts`, `registerAgentIpc.ts`, `agentHandlersProjectContext.ts`  
- **Действие:** `resolveProjectRoot(chat)` → `worktreePath ?? projectPath`  
- **Проверка:** правка файла в изолированном чате не затрагивает основную копию


**44 · M · ipcContracts: Zod-схемы данных** — уровень 3
- **Цель:** схемы `ChatMessage`, `AgentSettings`, `SavedChat` и др. — в `shared/ipc/schemas.ts`  
- **Файлы:** `shared/ipcContracts.ts` → `shared/ipc/schemas.ts`  
- **Действие:** re-export из `ipcContracts.ts` для обратной совместимости импортов  
- **Проверка:** `npm run typecheck`; импорты `ChatMessageSchema` не сломаны


**45 · M · ipcContracts: IPC enum и Contracts** — уровень 3
- **Цель:** объект `IPC` и `Contracts` — в `shared/ipc/channels.ts`  
- **Файлы:** `shared/ipcContracts.ts` → `shared/ipc/channels.ts`  
- **Действие:** `ipcContracts.ts` — barrel re-export; `parseIpcArgs` остаётся рядом с Contracts  
- **Проверка:** `npm run typecheck`; preload и register*Ipc компилируются


**46 · M · services.ts: файловые операции** — уровень 3
- **Цель:** `safeRead*`, `safeWrite*`, `buildFileTree`, кэши — в `fileServices.ts`  
- **Файлы:** `services.ts` → `fileServices.ts`  
- **Действие:** `services.ts` re-export для handler-импортов  
- **Проверка:** `npm test -- services` зелёный


**47 · M · services.ts: runCommand** — уровень 3
- **Цель:** `validateCommand`, `normalizeCommand`, `runCommand`, лимит буфера — в `commandRunner.ts`  
- **Файлы:** `services.ts` → `commandRunner.ts`  
- **Действие:** handlers импортируют из `commandRunner.ts` или barrel `services.ts`  
- **Проверка:** `npm test -- services.test` — validateCommand и buffer limit


**48 · S · Поиск в MemoryPanel** — уровень 3
- **Файлы:** `MemoryPanel.tsx`  
- **Действие:** filter по тексту и category  
- **Проверка:** поиск сужает список


**49 · M · Импорт skill из файла** — уровень 3
- **Цель:** кнопка «Импорт .md» → copy в skills dir  
- **Файлы:** `SkillsPanel.tsx`, IPC `import-skill-file`  
- **Проверка:** skill появляется в списке


**50 · S · Шаблоны MCP-серверов** — уровень 3
- **Цель:** кнопки «+ filesystem», «+ fetch» с готовым JSON конфигом  
- **Файлы:** `IntegrationsTab.tsx`, `docs/integrations.md`  
- **Проверка:** шаблон добавляет запись в settings


**51 · S · Slash /lint** — уровень 3
- **Файлы:** `shared/slashCommands.ts`  
- **Действие:** expand → `npm run lint` + исправить  
- **Проверка:** `/lint` в меню slash


**52 · S · Slash /build** — уровень 3
- **Файлы:** `shared/slashCommands.ts`  
- **Действие:** expand → `npm run build` + исправить ошибки  
- **Проверка:** `/build` в автодополнении


**53 · S · Slash /security** — уровень 3
- **Файлы:** `shared/slashCommands.ts`  
- **Действие:** expand → review на секреты, injection, unsafe commands  
- **Проверка:** `/security` в списке


**54 · S · Ctrl+Shift+T — экспорт трейса** — уровень 3
- **Файлы:** `App.tsx`, `TracePanel.tsx`  
- **Действие:** если trace open → export; иначе открыть TracePanel  
- **Проверка:** shortcut в модалке `?`


**55 · S · Кнопка «Очистить» в терминале** — уровень 3
- **Файлы:** `TerminalPanel.tsx`  
- **Проверка:** output сбрасывается


**56 · S · Очередь: удалить элемент** — уровень 3
- **Цель:** кнопка ✕ у каждого сообщения в очереди (`AgentStatusBar` / queue UI)  
- **Файлы:** `AgentStatusBar.tsx`, `QueueContext.tsx`  
- **Действие:** `removeFromQueue(index)` IPC или context  
- **Проверка:** элемент исчезает, остальные выполняются


**57 · S · Skip link «К содержимому»** — уровень 3
- **Цель:** скрытая ссылка в начале `App.tsx` → `#main-chat`  
- **Файлы:** `App.tsx`, `styles.css`  
- **Действие:** `:focus` показывает ссылку  
- **Проверка:** Tab с первого элемента → skip → фокус в чате


**58 · S · Экспорт метрик в CSV** — уровень 3
- **Цель:** кнопка в `MetricsPanel` → CSV byModel + topTools  
- **Файлы:** `MetricsPanel.tsx`  
- **Действие:** blob download  
- **Проверка:** CSV открывается в Excel


**59 · S · Документация plugin-authoring** — уровень 3
- **Цель:** гайд автора плагина: схема tool, пример `.js`, hot-reload  
- **Файлы:** `docs/plugin-authoring.md`, ссылка в `README.md`  
- **Действие:** минимальный working example + ограничения (только `.js`)  
- **Проверка:** файл существует; README ссылается на него


**60 · M · Провайдер Mistral** — уровень 3
- **Цель:** `modelProvider: 'mistral'` через Mistral API  
- **Файлы:** `mistralProvider.ts`, `modelRuntime.ts`, `constants.ts`  
- **Действие:** `StreamingChatProvider` + список моделей  
- **Проверка:** unit-тест stream parser


**61 · M · Bitbucket: create_pull_request** — уровень 3
- **Цель:** tool `create_bitbucket_pr` через REST API 2.0  
- **Файлы:** `bitbucketTools.ts`, `agentTools/integrations.ts`, `IntegrationsTab.tsx`  
- **Действие:** token + workspace/repo в settings  
- **Проверка:** unit-тест с mock fetch


**62 · M · Azure DevOps: create_work_item** — уровень 3
- **Цель:** tool `create_ado_work_item` (PAT + org/project)  
- **Файлы:** `adoTools.ts`, `integrations.ts`, settings  
- **Действие:** WIQL/create work item REST  
- **Проверка:** mock API test


**63 · S · Discord webhook** — уровень 3
- **Цель:** `discordWebhookUrl` — уведомление «агент готов» в Discord  
- **Файлы:** `webhookNotify.ts`, `IntegrationsTab.tsx`, `settings.ts`  
- **Действие:** POST embed JSON  
- **Проверка:** unit-тест payload


**64 · S · Telegram Bot уведомления** — уровень 3
- **Цель:** `telegramBotToken` + `telegramChatId` в настройках  
- **Файлы:** `webhookNotify.ts`, `IntegrationsTab.tsx`  
- **Действие:** `sendMessage` API  
- **Проверка:** mock fetch test


**65 · M · lspClient — spawn language server** — уровень 3
- **Цель:** main-процесс запускает `typescript-language-server` / `pyright-langserver` по расширению файла  
- **Файлы:** `app/electron/main/lspClient.ts` (новый)  
- **Действие:** JSON-RPC over stdio; `didOpen`/`didChange`/`shutdown`  
- **Проверка:** unit-тест с mock child_process; лог «LSP ready» для `.ts`


**66 · M · LSP hover и go-to-definition (TS/JS)** — уровень 3
- **Цель:** hover tooltip и Ctrl+click → переход к определению в `CodeEditorPanel` (п. 50)  
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`  
- **Действие:** IPC `lsp-request` → `textDocument/hover`, `textDocument/definition`  
- **Проверка:** Ctrl+click на символ → курсор на определении в том же файле


**67 · M · LSP pyright для Python** — уровень 3
- **Цель:** те же hover/definition для `.py` через pyright-langserver  
- **Файлы:** `lspClient.ts`  
- **Действие:** ветка выбора сервера по `languageFromPath`; инициализация pyright  
- **Проверка:** Ctrl+click на `def foo` в `.py` → переход к определению


**68 · M · Fetch remote skill manifest** — уровень 3
- **Цель:** список навыков с GitHub raw URL или индекс-файла  
- **Файлы:** `app/electron/main/skills.ts`, `registerMiscIpc.ts`  
- **Действие:** `list-remote-skills(url)` → `{ name, description, url }[]`  
- **Проверка:** unit-тест с mock fetch на тестовый manifest.json


**69 · M · import-remote-skill UI** — уровень 3
- **Цель:** кнопка «Импорт из каталога» в SkillsPanel  
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`  
- **Действие:** выбор из списка → download SKILL.md → локальный skill  
- **Проверка:** импорт skill из URL появляется в списке навыков


**70 · M · AutomationRule в settings** — уровень 3
- **Цель:** тип `{ id, cron, prompt, enabled }` + Zod-массив в настройках  
- **Файлы:** `settings.ts`, `types.ts`  
- **Действие:** `automations: AutomationRule[]` с default `[]`  
- **Проверка:** `npm run typecheck`; сохранение массива в settings.json


**71 · M · automationScheduler в main** — уровень 3
- **Цель:** таймер проверяет cron-выражения и ставит промпт в очередь чата  
- **Файлы:** `app/electron/main/automationScheduler.ts`, `index.ts`  
- **Действие:** `node-cron` или setInterval + parse; emit в default chat  
- **Проверка:** unit-тест: rule `* * * * *` + mock time → enqueue вызван


**72 · M · AutomationsTab в настройках** — уровень 3
- **Цель:** CRUD автоматизаций: cron, промпт, вкл/выкл  
- **Файлы:** `SettingsModal/AutomationsTab.tsx`, `SettingsModal/index.tsx`  
- **Действие:** форма добавления; список с удалением  
- **Проверка:** созданная автоматизация сохраняется и видна после reopen settings


**73 · M · Дублировать промпт во второй чат** — уровень 3
- **Цель:** кнопка «Сравнить с другой моделью» копирует промпт в новый чат  
- **Файлы:** `ChatPanel/index.tsx`, `ChatHistoryPanel.tsx`  
- **Действие:** `createChat` + тот же `input` + подсказка выбрать модель  
- **Проверка:** два чата с одинаковым первым сообщением пользователя


**74 · M · SplitChatView** — уровень 3
- **Цель:** два чата side-by-side для сравнения ответов  
- **Файлы:** `app/src/App.tsx`, `SplitChatView.tsx`  
- **Действие:** режим «Сравнение» — два `ChatPanel` с общим projectPath  
- **Проверка:** оба чата видны одновременно; отправка в каждый независима


**75 · M · docker-compose для server/p2p** — уровень 3
- **Цель:** one-click деплой сигнального сервера + Redis  
- **Файлы:** `server/p2p/docker-compose.yml`, `server/p2p/README.md`, `docs/integrations.md`  
- **Действие:** сервисы `p2p` + `redis`; env-шаблон `.env.example`  
- **Проверка:** `docker compose up` → `GET /health` → 200


**76 · M · Dashboard статуса узлов** — уровень 3
- **Цель:** `GET /admin/dashboard` — онлайн-узлы, задачи, кредиты (auth)  
- **Файлы:** `server/p2p/src/routes/admin.ts`  
- **Действие:** JSON `{ nodes, activeTasks, totalCredits }`  
- **Проверка:** интеграционный тест с mock-узлами


**77 · M · Рейтинг узлов по latency** — уровень 3
- **Цель:** `router.ts` предпочитает узлы с меньшим средним RTT  
- **Файлы:** `server/p2p/src/router.ts`, `server/p2p/src/credits.ts`  
- **Действие:** хранить `avgLatencyMs` per node; сортировка при route  
- **Проверка:** unit-тест: два узла → выбирается с меньшей latency


**78 · M · Reconnect с backoff** — уровень 3
- **Файлы:** `p2pClient.ts`  
- **Действие:** exponential delay 1s→30s при обрыве WSS  
- **Проверка:** unit-тест reconnect attempts


**79 · S · Чип P2P offline** — уровень 3
- **Файлы:** `AgentStatusBar.tsx`, `p2pClient.ts`  
- **Действие:** «P2P offline» при disconnect  
- **Проверка:** виден при остановленном сервере


**80 · M · История P2P-задач** — уровень 3
- **Файлы:** `P2pHistoryPanel.tsx`, local NDJSON или settings  
- **Проверка:** последние 20 relay в UI


**81 · S · Масштаб шрифта UI** — уровень 3
- **Цель:** `uiFontScale: 0.9 | 1 | 1.1 | 1.25` в настройках → `document.documentElement.style.fontSize`  
- **Файлы:** `PerformanceTab.tsx`, `settings.ts`, `App.tsx`  
- **Действие:** select в PerformanceTab; применение при загрузке  
- **Проверка:** 1.25 — текст чата крупнее


**82 · S · Избранные чаты** — уровень 3
- **Цель:** звезда ⭐ на чате → секция «Избранное» вверху истории  
- **Файлы:** `SavedChat` + `chats.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** `starred?: boolean`; сортировка starred first  
- **Проверка:** избранный чат остаётся наверху


### 🟢 Уровень 4 — низкий приоритет

> Голос, рефакторинг монолитов, i18n, Docker, polish. Пункты **97–140** — когда уровни 1–3 закрыты.

**83 · M · STT — кнопка микрофона** — уровень 4
- **Цель:** диктовка в поле ввода через Web Speech API (`SpeechRecognition`)  
- **Файлы:** `app/src/components/ChatPanel/ChatInput.tsx`  
- **Действие:** кнопка 🎤 → `recognition.start()` → текст в `onInputChange`  
- **Проверка:** диктовка вставляет распознанный текст в поле


**84 · M · TTS — кнопка «Озвучить»** — уровень 4
- **Цель:** озвучка последнего ответа ассистента через `speechSynthesis`  
- **Файлы:** `app/src/components/MessageBody.tsx` (или `MessageRow.tsx`)  
- **Действие:** кнопка «🔊» на сообщении assistant → `SpeechSynthesisUtterance`  
- **Проверка:** нажатие воспроизводит текст ответа


**85 · M · Разбивка App.tsx** — уровень 4
- **Цель:** вынести layout и модалки из ~1000-строчного `App.tsx`  
- **Файлы:** `app/src/App.tsx` → `AppLayout.tsx`, `useAppModals.ts`  
- **Действие:** перенести JSX layout + state модалок без изменения поведения  
- **Проверка:** `npm run typecheck`; E2E или ручной smoke UI


**86 · M · Разбивка agent.ts** — уровень 4
- **Цель:** отделить цикл ReAct от dispatch инструментов  
- **Файлы:** `agent.ts` → `agentLoop.ts`, `agentStreamHandler.ts`  
- **Действие:** `AgentRunner.run()` делегирует в `runAgentLoop()`  
- **Проверка:** `npm run typecheck`; существующие agent-тесты зелёные


**87 · M · Хук useChatPanelState** — уровень 4
- **Цель:** сократить `ChatPanel/index.tsx` — state и refs в отдельный хук  
- **Файлы:** `app/src/components/ChatPanel/index.tsx`, `useChatPanelState.ts`  
- **Действие:** перенести useState/useRef блоки в хук; index — только композиция  
- **Проверка:** `npm run typecheck`; отправка сообщения в UI работает


**88 · M · ChatPanel: вынести MessagesPane state** — уровень 4
- **Цель:** `ChatPanelMessagesPane` + хук `useChatMessagesPane` из `index.tsx`  
- **Файлы:** `ChatPanel/index.tsx` (~980 строк)  
- **Проверка:** `index.tsx` < 600 строк


**89 · M · ChatHistoryPanel: виртуализированный список** — уровень 4
- **Цель:** JSX рендера `FlatItem` и virtualizer — в `ChatHistoryList.tsx`  
- **Файлы:** `ChatHistoryPanel.tsx` → `ChatHistoryList.tsx`  
- **Действие:** props: `items`, `activeChatId`, `onSelect`; панель — композиция + toolbar  
- **Проверка:** скролл длинной истории чатов без регрессий


**90 · M · ChatHistoryPanel: DnD и диалоги** — уровень 4
- **Цель:** drag-and-drop, Prompt/Confirm state — в `useChatHistoryDnD.ts`  
- **Файлы:** `ChatHistoryPanel.tsx`, `useChatHistoryDnD.ts`  
- **Действие:** хук возвращает handlers и dialog state; панель < 400 строк  
- **Проверка:** перетаскивание чата в папку работает


**91 · M · types.ts: доменные модули** — уровень 4
- **Цель:** разнести ~720 строк на `types/chat.ts`, `types/settings.ts`, `types/memory.ts`, `types/api.ts`  
- **Файлы:** `app/src/types/` (новая папка), `types.ts` — re-export  
- **Действие:** `CodeViperAPI` в `api.ts`; `AgentSettings` в `settings.ts`  
- **Проверка:** `npm run typecheck`; нет циклических импортов


**92 · M · agentContext: RAG-hints** — уровень 4
- **Цель:** grep-nudge и `maybeAppendRagSearchHintAfterEmptyGrep` — в `agentContextRag.ts`  
- **Файлы:** `agentContext.ts` → `agentContextRag.ts`  
- **Действие:** re-export из `agentContext.ts`  
- **Проверка:** `npm test` — существующие тесты RAG-hint зелёные


**93 · M · agentContext: preview и prepare** — уровень 4
- **Цель:** `buildAgentContextPreview`, `prepareAgentRunContext`, `summarizeChatHistory` — в `agentContextBuild.ts`  
- **Файлы:** `agentContext.ts` → `agentContextBuild.ts`  
- **Действие:** `agentContext.ts` < 150 строк, только re-export и `OllamaMessage`  
- **Проверка:** `npm run typecheck`; превью контекста в UI открывается


**94 · M · useAgentStream: обработчики событий** — уровень 4
- **Цель:** switch по `AgentStreamEvent.type` — в `agentStreamHandlers.ts`  
- **Файлы:** `useAgentStream.ts` → `agentStreamHandlers.ts`  
- **Действие:** чистые функции `(event, ctx) => partialState`; хук — подписка и setState  
- **Проверка:** `npm run typecheck`; стрим агента в UI без регрессий


**95 · M · preload: группы API** — уровень 4
- **Цель:** `codeviper` object разбить на `preload/agentApi.ts`, `preload/chatApi.ts`, `preload/fileApi.ts`  
- **Файлы:** `electron/preload/index.ts`, `electron/preload/*.ts`  
- **Действие:** `Object.assign` или spread в `contextBridge.exposeInMainWorld`  
- **Проверка:** `npm run typecheck`; `window.codeviper.*` доступен в renderer


**96 · M · agentTools/core: files / git / package** — уровень 4
- **Цель:** `FILE_TOOLS`, `GIT_TOOLS`, `PACKAGE_TOOLS` — в отдельные файлы (~200 строк каждый)  
- **Файлы:** `agentTools/core.ts` → `coreFiles.ts`, `coreGit.ts`, `corePackage.ts`; `core.ts` — сборка  
- **Действие:** `getAgentTools()` без изменений снаружи  
- **Проверка:** `npm run typecheck`; список инструментов агента тот же


**97 · M · BehaviorTab: автоматизация и git** — уровень 4
- **Цель:** вынести секции автокоммита и git-sync в `BehaviorAutomationSection.tsx`  
- **Файлы:** `BehaviorTab.tsx` (~580 строк)  
- **Проверка:** `BehaviorTab.tsx` < 350 строк


**98 · M · BehaviorTab: инструменты и промпты** — уровень 4
- **Цель:** `disabledTools`, `promptTemplates`, permissions — в `BehaviorToolsSection.tsx`  
- **Файлы:** `BehaviorTab.tsx`  
- **Проверка:** typecheck; настройки сохраняются


**99 · M · IntegrationsTab: MCP секция** — уровень 4
- **Файлы:** `IntegrationsTab.tsx` → `McpIntegrationsSection.tsx`  
- **Проверка:** MCP CRUD в UI работает


**100 · M · IntegrationsTab: P2P и webhooks** — уровень 4
- **Файлы:** `IntegrationsTab.tsx` → `P2pIntegrationsSection.tsx`, `WebhookSection.tsx`  
- **Проверка:** тумблер P2P и webhook URL сохраняются


**101 · M · vectorStore: Qdrant / Milvus** — уровень 4
- **Файлы:** `vectorStore.ts` → `qdrantStore.ts`, `milvusStore.ts`  
- **Проверка:** `search_knowledge_base` без регрессий


**102 · M · memory.ts: локальная vs контекстная сборка** — уровень 4
- **Файлы:** `memory.ts` → `memoryStore.ts`, `memoryContext.ts`  
- **Проверка:** `npm test -- memory`


**103 · M · collectiveMemorySync: pull / push** — уровень 4
- **Файлы:** `collectiveMemorySync.ts` — два модуля  
- **Проверка:** `npm test -- collectiveMemorySync`


**104 · M · agentTools/integrations: GitHub + GitLab** — уровень 4
- **Файлы:** `integrationsGitHub.ts`, `integrationsGitLab.ts`  
- **Проверка:** tool names в `AGENT_TOOL_NAMES` на месте


**105 · M · agentTools/integrations: memory + skills + web** — уровень 4
- **Файлы:** `integrationsMemory.ts`, `integrationsWeb.ts`  
- **Проверка:** typecheck


**106 · M · defaultSkills: данные в JSON** — уровень 4
- **Цель:** SKILL markdown из `resources/default-skills/*.md` вместо строк в TS  
- **Файлы:** `defaultSkills.ts`, `resources/default-skills/`  
- **Проверка:** `npm test -- defaultSkills`


**107 · M · useMessageQueue: обработчики стрима** — уровень 4
- **Файлы:** `useMessageQueue.ts` → `messageQueueHandlers.ts`  
- **Проверка:** отправка и danger-block работают


**108 · M · agentContextManager: выбор провайдера** — уровень 4
- **Файлы:** `agentContextManager.ts` (~350) → `providerResolver.ts`  
- **Проверка:** cloud/ollama routing tests


**109 · S · Режим высокой контрастности** — уровень 4
- **Цель:** класс `high-contrast` на `:root` для слабовидящих  
- **Файлы:** `styles.css`, `PerformanceTab.tsx`, `settings.ts`  
- **Действие:** тумблер + контрастные CSS-переменные  
- **Проверка:** границы панелей и кнопок заметно контрастнее


**110 · S · Цвет папки чатов** — уровень 4
- **Цель:** `ChatFolder.color?: string` — цветная полоска у заголовка папки  
- **Файлы:** `types.ts`, `chats.ts`, `ChatHistoryPanel.tsx`  
- **Действие:** picker в контекстном меню папки  
- **Проверка:** цвет виден и сохраняется


**111 · M · Drag-drop папок в чат** — уровень 4
- **Цель:** перетаскивание директории → `@path` или attachment как у файлов  
- **Файлы:** `ChatPanel/ChatInput.tsx`, `registerFileIpc.ts`  
- **Действие:** resolve directory path; лимит вложенных файлов  
- **Проверка:** drop папки добавляет путь в чат


**112 · M · Mermaid в ответах агента** — уровень 4
- **Цель:** блоки ` ```mermaid ` рендерятся как SVG  
- **Файлы:** `MessageBody.tsx`, dependency `mermaid`  
- **Действие:** lazy import mermaid; sandboxed render  
- **Проверка:** диаграмма из примера отображается


**113 · M · E2E: дерево проекта** — уровень 4
- **Файлы:** `e2e/project-tree.test.ts`  
- **Действие:** открыть tree → клик файл  
- **Проверка:** e2e green


**114 · M · E2E: DiffPreviewModal** — уровень 4
- **Файлы:** `e2e/diff-preview.test.ts`  
- **Действие:** mock preview_edit event  
- **Проверка:** e2e green


**115 · S · Фильтр по тегам в SkillsPanel** — уровень 4
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`  
- **Действие:** теги из frontmatter SKILL.md  
- **Проверка:** фильтр по тегу работает


**116 · S · Сохранение последнего benchmark** — уровень 4
- **Файлы:** `settings.ts`, `ModelTab.tsx`  
- **Действие:** `lastBenchmark: BenchmarkResult` после прогона  
- **Проверка:** результат виден после reopen settings


**117 · S · Dependabot для npm** — уровень 4
- **Файлы:** `.github/dependabot.yml`  
- **Действие:** weekly `app/` и root  
- **Проверка:** файл валиден по schema dependabot


**118 · M · WSL: перевод путей проекта** — уровень 4
- **Цель:** `\\wsl$\...` ↔ `/mnt/...` при выборе папки на Windows  
- **Файлы:** `fsUtil.ts`, `registerFileIpc.ts`  
- **Проверка:** unit-тест path normalize


**119 · S · Long paths на Windows** — уровень 4
- **Файлы:** `package.json` build manifest / `electron-builder`  
- **Действие:** `requestedExecutionLevel` + known issue doc  
- **Проверка:** проект с путём >260 символов открывается


**120 · L · Открепить чат в отдельное окно** — уровень 4
- **Цель:** второй `BrowserWindow` с тем же chatId через IPC sync  
- **Файлы:** `index.ts`, `App.tsx`, `registerAppIpc.ts`  
- **Действие:** «Открыть в новом окне» в меню чата  
- **Проверка:** два окна — один чат синхронизирован


**121 · M · Инфраструктура i18n** — уровень 4
- **Цель:** функция `t(key)` + `locales/ru.json` (текущие строки) + `en.json`  
- **Файлы:** `app/src/i18n/index.ts`, `app/src/i18n/locales/`  
- **Действие:** React context `I18nProvider`; fallback на ключ  
- **Проверка:** `t('settings.title')` возвращает строку на обоих языках


**122 · M · Переключатель языка в настройках** — уровень 4
- **Цель:** `locale: 'ru' | 'en'` в settings + UI в BehaviorTab  
- **Файлы:** `settings.ts`, `BehaviorTab.tsx`, `App.tsx`  
- **Действие:** select «Язык»; `I18nProvider` читает settings.locale  
- **Проверка:** смена на en → хотя бы один переведённый заголовок меняется


**123 · M · i18n: строки App и шапки** — уровень 4
- **Цель:** вынести строки `App.tsx` (кнопки, заголовки панелей) в locale-файлы  
- **Файлы:** `App.tsx`, `locales/ru.json`, `locales/en.json`  
- **Действие:** заменить литералы на `t('…')`  
- **Проверка:** en locale — шапка и «Настройки» на английском


**124 · M · i18n: SettingsModal** — уровень 4
- **Цель:** перевести вкладки и подписи настроек  
- **Файлы:** `SettingsModal/*.tsx`, locale-файлы  
- **Действие:** ключи `settings.model.*`, `settings.behavior.*` и т.д.  
- **Проверка:** en locale — названия вкладок на английском


**125 · M · i18n: ChatPanel и сообщения UI** — уровень 4
- **Цель:** перевести placeholder, кнопки отправки, статус-бар  
- **Файлы:** `ChatPanel/`, `AgentStatusBar.tsx`, locale-файлы  
- **Действие:** ключи `chat.*`, `status.*`  
- **Проверка:** en locale — placeholder поля ввода на английском


**126 · M · Docker dev-окружение** — уровень 4
- **Цель:** Dockerfile Node 20 + Ollama; compose с hot reload  
- **Файлы:** `Dockerfile`, `docker-compose.yml`, `README.md`  
- **Действие:** образ + том исходников + `npm run dev`  
- **Проверка:** `docker compose up` поднимает приложение
