# S: UI, интеграции и уведомления

Пункты **1-23** - каждый пункт = **один инструмент агента** `find_*`, который возвращает **текстовый отчет в чат** без правки кода пользователя.

**Шаблон реализации для всех пунктов ниже:**

1. Модуль анализа в `app/electron/main/<name>Analysis.ts` или `*Index.ts`
2. Схема tool в `app/electron/main/agentTools/core.ts`
3. Handler в `agentHandlersProjectSearch.ts` или `agentHandlersProjectTerminal.ts`
4. Имя в `AGENT_TOOL_NAMES` (`app/shared/toolCalls.ts`) и `agentToolExecutor.ts`
5. Unit-тест `app/tests/<name>.test.ts` - минимум один позитивный и один негативный
6. **Проверка:** `npm test -- <name>.test.ts` + вызов tool агентом -> отчет

Всего пунктов: 23.

**1 · S · Tool `find_import_issues`**
- **Цель:** отчет об import/require на несуществующие файлы или нерешенные алиасы
- **Файлы:** `importIssueAnalysis.ts`, `symbolIndex.ts`, `agentTools/core.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** разбор import-путей относительно `tsconfig` paths; проверка `fs.existsSync`
- **Проверка:** `npm test -- importIssueAnalysis.test.ts`; `find_import_issues()` -> отчет

**2 · S · Tool `find_missing_tests`**
- **Цель:** список исходников `*.ts`/`*.tsx` без пары `*.test.ts`/`*.spec.ts` рядом или в `tests/`
- **Файлы:** `missingTestAnalysis.ts`, `agentTools/core.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** обход дерева; сопоставление по basename; исключить `*.d.ts`, конфиги, `out/`
- **Проверка:** `npm test -- missingTestAnalysis.test.ts`; `find_missing_tests()` -> список файлов

**3 · S · Tool `find_rerender_candidates`**
- **Цель:** отчет о React-компонентах `.tsx` без `memo`/`useMemo`/`useCallback`, экспортируемых из `components/` и принимающих props
- **Файлы:** `rerenderCandidateAnalysis.ts`, `agentTools/core.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** AST JSX: `function X(` / `export function` + props interface; эвристика "кандидат на мемоизацию"
- **Проверка:** `npm test -- rerenderCandidateAnalysis.test.ts`; `find_rerender_candidates({ path: "app/src/components" })`

**4 · S · Tool `find_merge_conflicts`**
- **Цель:** отчет о маркерах merge-конфликта `<<<<<<<`, `=======`, `>>>>>>>` в проекте
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectFile.ts` или Search
- **Действие:** ripgrep по проекту; формат `[n] path:line`
- **Проверка:** `npm test -- mergeConflictScan.test.ts`; `find_merge_conflicts()` -> отчет или "не найдено"

**5 · S · Tool `find_commit_message_issues`**
- **Цель:** отчет о commit-сообщениях не по Conventional Commits в последних N коммитах
- **Файлы:** `commitMessageAnalysis.ts`, `gitTools.ts`, `agentTools/core.ts`, `agentHandlersProjectGit.ts`
- **Действие:** `git log -n 50 --format=%s`; regex `^(feat|fix|docs|...)(\\(.+\\))?!?:`
- **Проверка:** `npm test -- commitMessageAnalysis.test.ts`; `find_commit_message_issues()` -> отчет

**6 · S · Tool `find_docker_port_issues`**
- **Цель:** отчет о конфликтах портов и publish без bind в `docker-compose.yml`
- **Файлы:** `dockerComposeAnalysis.ts`, `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`
- **Действие:** parse YAML; собрать `ports:`; найти дубликаты host-портов
- **Проверка:** `npm test -- dockerComposeAnalysis.test.ts`; `find_docker_port_issues()` -> отчет

**7 · S · Tool `find_docker_env_issues`**
- **Цель:** отчет о переменных из `docker-compose` `environment`, отсутствующих в `.env.example`
- **Файлы:** `dockerComposeAnalysis.ts`, `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`
- **Действие:** сравнение ключей compose vs `.env` / `.env.example`
- **Проверка:** `npm test -- dockerComposeAnalysis.test.ts`; `find_docker_env_issues()` -> отчет

**8 · S · Tool `find_p2p_credit_issues`**
- **Цель:** отчет о некорректных P2P-кредитах: отрицательный баланс, NaN, лимиты в `server/p2p/credits.ts`
- **Файлы:** `p2pCreditAnalysis.ts`, `agentTools/core.ts`, handler P2P/terminal
- **Действие:** статический разбор + runtime read credits store при наличии
- **Проверка:** `npm test -- p2pCreditAnalysis.test.ts`; `find_p2p_credit_issues()` -> отчет

**9 · S · Tool `find_p2p_connection_issues`**
- **Цель:** отчет о невалидных WSS URL и reconnect backoff в `p2pClient.ts` и settings
- **Файлы:** `p2pConnectionAnalysis.ts`, `p2pClient.ts`, `agentTools/core.ts`
- **Действие:** проверка URL, таймаутов, `maxRetries`; ping health endpoint если настроен
- **Проверка:** `npm test -- p2pConnectionAnalysis.test.ts`; `find_p2p_connection_issues()` -> отчет

**10 · S · Tool `find_skill_file_issues`**
- **Цель:** отчет о битых SKILL.md: нет frontmatter, пустой trigger, дубликаты trigger
- **Файлы:** `skillFileAnalysis.ts`, `skills.ts`, `agentTools/core.ts`, `agentHandlersSkills.ts`
- **Действие:** обход skills dir; parse markdown; cross-check с `list_skills`
- **Проверка:** `npm test -- skillFileAnalysis.test.ts`; `find_skill_file_issues()` -> отчет

**11 · S · Tool `find_symbol_index_issues`**
- **Цель:** отчет о рассинхроне символьного индекса (ts/js/py): stale entries, файлы без индекса
- **Файлы:** `symbolIndexHealth.ts`, `symbolIndex.ts`, `agentTools/core.ts`
- **Действие:** сравнить mtime файлов vs index; smoke `find_symbol`
- **Проверка:** `npm test -- symbolIndexHealth.test.ts`; `find_symbol_index_issues()` -> отчет

**12 · S · Tool `find_prompt_template_issues`**
- **Цель:** отчет о битых шаблонах в `docs/example-prompts.md` и BehaviorTab slash-templates: пустой trigger, дубликаты
- **Файлы:** `promptTemplateAnalysis.ts`, `agentTools/core.ts`
- **Действие:** parse markdown-секций + settings templates; validate `/trigger` uniqueness
- **Проверка:** `npm test -- promptTemplateAnalysis.test.ts`; `find_prompt_template_issues()` -> отчет

**13 · S · Tool `find_toast_a11y_issues`**
- **Цель:** отчет о toast без `role="status"` / `aria-live` в `Toast.tsx`, `App.tsx`, `McpHealthToastListener`
- **Файлы:** `toastA11yAnalysis.ts` (переиспользовать паттерн `ariaJsxAnalysis.ts`), `agentTools/core.ts`
- **Действие:** AST JSX по списку файлов; правила live-region
- **Проверка:** `npm test -- toastA11yAnalysis.test.ts`; `find_toast_a11y_issues()` -> отчет

**14 · S · Tool `find_env_issues`**
- **Цель:** отчет о ключах `.env`, не описанных в Zod/settings, и наоборот - required без значения
- **Файлы:** `envIssueAnalysis.ts`, `settings.ts`, `agentTools/core.ts`
- **Действие:** parse dotenv; diff с `PersistedSettingsSchema` и documented keys
- **Проверка:** `npm test -- envIssueAnalysis.test.ts`; `find_env_issues()` -> отчет

**15 · S · Tool `find_rag_model_issues`**
- **Цель:** отчет о недоступных embedding-моделях (Ollama/OpenAI) из settings vs `rag.ts`
- **Файлы:** `ragModelHealth.ts`, `rag.ts`, `agentTools/core.ts`
- **Действие:** read settings embedding model id; ping provider / list models; mismatch dimension
- **Проверка:** `npm test -- ragModelHealth.test.ts`; `find_rag_model_issues()` -> отчет

**16 · S · Tool `find_index_param_issues`**
- **Цель:** отчет о некорректных параметрах индексации (chunk size, overlap, batch) в settings и `rag.ts`
- **Файлы:** `indexParamAnalysis.ts`, `rag.ts`, `agentTools/core.ts`
- **Действие:** validate ranges (chunk 256-8192, overlap < chunk); Zod bounds
- **Проверка:** `npm test -- indexParamAnalysis.test.ts`; `find_index_param_issues()` -> отчет

**17 · S · Tool `find_orchestrator_issues`**
- **Цель:** отчет о несовместимой orchestrator-модели: не в listModels, слишком мала для planner
- **Файлы:** `orchestratorHealth.ts`, `orchestratorModel.ts`, `ModelTab.tsx`, `agentTools/core.ts`
- **Действие:** read `orchestratorModel` setting; verify against provider list + min context
- **Проверка:** `npm test -- orchestratorHealth.test.ts`; `find_orchestrator_issues()` -> отчет

**18 · S · Tool `find_vision_model_issues`**
- **Цель:** отчет о vision-модели в settings без поддержки image input
- **Файлы:** `visionModelHealth.ts`, `settings.ts`, `MessageBody.tsx`, `agentTools/core.ts`
- **Действие:** cross-check model id с known vision-capable list / provider metadata
- **Проверка:** `npm test -- visionModelHealth.test.ts`; `find_vision_model_issues()` -> отчет

**19 · S · Tool `find_explorer_subagent_issues`**
- **Цель:** отчет о некорректных настройках Explorer-субагента (model, tools, timeout) в `subagentRunner.ts`
- **Файлы:** `subagentConfigAnalysis.ts`, `subagentRunner.ts`, `agentTools/core.ts`
- **Действие:** validate role `explorer` block: model set, enabled tools non-empty, timeout > 0
- **Проверка:** `npm test -- subagentConfigAnalysis.test.ts`; `find_explorer_subagent_issues()` -> отчет

**20 · S · Tool `find_reviewer_subagent_issues`**
- **Цель:** то же для Reviewer-субагента
- **Файлы:** `subagentConfigAnalysis.ts`, `subagentRunner.ts`, `agentTools/core.ts`
- **Действие:** validate role `reviewer` block в settings/subagentRunner
- **Проверка:** `npm test -- subagentConfigAnalysis.test.ts`; `find_reviewer_subagent_issues()` -> отчет

**21 · S · Tool `find_architect_subagent_issues`**
- **Цель:** то же для Architect-субагента
- **Файлы:** `subagentConfigAnalysis.ts`, `subagentRunner.ts`, `agentTools/core.ts`
- **Действие:** validate role `architect` block
- **Проверка:** `npm test -- subagentConfigAnalysis.test.ts`; `find_architect_subagent_issues()` -> отчет

**22 · S · Tool `find_performance_subagent_issues`**
- **Цель:** то же для Performance-субагента
- **Файлы:** `subagentConfigAnalysis.ts`, `subagentRunner.ts`, `agentTools/core.ts`
- **Действие:** validate role `performance` block
- **Проверка:** `npm test -- subagentConfigAnalysis.test.ts`; `find_performance_subagent_issues()` -> отчет

**23 · S · Tool `find_settings_path_issues`**
- **Цель:** отчет о битых путях в `settings.json` (`sourceRootOverride`, `gitRepoRoot`, `orchestratorModelPath`, `recentProjects`)
- **Файлы:** `settingsPathAnalysis.ts`, `settings.ts`, `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`
- **Действие:** `loadSettings()` + проверка полей-путей через `access()`; список битых путей
- **Проверка:** `npm test -- settingsPathAnalysis.test.ts`; `find_settings_path_issues()` -> отчет

