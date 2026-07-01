# M: Developer-гайды и API-документация

Пункты 451–466: гайды для разработчиков, wiki и API архитектурных панелей.

Всего пунктов: 16.

**451 · M · Авто-генерация developer-гайдов** — уровень 4
- **Цель:** tool `generate_developer_guides` — расширенный dev guide по модулям
- **Файлы:** `CONTRIBUTING.md`, `agentTools/integrations.ts`
- **Действие:** разделы: setup, agent, IPC, tests
- **Проверка:** guide содержит команды из `app/package.json`


**452 · M · Авто-генерация документации по API плагинов** — уровень 4
- **Цель:** tool `generate_plugin_api_docs` — reference из plugin schema
- **Файлы:** `docs/plugin-authoring.md`, `agentTools/core.ts`
- **Действие:** scan plugins → OpenAPI-like MD или TypeDoc
- **Проверка:** API fixture-плагина задокументирован


**453 · M · Авто-генерация видео-обзоров архитектуры** — уровень 4
- **Цель:** tool `generate_architecture_video` — скринкаст + озвучка arch-диаграмм
- **Файлы:** `agentTools/integrations.ts`, `ArchitecturePanel.tsx`
- **Действие:** Mermaid/diagrams + TTS → MP4
- **Проверка:** видео из fixture arch materials (mock ffmpeg)


**454 · M · Авто-генерация видео-обзоров CI/CD** — уровень 4
- **Цель:** tool `generate_cicd_video` — обзор pipeline и workflow
- **Файлы:** `agentTools/integrations.ts`, `.github/workflows/*`
- **Действие:** diagram CI/CD + TTS + terminal capture
- **Проверка:** MP4 описывает fixture workflow


**455 · M · Авто-генерация маркетинговых материалов для релизов** — уровень 4
- **Цель:** tool `generate_release_marketing_pack` — тексты + visuals к `vX.Y.Z`
- **Файлы:** `agentTools/integrations.ts`, `gitTools.ts`, `docs/marketing/`
- **Действие:** CHANGELOG + features → social copy + images
- **Проверка:** пакет файлов для fixture-тега


**456 · M · Авто-генерация тем оформления для субагентов** — уровень 4
- **Цель:** tool `generate_subagent_themes` — accent color per subagent в UI
- **Файлы:** `styles.css`, `subagentRunner.ts`, `AgentStatusBar.tsx`
- **Действие:** CSS variables `--subagent-reviewer`, etc.
- **Проверка:** делегирование визуально различимо по цвету


**457 · M · Авто-генерация UX-гайдов для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_ux_guides` — UX patterns для plugin authors
- **Файлы:** `docs/plugin-authoring.md`, `agentTools/integrations.ts`
- **Действие:** MD: tool naming, errors, permissions
- **Проверка:** `docs/plugin-ux-guide.md` создан


**458 · M · Авто-генерация developer-гайдов для плагинов** — уровень 4
- **Цель:** tool `generate_plugin_dev_guides` — API, schema, debugging
- **Файлы:** `docs/plugin-authoring.md`, `plugins/`
- **Действие:** расширенный dev guide из fixture plugin
- **Проверка:** guide содержит schema example


**459 · M · Авто-генерация документации по API RAG** — уровень 4
- **Цель:** tool `generate_rag_api_docs` — index, search, embed API
- **Файлы:** `rag.ts`, `vectorStore.ts`, `docs/`
- **Действие:** reference из кода + settings keys
- **Проверка:** docs описывают `search_knowledge_base`


**460 · M · Авто-генерация видео-обзоров архитектуры UI** — уровень 4
- **Цель:** tool `generate_ui_architecture_video` — скринкаст UI + диаграммы + озвучка
- **Файлы:** `ArchitecturePanel.tsx`, `app/src/components/`, `agentTools/integrations.ts`
- **Действие:** capture panels → MP4 + TTS
- **Проверка:** видео из fixture UI arch materials (mock ffmpeg)


**461 · M · Авто-генерация видео-обзоров архитектуры backend** — уровень 4
- **Цель:** tool `generate_backend_architecture_video` — обзор main modules + diagrams
- **Файлы:** `agentTools/integrations.ts`, `app/electron/main/`
- **Действие:** terminal/log capture + architecture diagram + TTS
- **Проверка:** MP4 описывает fixture backend layers


**462 · M · Авто-генерация маркетинговых видео для релизов** — уровень 4
- **Цель:** tool `generate_release_marketing_video` — promo video к `vX.Y.Z`
- **Файлы:** `agentTools/integrations.ts`, `gitTools.ts`, `docs/marketing/`
- **Действие:** CHANGELOG highlights + screencast → MP4
- **Проверка:** видео для fixture-тега создаётся


**463 · M · Авто-генерация тем оформления для архитектурных панелей** — уровень 4
- **Цель:** tool `generate_architecture_panel_themes` — CSS для graph nodes/edges
- **Файлы:** `ArchitecturePanel.tsx`, `styles.css`
- **Действие:** light/dark graph theme variables
- **Проверка:** граф читаем в обеих темах


**464 · M · Авто-генерация UX-гайдов для архитектурных панелей** — уровень 4
- **Цель:** tool `generate_architecture_panel_ux_guide` — как читать граф, zoom, filter
- **Файлы:** `ArchitecturePanel.tsx`, `docs/`
- **Действие:** MD + screenshots
- **Проверка:** `docs/architecture-panel-ux.md` создан


**465 · M · Авто-генерация developer-гайдов для архитектурных панелей** — уровень 4
- **Цель:** tool `generate_architecture_panel_dev_guide` — API панели, data sources, extend
- **Файлы:** `ArchitecturePanel.tsx`, `agentHandlersProjectSearch.ts`
- **Действие:** dev MD из кода
- **Проверка:** guide описывает graph build pipeline


**466 · M · Авто-генерация документации по API архитектурных панелей** — уровень 4
- **Цель:** tool `generate_architecture_panel_api_docs` — IPC, props, graph format
- **Файлы:** `ArchitecturePanel.tsx`, `docs/`
- **Действие:** reference MD
- **Проверка:** docs описывают graph IPC/events


### 🟠 L — крупные

> Много компонентов, новые подсистемы, длительная проверка. Пункты **522–522**.
