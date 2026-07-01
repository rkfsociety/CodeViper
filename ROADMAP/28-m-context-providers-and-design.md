# M: Интеграции, контекст и UX-гайды

Пункты 405–449: вкладки настроек, context manager, дизайн и UX-гайды.

Всего пунктов: 45.

**405 · M · IntegrationsTab: MCP секция** — уровень 4
- **Файлы:** `IntegrationsTab.tsx` → `McpIntegrationsSection.tsx`
- **Проверка:** MCP CRUD в UI работает


**406 · M · IntegrationsTab: P2P и webhooks** — уровень 4
- **Файлы:** `IntegrationsTab.tsx` → `P2pIntegrationsSection.tsx`, `WebhookSection.tsx`
- **Проверка:** тумблер P2P и webhook URL сохраняются


**407 · M · vectorStore: Qdrant / Milvus** — уровень 4
- **Файлы:** `vectorStore.ts` → `qdrantStore.ts`, `milvusStore.ts`
- **Проверка:** `search_knowledge_base` без регрессий


**408 · M · memory.ts: локальная vs контекстная сборка** — уровень 4
- **Файлы:** `memory.ts` → `memoryStore.ts`, `memoryContext.ts`
- **Проверка:** `npm test -- memory`


**409 · M · collectiveMemorySync: pull / push** — уровень 4
- **Файлы:** `collectiveMemorySync.ts` — два модуля
- **Проверка:** `npm test -- collectiveMemorySync`


**410 · M · agentTools/integrations: GitHub + GitLab** — уровень 4
- **Файлы:** `integrationsGitHub.ts`, `integrationsGitLab.ts`
- **Проверка:** tool names в `AGENT_TOOL_NAMES` на месте


**411 · M · agentTools/integrations: memory + skills + web** — уровень 4
- **Файлы:** `integrationsMemory.ts`, `integrationsWeb.ts`
- **Проверка:** typecheck


**412 · M · defaultSkills: данные в JSON** — уровень 4
- **Цель:** SKILL markdown из `resources/default-skills/*.md` вместо строк в TS
- **Файлы:** `defaultSkills.ts`, `resources/default-skills/`
- **Проверка:** `npm test -- defaultSkills`


**413 · M · useMessageQueue: обработчики стрима** — уровень 4
- **Файлы:** `useMessageQueue.ts` → `messageQueueHandlers.ts`
- **Проверка:** отправка и danger-block работают


**414 · M · agentContextManager: выбор провайдера** — уровень 4
- **Файлы:** `agentContextManager.ts` (~350) → `providerResolver.ts`
- **Проверка:** cloud/ollama routing tests


**415 · M · Drag-drop папок в чат** — уровень 4
- **Цель:** перетаскивание директории → `@path` или attachment как у файлов
- **Файлы:** `ChatPanel/ChatInput.tsx`, `registerFileIpc.ts`
- **Действие:** resolve directory path; лимит вложенных файлов
- **Проверка:** drop папки добавляет путь в чат


**416 · M · Mermaid в ответах агента** — уровень 4
- **Цель:** блоки ` ```mermaid ` рендерятся как SVG
- **Файлы:** `MessageBody.tsx`, dependency `mermaid`
- **Действие:** lazy import mermaid; sandboxed render
- **Проверка:** диаграмма из примера отображается


**417 · M · E2E: дерево проекта** — уровень 4
- **Файлы:** `e2e/project-tree.test.ts`
- **Действие:** открыть tree → клик файл
- **Проверка:** e2e green


**418 · M · E2E: DiffPreviewModal** — уровень 4
- **Файлы:** `e2e/diff-preview.test.ts`
- **Действие:** mock preview_edit event
- **Проверка:** e2e green


**419 · M · WSL: перевод путей проекта** — уровень 4
- **Цель:** `\\wsl$\...` ↔ `/mnt/...` при выборе папки на Windows
- **Файлы:** `fsUtil.ts`, `registerFileIpc.ts`
- **Проверка:** unit-тест path normalize


**420 · M · Инфраструктура i18n** — уровень 4
- **Цель:** функция `t(key)` + `locales/ru.json` (текущие строки) + `en.json`
- **Файлы:** `app/src/i18n/index.ts`, `app/src/i18n/locales/`
- **Действие:** React context `I18nProvider`; fallback на ключ
- **Проверка:** `t('settings.title')` возвращает строку на обоих языках


**421 · M · Переключатель языка в настройках** — уровень 4
- **Цель:** `locale: 'ru' | 'en'` в settings + UI в BehaviorTab
- **Файлы:** `settings.ts`, `BehaviorTab.tsx`, `App.tsx`
- **Действие:** select «Язык»; `I18nProvider` читает settings.locale
- **Проверка:** смена на en → хотя бы один переведённый заголовок меняется


**422 · M · i18n: строки App и шапки** — уровень 4
- **Цель:** вынести строки `App.tsx` (кнопки, заголовки панелей) в locale-файлы
- **Файлы:** `App.tsx`, `locales/ru.json`, `locales/en.json`
- **Действие:** заменить литералы на `t('…')`
- **Проверка:** en locale — шапка и «Настройки» на английском


**423 · M · i18n: SettingsModal** — уровень 4
- **Цель:** перевести вкладки и подписи настроек
- **Файлы:** `SettingsModal/*.tsx`, locale-файлы
- **Действие:** ключи `settings.model.*`, `settings.behavior.*` и т.д.
- **Проверка:** en locale — названия вкладок на английском


**424 · M · i18n: ChatPanel и сообщения UI** — уровень 4
- **Цель:** перевести placeholder, кнопки отправки, статус-бар
- **Файлы:** `ChatPanel/`, `AgentStatusBar.tsx`, locale-файлы
- **Действие:** ключи `chat.*`, `status.*`
- **Проверка:** en locale — placeholder поля ввода на английском


**425 · M · Docker dev-окружение** — уровень 4
- **Цель:** Dockerfile Node 20 + Ollama; compose с hot reload
- **Файлы:** `Dockerfile`, `docker-compose.yml`, `README.md`
- **Действие:** образ + том исходников + `npm run dev`
- **Проверка:** `docker compose up` поднимает приложение


**426 · M · STT улучшенный режим (VAD + шумоподавление)** — уровень 4
- **Цель:** диктовка с voice activity detection и подавлением фонового шума
- **Файлы:** `ChatPanel/ChatInput.tsx`, `settings.ts`
- **Действие:** опциональный режим «Улучшенный STT»; Web Audio API или WASM-фильтр перед `SpeechRecognition`
- **Проверка:** в шумной среде меньше ложных срабатываний; unit-тест VAD-порога


**427 · M · TTS с выбором голоса** — уровень 4
- **Цель:** выбор голоса `speechSynthesis` в настройках
- **Файлы:** `MessageBody.tsx`, `PerformanceTab.tsx`, `settings.ts`
- **Действие:** `ttsVoiceUri?: string`; select из `getVoices()`
- **Проверка:** озвучка использует выбранный голос после reopen settings


**428 · M · Docker-режим для агента** — уровень 4
- **Цель:** изолированный прогон shell-команд в контейнере проекта
- **Файлы:** `commandRunner.ts`, `agentHandlersProjectTerminal.ts`, `settings.ts`
- **Действие:** `dockerAgentMode?: boolean`; `run_command` → `docker run` с mount projectPath
- **Проверка:** команда выполняется в контейнере; хост не затронут


**429 · M · Авто-сборка Docker-образов проекта** — уровень 4
- **Цель:** tool `build_docker_image` — `docker build` с валидацией Dockerfile
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`, `commandRunner.ts`
- **Действие:** параметры `tag?`, `context?`; блок опасных флагов
- **Проверка:** unit-тест: mock docker → успешный build


**430 · M · Авто-деплой на сервер** — уровень 4
- **Цель:** tool `deploy_to_server` — SSH/rsync или scp артефактов
- **Файлы:** `agentTools/integrations.ts`, `settings.ts`
- **Действие:** параметры host, path, key; лимит команд
- **Проверка:** unit-тест с mock SSH; без реального деплоя в CI


**431 · M · Авто-деплой на Kubernetes** — уровень 4
- **Цель:** tool `deploy_kubernetes` — `kubectl apply` манифестов проекта
- **Файлы:** `agentTools/integrations.ts`, `commandRunner.ts`
- **Действие:** dry-run по умолчанию; `--context` из settings
- **Проверка:** unit-тест: `kubectl apply --dry-run=client` парсится


**432 · M · Авто-генерация Terraform-конфигов** — уровень 4
- **Цель:** tool `generate_terraform` — main.tf + variables для типового стека
- **Файлы:** `agentTools/core.ts`
- **Действие:** провайдер AWS/GCP/Azure по выбору; без секретов в файлах
- **Проверка:** `terraform validate` на fixture-конфиге


**433 · M · Авто-генерация CI/CD pipelines** — уровень 4
- **Цель:** tool `generate_cicd_pipeline` — универсальный шаблон под стек проекта
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** detect npm/go/rust → соответствующий pipeline YAML
- **Проверка:** сгенерированный YAML валиден по schema CI платформы


**434 · M · Авто-генерация release-notes** — уровень 4
- **Цель:** tool `generate_release_notes` — MD из git log между тегами
- **Файлы:** `agentTools/integrations.ts`, `gitTools.ts`
- **Действие:** `git log vA..vB --pretty`; группировка feat/fix/breaking
- **Проверка:** unit-тест на fixture git history → RELEASE_NOTES.md


**435 · M · Авто-генерация аудио-версии README** — уровень 4
- **Цель:** tool `generate_readme_audio` — TTS-озвучка README.md
- **Файлы:** `agentTools/integrations.ts`, `MessageBody.tsx`
- **Действие:** MD → текст без разметки → `speechSynthesis` или внешний TTS API; сохранение `.mp3`/`.wav`
- **Проверка:** аудиофайл создаётся и воспроизводится


**436 · M · Авто-генерация видео-обзора проекта** — уровень 4
- **Цель:** tool `generate_project_video` — скринкаст + TTS по README
- **Файлы:** `agentTools/integrations.ts`, `commandRunner.ts`
- **Действие:** ffmpeg + скриншоты UI; опционально Playwright record
- **Проверка:** `.mp4` создаётся из fixture-проекта (mock ffmpeg в unit-тесте)


**437 · M · Авто-генерация UI-скриншотов** — уровень 4
- **Цель:** tool `generate_ui_screenshots` — снимки ключевых экранов
- **Файлы:** `agentTools/integrations.ts`, `e2e/`
- **Действие:** E2E-сценарий → PNG в `docs/screenshots/`
- **Проверка:** скриншоты совпадают с baseline (pixel diff tolerance)


**438 · M · Авто-генерация UX-отчётов** — уровень 4
- **Цель:** tool `generate_ux_report` — эвристики UX по UI-компонентам
- **Файлы:** `agentTools/core.ts`, `app/src/components/`
- **Действие:** read-only: кнопки без label, контраст, размер touch-target
- **Проверка:** отчёт в MD без write_file


**439 · M · Авто-генерация цветовых тем** — уровень 4
- **Цель:** tool `generate_color_theme` — CSS-переменные из палитры/бренда
- **Файлы:** `styles.css`, `PerformanceTab.tsx`, `settings.ts`
- **Действие:** генерация `:root` theme block; preview в UI
- **Проверка:** тема применяется без поломки контраста основных панелей


**440 · M · Авто-генерация логотипов** — уровень 4
- **Цель:** tool `generate_logo` — логотип проекта (SVG)
- **Файлы:** `agentTools/integrations.ts`, `README.md`
- **Действие:** генерация SVG + опционально PNG; не перезаписывать без подтверждения
- **Проверка:** SVG открывается; README может ссылаться на файл


**441 · M · Авто-генерация маркетинговых материалов** — уровень 4
- **Цель:** tool `generate_marketing_assets` — баннеры, тексты для соцсетей
- **Файлы:** `agentTools/integrations.ts`, `docs/`
- **Действие:** MD + PNG шаблоны из README/features
- **Проверка:** пакет файлов в `docs/marketing/`


**442 · M · Авто-генерация документации для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_docs` — MD из схемы plugin tool
- **Файлы:** `agentTools/core.ts`, `docs/plugin-authoring.md`
- **Действие:** scan plugins dir → API reference
- **Проверка:** документация покрывает fixture-плагин


**443 · M · Авто-генерация обучающих материалов** — уровень 4
- **Цель:** tool `generate_tutorial` — пошаговый tutorial MD из структуры проекта
- **Файлы:** `agentTools/integrations.ts`, `docs/`
- **Действие:** оглавление + шаги + code snippets
- **Проверка:** tutorial читается; ссылки на файлы валидны


**444 · M · Авто-генерация руководства пользователя** — уровень 4
- **Цель:** tool `generate_user_guide` — полное user guide из UI и вики
- **Файлы:** `agentTools/integrations.ts`, `docs/`
- **Действие:** разделы: установка, чат, настройки, интеграции
- **Проверка:** `docs/user-guide.md` покрывает основные сценарии


**445 · M · Авто-генерация видео-гайдов** — уровень 4
- **Цель:** tool `generate_video_guides` — серия коротких MP4 по разделам docs
- **Файлы:** `agentTools/integrations.ts`, `commandRunner.ts`, `docs/`
- **Действие:** скринкаст + TTS + титры; шаблон на раздел
- **Проверка:** минимум один guide-ролик из fixture-сценария (mock ffmpeg)


**446 · M · Авто-генерация видео-демонстраций UI** — уровень 4
- **Цель:** tool `generate_ui_demo_videos` — запись ключевых экранов CodeViper
- **Файлы:** `agentTools/integrations.ts`, `e2e/`
- **Действие:** Playwright record → MP4 в `docs/demos/`
- **Проверка:** видео открывается; показывает чат и настройки


**447 · M · Авто-генерация маркетинговых видео** — уровень 4
- **Цель:** tool `generate_marketing_video` — промо-ролик из features + CHANGELOG
- **Файлы:** `agentTools/integrations.ts`, `docs/marketing/`
- **Действие:** montage скриншотов + TTS + музыка (опционально)
- **Проверка:** MP4 в `docs/marketing/` создаётся


**448 · M · Авто-генерация тем оформления** — уровень 4
- **Цель:** tool `generate_ui_themes` — полные light/dark темы
- **Файлы:** `styles.css`, `settings.ts`, `PerformanceTab.tsx`
- **Действие:** набор CSS-переменных + переключатель в settings
- **Проверка:** тема применяется без поломки layout


**449 · M · Авто-генерация UX-гайдов** — уровень 4
- **Цель:** tool `generate_ux_guides` — MD: паттерны, do/don't для UI проекта
- **Файлы:** `agentTools/integrations.ts`, `docs/`
- **Действие:** анализ компонентов → гайд с примерами
- **Проверка:** `docs/ux-guide.md` создан
