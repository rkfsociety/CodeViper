# S: Автодетект настроек и качество кода

Пункты 33–77: авто-обнаружение проблем в настройках, тестах и инфраструктуре.

Всего пунктов: 45.

**33 · S · Авто-обнаружение неправильных настроек collective memory** — уровень 3
- **Цель:** проверка `.codeviper/rules.md`
- **Файлы:** `AgentLearningPanel.tsx`, `collectiveMemorySync.ts`
- **Действие:** tool `find_collective_memory_issues`
- **Проверка:** отчёт


**34 · S · Авто-обнаружение неправильных шаблонов чатов** — уровень 3
- **Цель:** проверка шаблонов
- **Файлы:** `ChatHistoryPanel.tsx`, `chats.ts`
- **Действие:** tool `find_chat_template_issues`
- **Проверка:** отчёт


**35 · S · Авто-обнаружение неправильных split-layout настроек** — уровень 3
- **Цель:** проверка `ui-layout.json`
- **Файлы:** `App.tsx`, `settings.ts`
- **Действие:** tool `find_split_layout_issues`
- **Проверка:** отчёт


**36 · S · Авто-обнаружение неправильных quick-open результатов** — уровень 3
- **Цель:** проверка fuzzy-поиска
- **Файлы:** `QuickOpen.tsx`
- **Действие:** tool `find_quick_open_issues`
- **Проверка:** отчёт


**37 · S · Авто-обнаружение неправильных code-editor настроек** — уровень 3
- **Цель:** проверка CodeMirror
- **Файлы:** `CodeEditorPanel.tsx`
- **Действие:** tool `find_code_editor_issues`
- **Проверка:** отчёт


**38 · S · Авто-обнаружение неправильных MCP-серверов** — уровень 3
- **Цель:** проверка MCP
- **Файлы:** `IntegrationsTab.tsx`, `settings.ts`
- **Действие:** tool `find_mcp_server_issues`
- **Проверка:** отчёт


**39 · S · Авто-обнаружение неправильных enabledTools** — уровень 3
- **Цель:** проверка списка tools
- **Файлы:** `agentTools/core.ts`, `settings.ts`
- **Действие:** tool `find_enabled_tools_issues`
- **Проверка:** отчёт


**40 · S · Авто-обнаружение неправильных tool-описаний** — уровень 3
- **Цель:** проверка descriptions
- **Файлы:** `agentTools/*`
- **Действие:** tool `find_tool_description_issues`
- **Проверка:** отчёт


**41 · S · Авто-обнаружение неправильных tool-параметров** — уровень 3
- **Цель:** проверка параметров
- **Файлы:** `agentTools/*`
- **Действие:** tool `find_tool_param_issues`
- **Проверка:** отчёт


**42 · S · Авто-обнаружение неправильных tool-ошибок** — уровень 3
- **Цель:** проверка ошибок
- **Файлы:** `agentTools/*`
- **Действие:** tool `find_tool_error_issues`
- **Проверка:** отчёт


**43 · S · Авто-обнаружение неправильных tool-fallbacks** — уровень 3
- **Цель:** проверка fallback
- **Файлы:** `agentTools/*`, `modelRuntime.ts`
- **Действие:** tool `find_tool_fallback_issues`
- **Проверка:** отчёт


**44 · S · Авто-обнаружение неправильных switch-конструкций** — уровень 3
- **Цель:** находить неполные switch
- **Файлы:** `agentTools/core.ts`
- **Действие:** tool `find_switch_issues`; анализ AST
- **Проверка:** отчёт


**45 · S · Авто-обнаружение неправильных throw-выражений** — уровень 3
- **Цель:** проверка ошибок
- **Файлы:** `agentTools/core.ts`
- **Действие:** tool `find_throw_issues`
- **Проверка:** отчёт


**46 · S · Авто-обнаружение неправильных default-экспортов** — уровень 3
- **Цель:** проверка default export
- **Файлы:** `symbolIndex.ts`
- **Действие:** tool `find_default_export_issues`
- **Проверка:** отчёт


**47 · S · Авто-обнаружение неправильных import-alias** — уровень 3
- **Цель:** проверка alias
- **Файлы:** `symbolIndex.ts`
- **Действие:** tool `find_import_alias_issues`
- **Проверка:** отчёт


**48 · S · Авто-обнаружение неправильных путей в FilePreviewPanel** — уровень 3
- **Цель:** проверка preview
- **Файлы:** `FilePreviewPanel.tsx`
- **Действие:** tool `find_file_preview_path_issues`
- **Проверка:** отчёт


**49 · S · Авто-обнаружение неправильных путей в ChatHistoryPanel** — уровень 3
- **Цель:** проверка путей чатов
- **Файлы:** `ChatHistoryPanel.tsx`
- **Действие:** tool `find_chat_history_path_issues`
- **Проверка:** отчёт


**50 · S · Авто-обнаружение неправильных путей в TracePanel** — уровень 3
- **Цель:** проверка trace
- **Файлы:** `TracePanel.tsx`
- **Действие:** tool `find_trace_panel_path_issues`
- **Проверка:** отчёт


**51 · S · Авто-обнаружение неправильных путей в TerminalPanel** — уровень 3
- **Цель:** проверка терминала
- **Файлы:** `TerminalPanel.tsx`
- **Действие:** tool `find_terminal_panel_path_issues`
- **Проверка:** отчёт


**52 · S · Авто-обнаружение неправильных путей в OnboardingWizard** — уровень 3
- **Цель:** проверка визарда
- **Файлы:** `OnboardingWizard.tsx`
- **Действие:** tool `find_onboarding_path_issues`
- **Проверка:** отчёт


**53 · S · Авто-обнаружение неправильных путей в AutomationsTab** — уровень 3
- **Цель:** проверка автоматизаций
- **Файлы:** `AutomationsTab.tsx`
- **Действие:** tool `find_automations_tab_path_issues`
- **Проверка:** отчёт


**54 · S · Авто-обнаружение неправильных путей в BehaviorTab** — уровень 3
- **Цель:** проверка поведения агента
- **Файлы:** `BehaviorTab.tsx`
- **Действие:** tool `find_behavior_tab_path_issues`
- **Проверка:** отчёт


**55 · S · Авто-обнаружение неправильных путей в SkillsPanel** — уровень 3
- **Цель:** проверка skills
- **Файлы:** `SkillsPanel.tsx`
- **Действие:** tool `find_skills_panel_path_issues`
- **Проверка:** отчёт


**56 · S · Авто-обнаружение неправильных путей в SelfImprovePanel** — уровень 3
- **Цель:** проверка самообучения
- **Файлы:** `SelfImprovePanel.tsx`
- **Действие:** tool `find_self_improve_panel_path_issues`
- **Проверка:** отчёт


**57 · S · Авто-обнаружение неправильных путей в QueueContext** — уровень 3
- **Цель:** проверка очереди
- **Файлы:** `QueueContext.tsx`
- **Действие:** tool `find_queue_context_path_issues`
- **Проверка:** отчёт


**58 · S · Авто-обнаружение неправильных путей в agentContext** — уровень 3
- **Цель:** проверка контекста
- **Файлы:** `agentContext.ts`
- **Действие:** tool `find_agent_context_path_issues`
- **Проверка:** отчёт


**59 · S · Авто-обнаружение неправильных путей в agentHandlersProject** — уровень 3
- **Цель:** проверка handlers
- **Файлы:** `agentHandlersProject/*`
- **Действие:** tool `find_project_handlers_path_issues`
- **Проверка:** отчёт


**60 · S · Авто-обнаружение неправильных путей в modelRuntime** — уровень 3
- **Цель:** проверка runtime
- **Файлы:** `modelRuntime.ts`
- **Действие:** tool `find_model_runtime_path_issues`
- **Проверка:** отчёт


**61 · S · Авто-обнаружение неправильных путей в commandRunner** — уровень 3
- **Цель:** проверка команд
- **Файлы:** `commandRunner.ts`
- **Действие:** tool `find_command_runner_path_issues`
- **Проверка:** отчёт


**62 · S · Авто-обнаружение неправильных путей в ipcContracts** — уровень 3
- **Цель:** проверка IPC схем
- **Файлы:** `ipcContracts.ts`
- **Действие:** tool `find_ipc_contracts_path_issues`
- **Проверка:** отчёт


**63 · S · Авто-обнаружение неправильных путей в main/index.ts** — уровень 3
- **Цель:** проверка main
- **Файлы:** `app/electron/main/index.ts`
- **Действие:** tool `find_main_index_path_issues`
- **Проверка:** отчёт


**64 · S · Режим высокой контрастности** — уровень 4
- **Цель:** класс `high-contrast` на `:root` для слабовидящих
- **Файлы:** `styles.css`, `PerformanceTab.tsx`, `settings.ts`
- **Действие:** тумблер + контрастные CSS-переменные
- **Проверка:** границы панелей и кнопок заметно контрастнее


**65 · S · Цвет папки чатов** — уровень 4
- **Цель:** `ChatFolder.color?: string` — цветная полоска у заголовка папки
- **Файлы:** `types.ts`, `chats.ts`, `ChatHistoryPanel.tsx`
- **Действие:** picker в контекстном меню папки
- **Проверка:** цвет виден и сохраняется


**66 · S · Фильтр по тегам в SkillsPanel** — уровень 4
- **Файлы:** `SkillsPanel.tsx`, `skills.ts`
- **Действие:** теги из frontmatter SKILL.md
- **Проверка:** фильтр по тегу работает


**67 · S · Сохранение последнего benchmark** — уровень 4
- **Файлы:** `settings.ts`, `ModelTab.tsx`
- **Действие:** `lastBenchmark: BenchmarkResult` после прогона
- **Проверка:** результат виден после reopen settings


**68 · S · Dependabot для npm** — уровень 4
- **Файлы:** `.github/dependabot.yml`
- **Действие:** weekly `app/` и root
- **Проверка:** файл валиден по schema dependabot


**69 · S · Long paths на Windows** — уровень 4
- **Файлы:** `package.json` build manifest / `electron-builder`
- **Действие:** `requestedExecutionLevel` + known issue doc
- **Проверка:** проект с путём >260 символов открывается


**70 · S · Авто-озвучка ошибок агента** — уровень 4
- **Цель:** при ошибке прогона — краткое TTS-уведомление
- **Файлы:** `useAgentStream.ts`, `settings.ts`
- **Действие:** тумблер `autoSpeakErrors`; `speechSynthesis` на `agent-stream` error
- **Проверка:** при mock-ошибке слышен короткий сигнал/фраза


**71 · S · Авто-озвучка успешного завершения** — уровень 4
- **Цель:** TTS «Готово» при `stop_reason` без ошибки
- **Файлы:** `useAgentStream.ts`, `AgentStatusBar.tsx`, `settings.ts`
- **Действие:** тумблер `autoSpeakDone`; озвучка только если вкладка не в фокусе (опционально)
- **Проверка:** успешный прогон → озвучка при включённой настройке


**72 · S · Авто-публикация Docker-образов** — уровень 4
- **Цель:** tool `publish_docker_image` — push в registry
- **Файлы:** `agentTools/integrations.ts`, `commandRunner.ts`
- **Действие:** `docker push` после login; требует подтверждения в ask-mode
- **Проверка:** mock: push вызывается с правильным tag


**73 · S · Авто-деплой на Vercel/Netlify** — уровень 4
- **Цель:** tool `deploy_vercel` / `deploy_netlify` через CLI или API
- **Файлы:** `agentTools/integrations.ts`, `IntegrationsTab.tsx`
- **Действие:** token в settings; preview vs production
- **Проверка:** mock API → URL деплоя в ответе агента


**74 · S · Авто-генерация Helm-чартов** — уровень 4
- **Цель:** tool `generate_helm_chart` — Chart.yaml + templates из Dockerfile/compose
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectFile.ts`
- **Действие:** шаблон chart в `charts/<name>/`
- **Проверка:** `helm template` на сгенерированном chart без ошибок


**75 · S · Авто-генерация Ansible-ролей** — уровень 4
- **Цель:** tool `generate_ansible_role` — tasks/handlers/templates
- **Файлы:** `agentTools/core.ts`, `agentHandlersProjectFile.ts`
- **Действие:** роль в `ansible/roles/<name>/`
- **Проверка:** `ansible-playbook --syntax-check` на playbook


**76 · S · Авто-генерация GitHub Actions** — уровень 4
- **Цель:** tool `generate_github_actions` → `.github/workflows/ci.yml`
- **Файлы:** `agentTools/integrations.ts`, `agentHandlersProjectFile.ts`
- **Действие:** typecheck + test + build по обнаруженным скриптам package.json
- **Проверка:** workflow YAML парсится; шаги совпадают с `npm run test`


**77 · S · Авто-генерация GitLab CI** — уровень 4
- **Цель:** tool `generate_gitlab_ci` → `.gitlab-ci.yml`
- **Файлы:** `agentTools/integrations.ts`
- **Действие:** stages build/test/deploy из шаблона
- **Проверка:** fixture `.gitlab-ci.yml` проходит lint CI
