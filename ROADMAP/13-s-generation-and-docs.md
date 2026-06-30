# S: Генерация CI, пайплайнов и документации

Пункты 90–134: авто-генерация CI/CD, конфигов и пользовательской документации.

Всего пунктов: 45.

**89 · S · Авто-генерация Azure Pipelines** — уровень 4
- **Цель:** tool `generate_azure_pipelines` → `azure-pipelines.yml`
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** pool vmImage + steps npm/ci
- **Проверка:** YAML валиден по Azure schema


**90 · S · Авто-генерация Bitbucket Pipelines** — уровень 4
- **Цель:** tool `generate_bitbucket_pipelines` → `bitbucket-pipelines.yml`
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** image node + script steps
- **Проверка:** сгенерированный файл валиден


**91 · S · Авто-генерация аудио-версии CHANGELOG** — уровень 4
- **Цель:** tool `generate_changelog_audio` — озвучка CHANGELOG.md
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** парсинг секций CHANGELOG → TTS по релизам
- **Проверка:** аудио соответствует тексту fixture CHANGELOG


**92 · S · Авто-генерация GIF-демонстраций** — уровень 4
- **Цель:** tool `generate_demo_gif` — короткая GIF из сценария UI
- **Файлы:** `agentTools/integrations.ts`, `docs/demos.md`
- **Действие:** Playwright/Puppeteer capture → gifencoder или ffmpeg
- **Проверка:** GIF в `docs/` открывается в браузере


**93 · S · Авто-генерация UI-тестов** — уровень 4
- **Цель:** tool `generate_ui_tests` — Playwright spec из описания сценария
- **Файлы:** `agentTools/core.ts`, `e2e/`
- **Действие:** промпт → `*.spec.ts`; шаблон smoke
- **Проверка:** сгенерированный тест компилируется; `npm run test:e2e` — зелёный на mock


**94 · S · Авто-генерация accessibility-отчётов** — уровень 4
- **Цель:** tool `generate_a11y_report` — axe-core / эвристики a11y
- **Файлы:** `agentTools/integrations.ts`, `e2e/`
- **Действие:** статический обход JSX + опционально axe в E2E
- **Проверка:** отчёт содержит найденные a11y-проблемы из fixture


**95 · S · Авто-генерация иконок** — уровень 4
- **Цель:** tool `generate_icons` — SVG/PNG иконки для UI
- **Файлы:** `agentTools/integrations.ts`, `app/resources/`
- **Действие:** prompt → SVG; размеры 16/24/32
- **Проверка:** иконки валидный SVG; отображаются в UI


**96 · S · Авто-генерация splash-screen** — уровень 4
- **Цель:** splash при старте Electron из сгенерированного asset
- **Файлы:** `index.ts`, `agentTools/integrations.ts`, `app/resources/`
- **Действие:** PNG/SVG splash; `BrowserWindow` splash option
- **Проверка:** при запуске виден splash до ready-to-show


**97 · S · Авто-генерация релизных баннеров** — уровень 4
- **Цель:** tool `generate_release_banner` — изображение к тегу `vX.Y.Z`
- **Файлы:** `agentTools/integrations.ts`, `gitTools.ts`
- **Действие:** CHANGELOG summary → баннер PNG/SVG
- **Проверка:** баннер для fixture-тега создаётся


**98 · S · Авто-генерация примеров для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_examples` — working `.js` примеры
- **Файлы:** `docs/plugin-authoring.md`, `agentHandlersProjectFile.ts`
- **Действие:** шаблон plugin + sample tool handler
- **Проверка:** пример загружается hot-reload без ошибок


**99 · S · Авто-генерация FAQ** — уровень 4
- **Цель:** tool `generate_faq` — FAQ.md из issues/traces/частых вопросов
- **Файлы:** `agentTools/integrations.ts`, `docs/troubleshooting.md`
- **Действие:** агрегация → Q/A секции
- **Проверка:** FAQ.md создан; минимум 5 пар Q/A


**100 · S · Авто-генерация руководства разработчика** — уровень 4
- **Цель:** tool `generate_dev_guide` — CONTRIBUTING + architecture summary
- **Файлы:** `agentTools/integrations.ts`, `CONTRIBUTING.md`
- **Действие:** из `CLAUDE.md`/структуры repo → dev guide MD
- **Проверка:** guide содержит команды typecheck/build/test из `app/`


**101 · S · Авто-генерация аудио-версии документации** — уровень 4
- **Цель:** tool `generate_docs_audio` — TTS для `docs/*.md`
- **Файлы:** `agentTools/integrations.ts`, `docs/`
- **Действие:** обход docs → MP3/WAV по файлу или сводный трек
- **Проверка:** аудио создаётся для fixture `docs/*.md`


**102 · S · Авто-генерация аудио-версии ROADMAP** — уровень 4
- **Цель:** tool `generate_roadmap_audio` — озвучка пунктов ROADMAP.md
- **Файлы:** `roadmapParser.ts`, `agentTools/integrations.ts`
- **Действие:** парсинг пунктов → TTS по номерам
- **Проверка:** аудио содержит заголовки fixture-пунктов


**103 · S · Авто-генерация аудио-версии CHANGELOG** — уровень 4
- **Цель:** tool `generate_changelog_audio_v2` — озвучка по релизам (расширение п. 214)
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** секции по версиям; настройка голоса из settings
- **Проверка:** аудио соответствует CHANGELOG fixture


**104 · S · Авто-генерация GIF-анимаций для README** — уровень 4
- **Цель:** tool `generate_readme_gifs` — GIF для быстрого старта в README
- **Файлы:** `agentTools/integrations.ts`, `README.md`
- **Действие:** capture сценариев → GIF; ссылки в README
- **Проверка:** GIF в README рендерится на GitHub


**105 · S · Авто-генерация баннеров релизов** — уровень 4
- **Цель:** tool `generate_release_banners_v2` — набор баннеров к тегу (GitHub/social)
- **Файлы:** `agentTools/integrations.ts`, `gitTools.ts`
- **Действие:** размеры 1200×630, 1280×720; из release-notes
- **Проверка:** PNG/SVG для fixture-тега


**106 · S · Авто-генерация иконок для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_icons` — SVG/PNG per plugin
- **Файлы:** `agentTools/integrations.ts`, `plugins/`
- **Действие:** prompt или шаблон → иконка 32/64px
- **Проверка:** иконка отображается в списке плагинов


**107 · S · Авто-генерация цветовых схем** — уровень 4
- **Цель:** tool `generate_color_schemes` — палитры accent/surface
- **Файлы:** `styles.css`, `agentTools/integrations.ts`
- **Действие:** 3–5 схем из seed-цвета или бренда
- **Проверка:** preview в PerformanceTab


**108 · S · Авто-генерация шрифтовых схем** — уровень 4
- **Цель:** tool `generate_font_schemes` — пары heading/body + scale
- **Файлы:** `styles.css`, `settings.ts`
- **Действие:** `font-family` stacks; связка с `uiFontScale`
- **Проверка:** схема применяется; читаемость в чате


**109 · S · Авто-генерация onboarding-гайдов** — уровень 4
- **Цель:** tool `generate_onboarding_guides` — шаги визарда + скриншоты
- **Файлы:** `OnboardingWizard.tsx`, `docs/`
- **Действие:** MD + optional GIF per step
- **Проверка:** гайд совпадает с шагами визарда


**110 · S · Авто-генерация user-гайдов** — уровень 4
- **Цель:** tool `generate_user_guides_v2` — сценарии для конечного пользователя
- **Файлы:** `docs/`, `agentTools/integrations.ts`
- **Действие:** установка, чат, интеграции, troubleshooting-ссылки
- **Проверка:** `docs/user-guide-v2.md` покрывает 5+ сценариев


**111 · S · Авто-генерация документации по API субагентов** — уровень 4
- **Цель:** tool `generate_subagent_api_docs` — delegate_to_* контракты
- **Файлы:** `subagentRunner.ts`, `agentTools/mcp.ts`, `docs/`
- **Действие:** список субагентов, вход/выход, read-only ограничения
- **Проверка:** docs перечисляют Reviewer, Tester, Architect и др.


**112 · S · Авто-генерация аудио-версии архитектурных отчётов** — уровень 4
- **Цель:** tool `generate_architecture_report_audio` — TTS для arch-отчётов (п. 305–314)
- **Файлы:** `agentTools/integrations.ts`, `subagentRunner.ts`
- **Действие:** MD-отчёт → аудио MP3/WAV по разделам
- **Проверка:** аудио создаётся из fixture architecture report


**113 · S · Авто-генерация аудио-версии тестовых отчётов** — уровень 4
- **Цель:** tool `generate_test_report_audio` — озвучка test/quality reports
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** summary тестов → TTS
- **Проверка:** аудио соответствует fixture test quality report


**114 · S · Авто-генерация аудио-версии UX-отчётов** — уровень 4
- **Цель:** tool `generate_ux_report_audio` — озвучка UX/a11y findings
- **Файлы:** `agentTools/integrations.ts`, `MessageBody.tsx`
- **Действие:** UX report MD → TTS
- **Проверка:** аудио для fixture UX report


**115 · S · Авто-генерация GIF-анимаций архитектуры** — уровень 4
- **Цель:** tool `generate_architecture_gifs` — GIF для ArchitecturePanel / docs
- **Файлы:** `ArchitecturePanel.tsx`, `docs/`
- **Действие:** capture graph interaction → GIF
- **Проверка:** GIF в docs открывается


**116 · S · Авто-генерация баннеров для релизов** — уровень 4
- **Цель:** tool `generate_release_banners_v3` — баннеры под GitHub Release assets
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** размеры release cover + social; из release-notes
- **Проверка:** PNG для fixture release


**117 · S · Авто-генерация иконок для субагентов** — уровень 4
- **Цель:** tool `generate_subagent_icons` — SVG/PNG per delegate_to_*
- **Файлы:** `subagentRunner.ts`, `AgentStatusBar.tsx`
- **Действие:** иконка 24px для Reviewer, Tester, Architect, …
- **Проверка:** чипы субагентов показывают иконки


**118 · S · Авто-генерация цветовых схем для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_color_schemes` — палитра per plugin в UI
- **Файлы:** `plugins/`, `styles.css`
- **Действие:** optional badge color из plugin manifest
- **Проверка:** fixture plugin имеет цвет в списке


**119 · S · Авто-генерация шрифтовых схем для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_font_schemes` — typography hints для plugin docs UI
- **Файлы:** `plugins/`, `styles.css`
- **Действие:** font stack в plugin settings schema
- **Проверка:** preview применяет схему


**120 · S · Авто-генерация onboarding-гайдов для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_onboarding` — первый plugin за 5 шагов
- **Файлы:** `docs/plugin-authoring.md`, `SkillsPanel.tsx`
- **Действие:** MD + optional GIF
- **Проверка:** гайд совпадает с hot-reload flow


**121 · S · Авто-генерация user-гайдов для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_user_guides` — как установить/включить plugin
- **Файлы:** `IntegrationsTab.tsx`, `docs/`
- **Действие:** end-user MD без внутренних деталей
- **Проверка:** 3+ шага для fixture plugin


**122 · S · Авто-генерация документации по API worktree** — уровень 4
- **Цель:** tool `generate_worktree_api_docs` — create/list/remove, chat binding
- **Файлы:** `gitWorktree.ts`, `chats.ts`, `docs/`
- **Действие:** MD: IPC, agent root resolution
- **Проверка:** docs описывают `worktreePath` и `resolveProjectRoot`


**123 · S · Авто-генерация аудио-версии архитектурных диаграмм** — уровень 4
- **Цель:** tool `generate_architecture_diagram_audio` — TTS описания Mermaid/arch diagrams
- **Файлы:** `agentTools/integrations.ts`, `ArchitecturePanel.tsx`
- **Действие:** diagram text → аудио MP3/WAV по узлам
- **Проверка:** аудио создаётся из fixture architecture diagram


**124 · S · Авто-генерация аудио-версии потоковых диаграмм** — уровень 4
- **Цель:** tool `generate_dataflow_diagram_audio` — озвучка dataflow DFD (п. 495–504)
- **Файлы:** `agentTools/integrations.ts`, `MessageBody.tsx`
- **Действие:** flowchart MD → TTS по шагам
- **Проверка:** аудио соответствует fixture dataflow diagram


**125 · S · Авто-генерация аудио-версии отчётов по качеству** — уровень 4
- **Цель:** tool `generate_quality_report_audio` — озвучка quality/arch quality reports
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** summary findings → TTS
- **Проверка:** аудио для fixture quality report


**126 · S · Авто-генерация GIF-анимаций потоков данных** — уровень 4
- **Цель:** tool `generate_dataflow_gifs` — GIF анимация dataflow в ArchitecturePanel
- **Файлы:** `ArchitecturePanel.tsx`, `docs/`
- **Действие:** step-through flow → GIF
- **Проверка:** GIF в docs открывается


**127 · S · Авто-генерация баннеров для архитектурных отчётов** — уровень 4
- **Цель:** tool `generate_architecture_report_banners` — cover images для arch reports
- **Файлы:** `agentTools/integrations.ts`, `docs/`
- **Действие:** PNG/SVG из diagram thumbnail + title
- **Проверка:** баннер для fixture arch report


**128 · S · Авто-генерация иконок для архитектурных панелей** — уровень 4
- **Цель:** tool `generate_architecture_panel_icons` — SVG для ArchitecturePanel tabs
- **Файлы:** `ArchitecturePanel.tsx`, `app/resources/`
- **Действие:** иконки graph/module/layer 24px
- **Проверка:** иконки видны в панели


**129 · S · Авто-генерация цветовых схем для архитектурных панелей** — уровень 4
- **Цель:** tool `generate_architecture_color_schemes` — palette для node types
- **Файлы:** `ArchitecturePanel.tsx`, `styles.css`
- **Действие:** module/layer/ipc — разные accent colors
- **Проверка:** legend соответствует цветам на графе


**130 · S · Авто-генерация шрифтовых схем для архитектурных панелей** — уровень 4
- **Цель:** tool `generate_architecture_font_schemes` — typography для labels/tooltips
- **Файлы:** `ArchitecturePanel.tsx`, `styles.css`
- **Действие:** font-size scale для graph UI
- **Проверка:** labels читаемы при zoom


**131 · S · Авто-генерация onboarding-гайдов для архитектурных панелей** — уровень 4
- **Цель:** tool `generate_architecture_panel_onboarding` — первые 3 шага с графом
- **Файлы:** `OnboardingWizard.tsx`, `ArchitecturePanel.tsx`
- **Действие:** MD + optional GIF open panel
- **Проверка:** гайд совпадает с UI flow


**132 · S · Авто-генерация user-гайдов для архитектурных панелей** — уровень 4
- **Цель:** tool `generate_architecture_panel_user_guide` — end-user без dev деталей
- **Файлы:** `docs/`, `ArchitecturePanel.tsx`
- **Действие:** сценарии: открыть, фильтр, экспорт
- **Проверка:** 3+ шага для пользователя


**133 · S · Авто-генерация документации по API потоковых диаграмм** — уровень 4
- **Цель:** tool `generate_dataflow_diagram_api_docs` — tools `generate_*_dataflow_diagram`
- **Файлы:** `agentTools/core.ts`, `docs/`
- **Действие:** список tools, параметры, output format
- **Проверка:** docs перечисляют dataflow tools из п. 495–504


### 🟡 M — средние

> Несколько файлов, IPC/тесты/E2E, умеренный объём работы. Пункты **147–522**.
