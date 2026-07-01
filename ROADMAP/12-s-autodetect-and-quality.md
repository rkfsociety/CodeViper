# S: Автодетект настроек и качество кода

Пункты 17–45: авто-обнаружение проблем в настройках, тестах и инфраструктуре.

Всего пунктов: 29.

**17 · S · Tool `find_collective_memory_issues`** — уровень 3
- **Цель:** отчёт о битых collective-memory правилах: нет `.codeviper/rules.md`, пустой sync URL, конфликт версий
- **Файлы:** `collectiveMemoryAnalysis.ts`, `collectiveMemorySync.ts`, `AgentLearningPanel.tsx`, `agentTools/core.ts`
- **Действие:** read settings + rules file; validate markdown frontmatter; list missing/invalid entries
- **Проверка:** `npm test -- collectiveMemoryAnalysis.test.ts`; `find_collective_memory_issues()` → отчёт


**18 · S · Tool `find_chat_template_issues`** — уровень 3
- **Цель:** отчёт о шаблонах чатов с пустым title/prompt, дубликатами id, битым `projectPath`
- **Файлы:** `chatTemplateAnalysis.ts`, `chats.ts`, `ChatHistoryPanel.tsx`, `agentTools/core.ts`
- **Действие:** parse chat store/templates; `access()` на пути проекта
- **Проверка:** `npm test -- chatTemplateAnalysis.test.ts`; `find_chat_template_issues()` → отчёт


**19 · S · Tool `find_split_layout_issues`** — уровень 3
- **Цель:** отчёт о некорректном `ui-layout.json`: отрицательные ширины, сумма > viewport, unknown panel keys
- **Файлы:** `splitLayoutAnalysis.ts`, `App.tsx`, `settings.ts`, `agentTools/core.ts`
- **Действие:** Zod-схема layout; compare с известными ключами панелей из `persistLayout`
- **Проверка:** `npm test -- splitLayoutAnalysis.test.ts`; `find_split_layout_issues()` → отчёт


**20 · S · Tool `find_quick_open_issues`** — уровень 3
- **Цель:** отчёт о регрессиях fuzzy quick-open: пустой индекс, файлы вне проекта в результатах, дубликаты
- **Файлы:** `quickOpenAnalysis.ts`, `QuickOpenPalette.tsx`, `agentTools/core.ts`
- **Действие:** smoke-тест scorer на fixture-дереве; проверка нормализации пути
- **Проверка:** `npm test -- quickOpenAnalysis.test.ts`; `find_quick_open_issues({ path: "app/src" })` → отчёт


**21 · S · Tool `find_code_editor_issues`** — уровень 3
- **Цель:** отчёт о настройках CodeMirror: theme без CSS, tabSize вне 2–8, wrap без грамматики
- **Файлы:** `codeEditorAnalysis.ts`, `CodeEditorPanel.tsx`, `settings.ts`, `agentTools/core.ts`
- **Действие:** read editor settings; static check props passed to CodeMirror
- **Проверка:** `npm test -- codeEditorAnalysis.test.ts`; `find_code_editor_issues()` → отчёт


**22 · S · Tool `find_mcp_server_issues`** — уровень 3
- **Цель:** отчёт о MCP-серверах: пустой command, невалидный transport, дубликаты name, битый `cwd`
- **Файлы:** `mcpServerAnalysis.ts`, `IntegrationsTab.tsx`, `settings.ts`, `agentTools/core.ts`
- **Действие:** validate `McpServerConfig[]` из settings; optional spawn dry-run
- **Проверка:** `npm test -- mcpServerAnalysis.test.ts`; `find_mcp_server_issues()` → отчёт


**23 · S · Tool `find_enabled_tools_issues`** — уровень 3
- **Цель:** отчёт о `enabledTools` / `disabledTools`: unknown name, все tools выключены, core tools заблокированы
- **Файлы:** `enabledToolsAnalysis.ts`, `agentTools/index.ts`, `AGENT_TOOL_NAMES`, `settings.ts`
- **Действие:** diff settings vs `getAllToolNames()`; warn если нет `read_file`/`grep_files`
- **Проверка:** `npm test -- enabledToolsAnalysis.test.ts`; `find_enabled_tools_issues()` → отчёт


**24 · S · Tool `find_tool_description_issues`** — уровень 3
- **Цель:** отчёт о tool schema: пустой `description`, < 20 символов, дубликаты между tools
- **Файлы:** `toolSchemaAnalysis.ts`, `agentTools/*.ts`, `agentTools/core.ts`
- **Действие:** обход `AGENT_TOOLS`; lint descriptions
- **Проверка:** `npm test -- toolSchemaAnalysis.test.ts`; `find_tool_description_issues()` → отчёт


**25 · S · Tool `find_tool_param_issues`** — уровень 3
- **Цель:** отчёт о JSON-schema параметров: `required` без properties, тип `object` без properties, нет `description` у required
- **Файлы:** `toolSchemaAnalysis.ts`, `agentTools/*.ts`
- **Действие:** validate each tool parameters against JSON Schema subset
- **Проверка:** `npm test -- toolSchemaAnalysis.test.ts`; `find_tool_param_issues()` → отчёт


**26 · S · Tool `find_tool_error_issues`** — уровень 3
- **Цель:** отчёт о handlers, возвращающих голый `throw`/`Error` без текста для агента или глотающих ошибки
- **Файлы:** `toolHandlerAnalysis.ts`, `agentHandlers*.ts`, `agentToolExecutor.ts`
- **Действие:** AST/grep: `catch {}` без return; `throw new Error()` без message
- **Проверка:** `npm test -- toolHandlerAnalysis.test.ts`; `find_tool_error_issues()` → отчёт


**27 · S · Tool `find_tool_fallback_issues`** — уровень 3
- **Цель:** отчёт о `fallbackModels`: модель не в listModels, дубликаты, primary === fallback
- **Файлы:** `toolFallbackAnalysis.ts`, `modelRuntime.ts`, `settings.ts`
- **Действие:** read settings; cross-check provider list (mock in test)
- **Проверка:** `npm test -- toolFallbackAnalysis.test.ts`; `find_tool_fallback_issues()` → отчёт


**28 · S · Tool `find_switch_issues`** — уровень 3
- **Цель:** отчёт о неполных `switch` в main: нет `default`, fall-through без comment, enum switch без всех case
- **Файлы:** `switchAnalysis.ts`, `agentTools/core.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** TypeScript AST `SwitchStatement`; rule `switch-incomplete`
- **Проверка:** `npm test -- switchAnalysis.test.ts`; `find_switch_issues({ path: "app/electron/main" })` → отчёт


**29 · S · Tool `find_throw_issues`** — уровень 3
- **Цель:** отчёт о `throw` с нетипизированной строкой, `throw err` без re-wrap, throw в renderer paths
- **Файлы:** `throwAnalysis.ts`, `agentHandlers*.ts`
- **Действие:** AST ThrowStatement; flag empty literal
- **Проверка:** `npm test -- throwAnalysis.test.ts`; `find_throw_issues()` → отчёт


**30 · S · Tool `find_default_export_issues`** — уровень 3
- **Цель:** отчёт о `export default` в main/shared (нарушение конвенции CodeViper — только named export)
- **Файлы:** `exportStyleAnalysis.ts`, `symbolIndex.ts`, `agentTools/core.ts`
- **Действие:** AST `ExportAssignment` / `export default` в `app/electron/main` и `app/shared`
- **Проверка:** `npm test -- exportStyleAnalysis.test.ts`; `find_default_export_issues()` → отчёт


**31 · S · Tool `find_import_alias_issues`** — уровень 3
- **Цель:** отчёт о import alias `@/` в main process или конфликт alias с `tsconfig paths`
- **Файлы:** `importAliasAnalysis.ts`, `symbolIndex.ts`, `tsconfig.json`
- **Действие:** AST ImportDeclaration; match vs allowed alias list
- **Проверка:** `npm test -- importAliasAnalysis.test.ts`; `find_import_alias_issues()` → отчёт

---

## Диагностика hardcoded-путей в UI/main (48)


**32 · S · Tool `find_hardcoded_path_issues`** — уровень 3
- **Цель:** один tool вместо 16 однотипных: отчёт о подозрительных путях в исходниках (абсолютные Windows/C: paths, `F:\\`, `/Users/`, `../` вне проекта, устаревшие `QuickOpen.tsx`)
- **Файлы:** `hardcodedPathAnalysis.ts`, `agentTools/core.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** regex + AST string literal scan; параметр `files[]`; **дефолтный список:**
  `FilePreviewPanel.tsx`, `ChatHistoryPanel.tsx`, `TracePanel.tsx`, `TerminalPanel.tsx`, `OnboardingWizard.tsx`, `AutomationsTab.tsx`, `BehaviorTab.tsx`, `SkillsPanel.tsx`, `SelfImprovePanel.tsx`, `QueueContext.tsx`, `agentContext.ts`, `agentHandlersProject*.ts`, `modelRuntime.ts`, `commandRunner.ts`, `ipcContracts.ts`, `electron/main/index.ts`
- **Проверка:** `npm test -- hardcodedPathAnalysis.test.ts`; `find_hardcoded_path_issues()` → отчёт с `path:line`

---

## UI-фичи (49–56) — не tools, правки renderer/settings


**33 · S · Режим высокой контрастности** — уровень 4
- **Цель:** класс `high-contrast` на `:root` для слабовидящих
- **Файлы:** `styles.css`, `PerformanceTab.tsx`, `settings.ts`, `PersistedSettingsSchema`
- **Действие:** тумблер `highContrastMode`; контрастные CSS-переменные для border/focus
- **Проверка:** включить в Settings → границы панелей и кнопок заметно контрастнее в `.exe`


**34 · S · Цвет папки чатов** — уровень 4
- **Цель:** `ChatFolder.color?: string` — цветная полоска у заголовка папки
- **Файлы:** `types.ts`, `chats.ts`, `ChatHistoryPanel.tsx`
- **Действие:** color picker в контекстном меню папки; persist в chat store
- **Проверка:** цвет виден после reload


**35 · S · Фильтр по тегам в SkillsPanel** — уровень 4
- **Цель:** фильтрация skills по тегам из frontmatter SKILL.md
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`
- **Действие:** parse tags; UI chip filter
- **Проверка:** фильтр по тегу сужает список


**36 · S · Сохранение последнего benchmark** — уровень 4
- **Цель:** `lastBenchmark: BenchmarkResult` в settings после прогона
- **Файлы:** `settings.ts`, `ModelTab.tsx`
- **Действие:** save on benchmark complete; show summary on reopen
- **Проверка:** результат виден после reopen Settings


**37 · S · Long paths на Windows** — уровень 4
- **Цель:** документ + manifest для путей > 260 символов
- **Файлы:** `app/package.json` (electron-builder), `docs/troubleshooting.md`
- **Действие:** `longPathAware`/known issue; инструкция включить Win32 long paths
- **Проверка:** fixture deep path открывается без ENOENT


**38 · S · Авто-озвучка ошибок агента** — уровень 4
- **Цель:** TTS при ошибке прогона (опционально)
- **Файлы:** `useAgentStream.ts`, `settings.ts`, `BehaviorTab.tsx`
- **Действие:** тумблер `autoSpeakErrors`; `speechSynthesis` на `agent-stream` error
- **Проверка:** mock-ошибка → короткая фраза при включённой настройке


**39 · S · Авто-озвучка успешного завершения** — уровень 4
- **Цель:** TTS «Готово» при успешном `stop_reason`
- **Файлы:** `useAgentStream.ts`, `AgentStatusBar.tsx`, `settings.ts`
- **Действие:** тумблер `autoSpeakDone`; не озвучивать если вкладка в фокусе (optional)
- **Проверка:** успешный прогон → озвучка при включённой настройке

---

## Tools генерации и деплоя (57–62)


**40 · S · Tool `publish_docker_image`** — уровень 4
- **Цель:** push образа в registry после `docker build`
- **Файлы:** `dockerPublish.ts`, `agentTools/integrations.ts`, `commandRunner.ts`
- **Действие:** `docker login` + `docker push`; **ask-mode** подтверждение; args: `tag`, `registry?`
- **Проверка:** `npm test -- dockerPublish.test.ts` (mock exec); tool → URL/tag в чате


**41 · S · Tool `deploy_vercel` / `deploy_netlify`** — уровень 4
- **Цель:** деплой через CLI/API; token из settings
- **Файлы:** `deployHosting.ts`, `agentTools/integrations.ts`, `IntegrationsTab.tsx`
- **Действие:** два tool или `provider` enum; preview vs production flag
- **Проверка:** mock API → deployment URL в ответе агента


**42 · S · Tool `generate_helm_chart`** — уровень 4
- **Цель:** `charts/<name>/` — Chart.yaml + templates из Dockerfile/compose
- **Файлы:** `helmChartGenerator.ts`, `agentTools/core.ts`, `agentHandlersProjectFile.ts`
- **Действие:** шаблон deployment+service; write files; не push cluster
- **Проверка:** `helm template charts/<name>` без ошибок на fixture


**43 · S · Tool `generate_ansible_role`** — уровень 4
- **Цель:** роль в `ansible/roles/<name>/` (tasks, handlers, templates)
- **Файлы:** `ansibleRoleGenerator.ts`, `agentTools/core.ts`, `agentHandlersProjectFile.ts`
- **Действие:** scaffold + tasks из package.json scripts
- **Проверка:** `ansible-playbook --syntax-check` на сгенерированном playbook


**44 · S · Tool `generate_github_actions`** — уровень 4
- **Цель:** `.github/workflows/ci.yml` — typecheck + test + build из `package.json` scripts
- **Файлы:** `githubActionsGenerator.ts`, `agentTools/integrations.ts`, `agentHandlersProjectFile.ts`
- **Действие:** detect scripts; write workflow; idempotent skip if exists unless `force`
- **Проверка:** YAML parse; steps match `npm run test` / `npm run build`


**45 · S · Tool `generate_gitlab_ci`** — уровень 4
- **Цель:** `.gitlab-ci.yml` — stages build/test/deploy
- **Файлы:** `gitlabCiGenerator.ts`, `agentTools/integrations.ts`
- **Действие:** template по стеку (node/go/rust); write file
- **Проверка:** GitLab CI lint API или local schema validate на fixture
