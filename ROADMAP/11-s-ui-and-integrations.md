# S: UI, интеграции и уведомления

Пункты **1–27** — каждый пункт = **один инструмент агента** `find_*`, который возвращает **текстовый отчёт в чат** (без правки кода пользователя).

**Шаблон реализации (для всех пунктов ниже):**

1. Модуль анализа в `app/electron/main/<name>Analysis.ts` (или `*Index.ts`)
2. Схема tool в `app/electron/main/agentTools/core.ts`
3. Handler в `agentHandlersProjectSearch.ts` или `agentHandlersProjectTerminal.ts`
4. Имя в `AGENT_TOOL_NAMES` (`app/shared/toolCalls.ts`) и `agentToolExecutor.ts`
5. Unit-тест `app/tests/<name>.test.ts` — минимум один позитив и один негатив
6. **Проверка:** `npm test -- <name>.test.ts` + вызов tool агентом → отчёт

Всего пунктов: 27.

**1 · S · Tool `find_magic_numbers`** — уровень 3
- **Цель:** отчёт о «магических» числовых литералах вне `shared/constants.ts` и без именованной константы рядом
- **Файлы:** `magicNumberAnalysis.ts`, `agentTools/core.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** AST ts/js; исключить 0, 1, -1, индексы массива; `formatMagicNumbersOutput`
- **Проверка:** `npm test -- magicNumberAnalysis.test.ts`; `find_magic_numbers()` → список `path:line`

**2 · S · Tool `find_unsafe_regex`** — уровень 3
- **Цель:** отчёт о regex с риском catastrophic backtracking (ReDoS)
- **Файлы:** `unsafeRegexAnalysis.ts`, `agentTools/core.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** AST + эвристики вложенных квантификаторов; `formatUnsafeRegexOutput`
- **Проверка:** `npm test -- unsafeRegexAnalysis.test.ts`; `find_unsafe_regex()` → отчёт

**3 · S · Tool `find_import_issues`** — уровень 3
- **Цель:** отчёт о import/require на несуществующие файлы или неразрешённые алиасы
- **Файлы:** `importIssueAnalysis.ts`, `symbolIndex.ts`, `agentTools/core.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** разбор import-путей относительно `tsconfig` paths; проверка `fs.existsSync`
- **Проверка:** `npm test -- importIssueAnalysis.test.ts`; `find_import_issues()` → отчёт

**4 · S · Tool `find_missing_tests`** — уровень 3
- **Цель:** список исходников `*.ts`/`*.tsx` без пары `*.test.ts` / `*.spec.ts` рядом или в `tests/`
- **Файлы:** `missingTestAnalysis.ts`, `agentTools/core.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** обход дерева; сопоставление по basename; исключить `*.d.ts`, конфиги, `out/`
- **Проверка:** `npm test -- missingTestAnalysis.test.ts`; `find_missing_tests()` → список файлов

**5 · S · Tool `find_rerender_candidates`** — уровень 3
- **Цель:** отчёт о React-компонентах `.tsx` без `memo`/`useMemo`/`useCallback`, экспортируемых из `components/` и принимающих props
- **Файлы:** `rerenderCandidateAnalysis.ts`, `agentTools/core.ts`, `agentHandlersProjectSearch.ts`
- **Действие:** AST JSX: `function X(` / `export function` + props interface; эвристика «кандидат на мемоизацию»
- **Проверка:** `npm test -- rerenderCandidateAnalysis.test.ts`; `find_rerender_candidates({ path: "app/src/components" })`

**6 · S · Tool `find_settings_path_issues`** — уровень 3
- **Цель:** отчёт о путях в `settings.json`, которых нет на диске (projectPath, codeviperSource, plugin paths)
- **Файлы:** `settingsPathAnalysis.ts`, `settings.ts`, `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`
- **Действие:** `loadSettings()` + проверка полей-путей через `access()`; список битых путей
- **Проверка:** `npm test -- settingsPathAnalysis.test.ts`; `find_settings_path_issues()` → отчёт

**7 · S · Tool `find_integration_url_issues`** — уровень 3
- **Цель:** отчёт о некорректных URL интеграций (GitHub/GitLab/Jira/Linear) в settings и `agentTools/integrations.ts`
- **Файлы:** `integrationUrlValidation.ts`, `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`
- **Действие:** Zod/regex URL; пустой host; `http` вместо `https` для API; trailing slash
- **Проверка:** `npm test -- integrationUrlValidation.test.ts`; `find_integration_url_issues()` → отчёт

**8 · S · Tool `find_cron_issues`** — уровень 3
- **Цель:** отчёт о невалидных cron в `AutomationRule` (settings + `automationScheduler.ts`)
- **Файлы:** `cronValidation.ts`, `automationScheduler.ts`, `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`
- **Действие:** parse cron (5/6 полей); список правил с ошибкой и id правила
- **Проверка:** `npm test -- cronValidation.test.ts`; `find_cron_issues()` → отчёт

**9 · S · Tool `find_merge_conflicts`** — уровень 3
- **Цель:** отчёт о маркерах merge-конфликта `<<<<<<<`, `=======`, `>>>>>>>` в проекте
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectFile.ts` (или Search)
- **Действие:** `grep_files` logic / ripgrep по проекту; формат `[n] path:line`
- **Проверка:** `npm test -- mergeConflictScan.test.ts`; `find_merge_conflicts()` → отчёт или «не найдено»

**10 · S · Tool `find_commit_message_issues`** — уровень 3
- **Цель:** отчёт о commit-сообщениях не по Conventional Commits в последних N коммитах
- **Файлы:** `commitMessageAnalysis.ts`, `gitTools.ts`, `agentTools/core.ts`, `agentHandlersProjectGit.ts`
- **Действие:** `git log -n 50 --format=%s`; regex `^(feat|fix|docs|…)(\\(.+\\))?!?:`
- **Проверка:** `npm test -- commitMessageAnalysis.test.ts`; `find_commit_message_issues()` → отчёт

**11 · S · Tool `find_docker_port_issues`** — уровень 3
- **Цель:** отчёт о конфликтах портов и publish без bind в `docker-compose.yml`
- **Файлы:** `dockerComposeAnalysis.ts`, `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`
- **Действие:** parse YAML; собрать `ports:`; дубликаты host-портов
- **Проверка:** `npm test -- dockerComposeAnalysis.test.ts`; `find_docker_port_issues()` → отчёт

**12 · S · Tool `find_docker_env_issues`** — уровень 3
- **Цель:** отчёт о переменных из `docker-compose` `environment`, отсутствующих в `.env.example`
- **Файлы:** `dockerComposeAnalysis.ts`, `agentTools/core.ts`, `agentHandlersProjectTerminal.ts`
- **Действие:** сравнение ключей compose vs `.env` / `.env.example`
- **Проверка:** `npm test -- dockerComposeAnalysis.test.ts`; `find_docker_env_issues()` → отчёт

**13 · S · Tool `find_p2p_credit_issues`** — уровень 3
- **Цель:** отчёт о некорректных P2P-кредитах (отрицательный баланс, NaN, лимиты) в `server/p2p/credits.ts`
- **Файлы:** `p2pCreditAnalysis.ts`, `agentTools/core.ts`, handler P2P/terminal
- **Действие:** статический разбор + runtime read credits store при наличии
- **Проверка:** `npm test -- p2pCreditAnalysis.test.ts`; `find_p2p_credit_issues()` → отчёт

**14 · S · Tool `find_p2p_connection_issues`** — уровень 3
- **Цель:** отчёт о невалидных WSS URL / reconnect backoff в `p2pClient.ts` и settings
- **Файлы:** `p2pConnectionAnalysis.ts`, `p2pClient.ts`, `agentTools/core.ts`
- **Действие:** проверка URL, таймаутов, `maxRetries`; ping health endpoint если настроен
- **Проверка:** `npm test -- p2pConnectionAnalysis.test.ts`; `find_p2p_connection_issues()` → отчёт

**15 · S · Tool `find_skill_file_issues`** — уровень 3
- **Цель:** отчёт о битых SKILL.md (нет frontmatter, пустой trigger, дубликаты trigger)
- **Файлы:** `skillFileAnalysis.ts`, `skills.ts`, `agentTools/core.ts`, `agentHandlersSkills.ts`
- **Действие:** обход skills dir; parse markdown; cross-check с `list_skills`
- **Проверка:** `npm test -- skillFileAnalysis.test.ts`; `find_skill_file_issues()` → отчёт

**16 · S · Tool `find_symbol_index_issues`** — уровень 3
- **Цель:** отчёт о рассинхроне символьного индекса (ts/js/py): stale entries, файлы без индекса
- **Файлы:** `symbolIndexHealth.ts`, `symbolIndex.ts`, `agentTools/core.ts`
- **Действие:** сравнить mtime файлов vs index; sample `find_symbol` smoke
- **Проверка:** `npm test -- symbolIndexHealth.test.ts`; `find_symbol_index_issues()` → отчёт

**17 · S · Tool `find_prompt_template_issues`** — уровень 3
- **Цель:** отчёт о битых шаблонов в `docs/example-prompts.md` и BehaviorTab slash-templates (пустой trigger, дубликаты)
- **Файлы:** `promptTemplateAnalysis.ts`, `agentTools/core.ts`
- **Действие:** parse markdown секций + settings templates; validate `/trigger` uniqueness
- **Проверка:** `npm test -- promptTemplateAnalysis.test.ts`; `find_prompt_template_issues()` → отчёт

**18 · S · Tool `find_toast_a11y_issues`** — уровень 3
- **Цель:** отчёт о toast без `role="status"` / `aria-live` в `Toast.tsx`, `App.tsx`, `McpHealthToastListener`
- **Файлы:** `toastA11yAnalysis.ts` (переиспользовать паттерн `ariaJsxAnalysis.ts`), `agentTools/core.ts`
- **Действие:** AST JSX по списку файлов; правила live-region
- **Проверка:** `npm test -- toastA11yAnalysis.test.ts`; `find_toast_a11y_issues()` → отчёт

**19 · S · Tool `find_env_issues`** — уровень 3
- **Цель:** отчёт о ключах `.env`, не описанных в Zod/settings, и наоборот — required без значения
- **Файлы:** `envIssueAnalysis.ts`, `settings.ts`, `agentTools/core.ts`
- **Действие:** parse dotenv; diff с `PersistedSettingsSchema` и documented keys
- **Проверка:** `npm test -- envIssueAnalysis.test.ts`; `find_env_issues()` → отчёт

**20 · S · Tool `find_rag_model_issues`** — уровень 3
- **Цель:** отчёт о недоступных embedding-моделях (Ollama/OpenAI) из settings vs `rag.ts`
- **Файлы:** `ragModelHealth.ts`, `rag.ts`, `agentTools/core.ts`
- **Действие:** read settings embedding model id; `ping` provider / list models; mismatch dimension
- **Проверка:** `npm test -- ragModelHealth.test.ts`; `find_rag_model_issues()` → отчёт

**21 · S · Tool `find_index_param_issues`** — уровень 3
- **Цель:** отчёт о некорректных параметрах индексации (chunk size, overlap, batch) в settings и `rag.ts`
- **Файлы:** `indexParamAnalysis.ts`, `rag.ts`, `agentTools/core.ts`
- **Действие:** validate ranges (chunk 256–8192, overlap < chunk); Zod bounds
- **Проверка:** `npm test -- indexParamAnalysis.test.ts`; `find_index_param_issues()` → отчёт

**22 · S · Tool `find_orchestrator_issues`** — уровень 3
- **Цель:** отчёт о несовместимой orchestrator-модели (не в listModels, слишком мала для planner)
- **Файлы:** `orchestratorHealth.ts`, `orchestratorModel.ts`, `ModelTab.tsx`, `agentTools/core.ts`
- **Действие:** read `orchestratorModel` setting; verify against provider list + min context
- **Проверка:** `npm test -- orchestratorHealth.test.ts`; `find_orchestrator_issues()` → отчёт

**23 · S · Tool `find_vision_model_issues`** — уровень 3
- **Цель:** отчёт о vision-модели в settings без поддержки image input (ChatInput attachments)
- **Файлы:** `visionModelHealth.ts`, `settings.ts`, `MessageBody.tsx`, `agentTools/core.ts`
- **Действие:** cross-check model id с known vision-capable list / provider metadata
- **Проверка:** `npm test -- visionModelHealth.test.ts`; `find_vision_model_issues()` → отчёт

**24 · S · Tool `find_explorer_subagent_issues`** — уровень 3
- **Цель:** отчёт о некорректных настройках Explorer-субагента (model, tools, timeout) в `subagentRunner.ts`
- **Файлы:** `subagentConfigAnalysis.ts`, `subagentRunner.ts`, `agentTools/core.ts`
- **Действие:** validate role `explorer` block: model set, enabled tools non-empty, timeout > 0
- **Проверка:** `npm test -- subagentConfigAnalysis.test.ts`; `find_explorer_subagent_issues()` → отчёт

**25 · S · Tool `find_reviewer_subagent_issues`** — уровень 3
- **Цель:** то же для Reviewer-субагента
- **Файлы:** `subagentConfigAnalysis.ts`, `subagentRunner.ts`, `agentTools/core.ts`
- **Действие:** validate role `reviewer` block в settings/subagentRunner
- **Проверка:** `npm test -- subagentConfigAnalysis.test.ts`; `find_reviewer_subagent_issues()` → отчёт

**26 · S · Tool `find_architect_subagent_issues`** — уровень 3
- **Цель:** то же для Architect-субагента
- **Файлы:** `subagentConfigAnalysis.ts`, `subagentRunner.ts`, `agentTools/core.ts`
- **Действие:** validate role `architect` block
- **Проверка:** `npm test -- subagentConfigAnalysis.test.ts`; `find_architect_subagent_issues()` → отчёт

**27 · S · Tool `find_performance_subagent_issues`** — уровень 3
- **Цель:** то же для Performance-субагента
- **Файлы:** `subagentConfigAnalysis.ts`, `subagentRunner.ts`, `agentTools/core.ts`
- **Действие:** validate role `performance` block
- **Проверка:** `npm test -- subagentConfigAnalysis.test.ts`; `find_performance_subagent_issues()` → отчёт
