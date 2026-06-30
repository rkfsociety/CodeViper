# M: ???????? ????????? ? ????????? UI

?????? 406?450: ?????????????? ?????, ???, STT/TTS ? UI ???????.

????? ???????: 45.

**406 · M · LSP для Hack** — уровень 3
- **Цель:** hover/definition для `.hack` через HHVM IDE tools
- **Файлы:** `lspClient.ts`
- **Действие:** ветка Hack language server
- **Проверка:** Ctrl+click на method → переход к определению
**407 · M · LSP для Mojo** — уровень 3
- **Цель:** hover/definition для `.mojo` через mojo LSP (если доступен)
- **Файлы:** `lspClient.ts`
- **Действие:** опциональный spawn; graceful fallback
- **Проверка:** при наличии LSP — переход к `fn`
**408 · M · LSP для Zig** — уровень 3
- **Цель:** hover/definition для `.zig` через ZLS
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** spawn zig language server
- **Проверка:** Ctrl+click на `fn` → переход к определению
**409 · M · LSP для Red** — уровень 3
- **Цель:** hover/definition для `.red` — ограниченная поддержка
- **Файлы:** `lspClient.ts`
- **Действие:** syntax service или fallback
- **Проверка:** отчёт о доступности LSP
**410 · M · LSP для ReScript** — уровень 3
- **Цель:** hover/definition для `.res` через rescript-language-server
- **Файлы:** `lspClient.ts`
- **Действие:** spawn ReScript LSP
- **Проверка:** Ctrl+click на `let` → переход к определению
**411 · M · LSP для Elm** — уровень 3
- **Цель:** hover/definition для `.elm` через elm-language-server
- **Файлы:** `lspClient.ts`, `CodeEditorPanel.tsx`
- **Действие:** spawn elm make LSP backend
- **Проверка:** Ctrl+click на type → переход к определению
**412 · M · LSP для Futhark** — уровень 3
- **Цель:** hover/definition для `.fut` через futhark LSP (если установлен)
- **Файлы:** `lspClient.ts`
- **Действие:** опциональный spawn
- **Проверка:** при наличии LSP — переход к `entry`
**413 · M · LSP для Idris** — уровень 3
- **Цель:** hover/definition для `.idr` через idris2-lsp
- **Файлы:** `lspClient.ts`
- **Действие:** spawn Idris 2 language server
- **Проверка:** Ctrl+click на function → переход к определению
**414 · M · LSP для Mercury** — уровень 3
- **Цель:** hover/definition для Mercury `.m` — опциональная поддержка
- **Файлы:** `lspClient.ts`
- **Действие:** graceful fallback если LSP недоступен
- **Проверка:** отчёт о статусе LSP
**415 · M · Авто-генерация диаграмм потоков данных UI** — уровень 3
- **Цель:** tool `generate_ui_dataflow_diagram` — props/state/events между компонентами
- **Файлы:** `app/src/components/`, `agentTools/core.ts`
- **Действие:** Mermaid flowchart по React-дереву
- **Проверка:** диаграмма для fixture UI module
**416 · M · Авто-генерация диаграмм потоков данных backend** — уровень 3
- **Цель:** tool `generate_backend_dataflow_diagram` — main process data paths
- **Файлы:** `app/electron/main/`, `ArchitecturePanel.tsx`
- **Действие:** handlers → services → FS/network
- **Проверка:** DFD в чате или панели
**417 · M · Авто-генерация диаграмм потоков данных агента** — уровень 3
- **Цель:** tool `generate_agent_dataflow_diagram` — prompt → model → tools → response
- **Файлы:** `agent.ts`, `agentContext.ts`
- **Действие:** ReAct loop dataflow Mermaid
- **Проверка:** trace + diagram согласованы для fixture run
**418 · M · Авто-генерация диаграмм потоков данных плагинов** — уровень 3
- **Цель:** tool `generate_plugin_dataflow_diagram` — plugin → agent tools
- **Файлы:** `plugins/`, `agentTools/core.ts`
- **Действие:** scan plugins → flowchart
- **Проверка:** fixture plugin на диаграмме
**419 · M · Авто-генерация диаграмм потоков данных RAG** — уровень 3
- **Цель:** tool `generate_rag_dataflow_diagram` — ingest → embed → index → search
- **Файлы:** `rag.ts`, `vectorStore.ts`
- **Действие:** pipeline Mermaid
- **Проверка:** diagram покрывает `search_knowledge_base` path
**420 · M · Авто-генерация диаграмм потоков данных P2P** — уровень 3
- **Цель:** tool `generate_p2p_dataflow_diagram` — client ↔ server ↔ nodes
- **Файлы:** `p2pClient.ts`, `server/p2p/`
- **Действие:** WSS relay flow Mermaid
- **Проверка:** diagram для fixture topology
**421 · M · Авто-генерация диаграмм потоков данных CI/CD** — уровень 3
- **Цель:** tool `generate_cicd_dataflow_diagram` — trigger → jobs → artifacts
- **Файлы:** `.github/workflows/*`, `agentTools/integrations.ts`
- **Действие:** YAML → dataflow flowchart
- **Проверка:** соответствует fixture workflow
**422 · M · Авто-генерация диаграмм потоков данных worktree** — уровень 3
- **Цель:** tool `generate_worktree_dataflow_diagram` — chat → worktree → agent root
- **Файлы:** `gitWorktree.ts`, `chats.ts`, `agent.ts`
- **Действие:** path resolution flow Mermaid
- **Проверка:** diagram описывает `resolveProjectRoot`
**423 · M · Авто-генерация диаграмм потоков данных IPC** — уровень 3
- **Цель:** tool `generate_ipc_dataflow_diagram` — renderer ↔ preload ↔ main
- **Файлы:** `shared/ipc/channels.ts`, `electron/preload/`
- **Действие:** sequence + data payload hints
- **Проверка:** fixture IPC channel на диаграмме
**424 · M · Авто-генерация диаграмм потоков данных settings** — уровень 3
- **Цель:** tool `generate_settings_dataflow_diagram` — UI → IPC → settings.json
- **Файлы:** `settings.ts`, `SettingsModal/*`
- **Действие:** load/save/normalize flow
- **Проверка:** diagram покрывает `loadSettings` path
**425 · M · Авто-генерация отчёта по качеству архитектуры UI** — уровень 3
- **Цель:** tool `generate_ui_architecture_quality_report` — слои, coupling, размер компонентов
- **Файлы:** `app/src/components/`, `agentTools/core.ts`
- **Действие:** read-only MD отчёт
- **Проверка:** отчёт без write_file
**426 · M · Авто-генерация отчёта по качеству архитектуры backend** — уровень 3
- **Цель:** tool `generate_backend_architecture_quality_report` — модули main, зависимости
- **Файлы:** `app/electron/main/`
- **Действие:** import graph + рекомендации
- **Проверка:** отчёт описывает handler layers
**427 · M · Авто-генерация отчёта по качеству архитектуры агента** — уровень 3
- **Цель:** tool `generate_agent_architecture_quality_report` — loop, tools, guards
- **Файлы:** `agent.ts`, `agentTools/`
- **Действие:** checklist + metrics
- **Проверка:** отчёт содержит tool groups
**428 · M · Авто-генерация отчёта по качеству архитектуры плагинов** — уровень 3
- **Цель:** tool `generate_plugin_architecture_quality_report` — API surface, isolation
- **Файлы:** `plugins/`, `docs/plugin-authoring.md`
- **Действие:** scan + MD summary
- **Проверка:** fixture plugin оценён в отчёте
**429 · M · Авто-генерация отчёта по качеству архитектуры RAG** — уровень 3
- **Цель:** tool `generate_rag_architecture_quality_report` — pipeline, stores, fallbacks
- **Файлы:** `rag.ts`, `vectorStore.ts`
- **Действие:** architecture checklist
- **Проверка:** отчёт без write_file
**430 · M · Авто-генерация отчёта по качеству архитектуры P2P** — уровень 3
- **Цель:** tool `generate_p2p_architecture_quality_report` — router, credits, failover
- **Файлы:** `server/p2p/`, `p2pClient.ts`
- **Действие:** MD quality report
- **Проверка:** отчёт перечисляет router/credits
**431 · M · Авто-генерация отчёта по качеству архитектуры CI/CD** — уровень 3
- **Цель:** tool `generate_cicd_architecture_quality_report` — jobs, parallelism, secrets
- **Файлы:** `.github/workflows/*`
- **Действие:** YAML analysis + best practices
- **Проверка:** отчёт для fixture ci.yml
**432 · M · Авто-генерация отчёта по качеству архитектуры worktree** — уровень 3
- **Цель:** tool `generate_worktree_architecture_quality_report` — isolation, cleanup, chat bind
- **Файлы:** `gitWorktree.ts`, `chats.ts`
- **Действие:** flow + risk assessment
- **Проверка:** отчёт описывает worktree lifecycle
**433 · M · Авто-генерация отчёта по качеству архитектуры IPC** — уровень 3
- **Цель:** tool `generate_ipc_architecture_quality_report` — channels, schemas, drift
- **Файлы:** `shared/ipcContracts.ts`, `register*Ipc.ts`
- **Действие:** Zod vs handlers cross-check
- **Проверка:** отчёт находит schema drift в fixture
**434 · M · Авто-генерация отчёта по качеству архитектуры settings** — уровень 3
- **Цель:** tool `generate_settings_architecture_quality_report` — schema, defaults, migration
- **Файлы:** `settings.ts`, `types.ts`
- **Действие:** Zod schema audit
- **Проверка:** отчёт перечисляет optional fields без default
**435 · M · STT — кнопка микрофона** — уровень 4
- **Цель:** диктовка в поле ввода через Web Speech API (`SpeechRecognition`)
- **Файлы:** `app/src/components/ChatPanel/ChatInput.tsx`
- **Действие:** кнопка 🎤 → `recognition.start()` → текст в `onInputChange`
- **Проверка:** диктовка вставляет распознанный текст в поле
**436 · M · TTS — кнопка «Озвучить»** — уровень 4
- **Цель:** озвучка последнего ответа ассистента через `speechSynthesis`
- **Файлы:** `app/src/components/MessageBody.tsx` (или `MessageRow.tsx`)
- **Действие:** кнопка «🔊» на сообщении assistant → `SpeechSynthesisUtterance`
- **Проверка:** нажатие воспроизводит текст ответа
**437 · M · Разбивка App.tsx** — уровень 4
- **Цель:** вынести layout и модалки из ~1000-строчного `App.tsx`
- **Файлы:** `app/src/App.tsx` → `AppLayout.tsx`, `useAppModals.ts`
- **Действие:** перенести JSX layout + state модалок без изменения поведения
- **Проверка:** `npm run typecheck`; E2E или ручной smoke UI
**438 · M · Разбивка agent.ts** — уровень 4
- **Цель:** отделить цикл ReAct от dispatch инструментов
- **Файлы:** `agent.ts` → `agentLoop.ts`, `agentStreamHandler.ts`
- **Действие:** `AgentRunner.run()` делегирует в `runAgentLoop()`
- **Проверка:** `npm run typecheck`; существующие agent-тесты зелёные
**439 · M · Хук useChatPanelState** — уровень 4
- **Цель:** сократить `ChatPanel/index.tsx` — state и refs в отдельный хук
- **Файлы:** `app/src/components/ChatPanel/index.tsx`, `useChatPanelState.ts`
- **Действие:** перенести useState/useRef блоки в хук; index — только композиция
- **Проверка:** `npm run typecheck`; отправка сообщения в UI работает
**440 · M · ChatPanel: вынести MessagesPane state** — уровень 4
- **Цель:** `ChatPanelMessagesPane` + хук `useChatMessagesPane` из `index.tsx`
- **Файлы:** `ChatPanel/index.tsx` (~980 строк)
- **Проверка:** `index.tsx` < 600 строк
**441 · M · ChatHistoryPanel: виртуализированный список** — уровень 4
- **Цель:** JSX рендера `FlatItem` и virtualizer — в `ChatHistoryList.tsx`
- **Файлы:** `ChatHistoryPanel.tsx` → `ChatHistoryList.tsx`
- **Действие:** props: `items`, `activeChatId`, `onSelect`; панель — композиция + toolbar
- **Проверка:** скролл длинной истории чатов без регрессий
**442 · M · ChatHistoryPanel: DnD и диалоги** — уровень 4
- **Цель:** drag-and-drop, Prompt/Confirm state — в `useChatHistoryDnD.ts`
- **Файлы:** `ChatHistoryPanel.tsx`, `useChatHistoryDnD.ts`
- **Действие:** хук возвращает handlers и dialog state; панель < 400 строк
- **Проверка:** перетаскивание чата в папку работает
**443 · M · types.ts: доменные модули** — уровень 4
- **Цель:** разнести ~720 строк на `types/chat.ts`, `types/settings.ts`, `types/memory.ts`, `types/api.ts`
- **Файлы:** `app/src/types/` (новая папка), `types.ts` — re-export
- **Действие:** `CodeViperAPI` в `api.ts`; `AgentSettings` в `settings.ts`
- **Проверка:** `npm run typecheck`; нет циклических импортов
**444 · M · agentContext: RAG-hints** — уровень 4
- **Цель:** grep-nudge и `maybeAppendRagSearchHintAfterEmptyGrep` — в `agentContextRag.ts`
- **Файлы:** `agentContext.ts` → `agentContextRag.ts`
- **Действие:** re-export из `agentContext.ts`
- **Проверка:** `npm test` — существующие тесты RAG-hint зелёные
**445 · M · agentContext: preview и prepare** — уровень 4
- **Цель:** `buildAgentContextPreview`, `prepareAgentRunContext`, `summarizeChatHistory` — в `agentContextBuild.ts`
- **Файлы:** `agentContext.ts` → `agentContextBuild.ts`
- **Действие:** `agentContext.ts` < 150 строк, только re-export и `OllamaMessage`
- **Проверка:** `npm run typecheck`; превью контекста в UI открывается
**446 · M · useAgentStream: обработчики событий** — уровень 4
- **Цель:** switch по `AgentStreamEvent.type` — в `agentStreamHandlers.ts`
- **Файлы:** `useAgentStream.ts` → `agentStreamHandlers.ts`
- **Действие:** чистые функции `(event, ctx) => partialState`; хук — подписка и setState
- **Проверка:** `npm run typecheck`; стрим агента в UI без регрессий
**447 · M · preload: группы API** — уровень 4
- **Цель:** `codeviper` object разбить на `preload/agentApi.ts`, `preload/chatApi.ts`, `preload/fileApi.ts`
- **Файлы:** `electron/preload/index.ts`, `electron/preload/*.ts`
- **Действие:** `Object.assign` или spread в `contextBridge.exposeInMainWorld`
- **Проверка:** `npm run typecheck`; `window.codeviper.*` доступен в renderer
**448 · M · agentTools/core: files / git / package** — уровень 4
- **Цель:** `FILE_TOOLS`, `GIT_TOOLS`, `PACKAGE_TOOLS` — в отдельные файлы (~200 строк каждый)
- **Файлы:** `agentTools/core.ts` → `coreFiles.ts`, `coreGit.ts`, `corePackage.ts`; `core.ts` — сборка
- **Действие:** `getAgentTools()` без изменений снаружи
- **Проверка:** `npm run typecheck`; список инструментов агента тот же
**449 · M · BehaviorTab: автоматизация и git** — уровень 4
- **Цель:** вынести секции автокоммита и git-sync в `BehaviorAutomationSection.tsx`
- **Файлы:** `BehaviorTab.tsx` (~580 строк)
- **Проверка:** `BehaviorTab.tsx` < 350 строк
**450 · M · BehaviorTab: инструменты и промпты** — уровень 4
- **Цель:** `disabledTools`, `promptTemplates`, permissions — в `BehaviorToolsSection.tsx`
- **Файлы:** `BehaviorTab.tsx`
- **Проверка:** typecheck; настройки сохраняются
