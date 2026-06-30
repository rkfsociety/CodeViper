# API инструментов агента CodeViper

Справочник инструментов агента для разработчиков и самоулучшения.

**Источник истины:**

| Что | Путь |
|---|---|
| Схемы инструментов (группы) | [`app/electron/main/agentTools/`](../app/electron/main/agentTools/) — `core.ts`, `integrations.ts`, `mcp.ts` |
| Сборка списка для модели | [`app/electron/main/agentTools/index.ts`](../app/electron/main/agentTools/index.ts) → `AGENT_TOOLS` (+ MCP, плагины) |
| Реестр имён (text tool calls) | [`app/shared/toolCalls.ts`](../app/shared/toolCalls.ts) → `AGENT_TOOL_NAMES` |
| Обработчики | [`app/electron/main/agentHandlers*.ts`](../app/electron/main/) |

---

## Содержание

- [Индекс инструментов](#индекс-инструментов)
- [Файлы проекта](#файлы-проекта)
- [Git](#git)
- [GitHub](#github)
- [GitLab](#gitlab)
- [Терминал и тесты](#терминал)
- [Зависимости](#зависимости)
- [Память](#память)
- [Навыки (Skills)](#навыки-skills)
- [Todo](#todo)
- [Саморедактирование (CodeViper)](#саморедактирование-codeviper)
- [ROADMAP и самоулучшение](#самоулучшение)
- [Модели Ollama](#модели-ollama)
- [Индексация и веб](#индексация-и-веб)
- [Субагенты](#субагенты)
- [Соглашения](#соглашения)
- [Создание плагина](#создание-плагина)

---

## Индекс инструментов

Полный реестр: `AGENT_TOOL_NAMES` в [`toolCalls.ts`](../app/shared/toolCalls.ts).

### `agentTools/core.ts` — FILE_TOOLS

`search_knowledge_base`, `list_directory`, `grep_files`, `find_files`, `find_symbol`, `find_references`, `find_slow_code`, `find_aria_issues`, `find_integration_url_issues`, `find_cron_issues`, `generate_dependency_diagram`, `generate_class_diagram`, `generate_dataflow_diagram`, `generate_project_metrics`, `search_in_project`, `read_file`, `read_multiple_files`, `file_info`, `project_stats`, `search_in_file`, `file_search_summary`, `show_file_history`, `copy_file`, `rename_folder`, `copy_folder`, `preview_edit`, `preview_patch`, `write_file`, `create_file`, `edit_file`, `undo_edit`, `append_file`, `delete_file`, `move_file`

### `agentTools/core.ts` — GIT_TOOLS

`git_status`, `git_diff`, `git_log`, `git_commit`, `git_push`, `git_checkout`, `git_stash`, `git_stash_pop`, `recent_changes`

### `agentTools/core.ts` — терминал и тесты

`run_command`, `run_script`, `review_code`, `format_project`, `run_tests`

### `agentTools/core.ts` — PACKAGE_TOOLS

`package_info`, `read_package_lock`, `dependency_summary`, `test_summary`

### `agentTools/integrations.ts` — GitHub

`check_github_auth`, `create_issue`, `report_trace_to_github`, `create_pr`, `list_issues`, `list_pull_requests`, `open_issue`, `trigger_github_workflow`

### `agentTools/integrations.ts` — GitLab

`list_gitlab_mrs`, `create_gitlab_mr`, `get_gitlab_pipeline`

### `agentTools/integrations.ts` — память, навыки, todo, веб

`remember`, `search_memory`, `forget`, `list_skills`, `read_skill`, `create_skill`, `update_skill`, `delete_skill`, `read_skill_data`, `write_skill_data`, `set_todo_list`, `complete_todo_item`, `clear_todo_list`, `check_cve`, `web_fetch`, `web_search`

### `agentTools/mcp.ts` — CodeViper, ROADMAP, Ollama, индекс

`list_codeviper_directory`, `grep_codeviper_files`, `find_codeviper_files`, `read_codeviper_file`, `write_codeviper_file`, `create_codeviper_file`, `edit_codeviper_file`, `append_codeviper_file`, `delete_codeviper_file`, `move_codeviper_file`, `run_codeviper_command`, `create_codeviper_branch`, `push_codeviper_branch`, `create_codeviper_pr`, `list_roadmap`, `read_roadmap_item`, `prioritize_roadmap_items`, `set_self_improvement_plan`, `complete_self_improvement_item`, `get_self_improvement_plan`, `preview_ollama_modelfile`, `create_ollama_model`, `index_project`, `delegate_to_editor`

---

## Файлы проекта

### `search_knowledge_base`

Семантический поиск по индексу проекта (Qdrant). Параметры: `query` (обяз.), `collection`, `limit`.

### `find_symbol` / `find_references`

Поиск объявления символа или всех ссылок по AST (ts/js/py). Параметры: `name` (обяз.), `path`.

### `find_slow_code`

AST-анализ ts/js/py на потенциально медленный код: вложенные циклы, `await` в цикле, синхронный I/O, `JSON.parse`/`json.loads`, линейный поиск по массиву в цикле. Возвращает отчёт с severity (`high`/`medium`/`low`) и `path:line:col`. Параметр: `path` (необяз., подпапка или файл).

### `find_aria_issues`

AST-анализ JSX/TSX на проблемы доступности: неизвестные aria-атрибуты, `img` без `alt`, интерактивные элементы без имени, кликабельные `span`/`code` без `role` и клавиатуры, кнопки с emoji без `aria-label`. По умолчанию — `MessageBody.tsx` и `App.tsx`. Параметры: `path` (подпапка), `files` (массив путей).

### `find_integration_url_issues`

Проверка URL интеграций в `settings.json`: GitLab/Jira base URL, webhook/Discord webhook, P2P `ws(s)`, token без URL. Без параметров; отчёт в чат.

### `find_cron_issues`

Валидация `settings.automations`: невалидный cron, пустой `prompt`/`id`, дубликаты `id`. Без параметров; отчёт в чат.

### `generate_dependency_diagram`

Граф импортов между модулями (import/require → Mermaid `graph LR`). Параметры: `path` (подпапка), `focus` (файл-центр: только его импорты и обратные ссылки).

### `generate_class_diagram`

Диаграмма классов по AST (TS/Java/C#): классы, интерфейсы, наследование, методы → Mermaid `classDiagram`. Параметр: `path` (подпапка).

### `generate_dataflow_diagram`

DFD уровня модуля: IPC (`invoke`/`handle`), HTTP (`fetch`/`axios`), FS (`readFile`/`writeFile`) → Mermaid flowchart. Параметры: `path`, `focus` (один файл-модуль).

### `generate_project_metrics`

Метрики проекта: LOC, число файлов, разбивка по языкам, оценка цикломатической сложности → Markdown-отчёт. Параметр: `path` (подпапка).

### `search_in_project`

Универсальный поиск: `type: "content"` — текст в файлах; `type: "name"` — glob по имени.

### `read_multiple_files`

Чтение нескольких файлов за один вызов. Параметр: `paths` (массив).

### `file_info` / `project_stats` / `show_file_history`

Метаданные файла, сводка по проекту, история git по файлу.

### `search_in_file` / `file_search_summary`

Поиск в одном файле (в т.ч. >512 KB) и краткая сводка совпадений по проекту. См. также `grep_files` vs `find_files` в skill `viper-files`.

### `copy_file` / `rename_folder` / `copy_folder`

Копирование файла или папки, переименование папки.

### `preview_edit` / `preview_patch`

Превью правки перед применением (side-by-side diff в UI).

### `list_directory`

Показать дерево файлов проекта или подпапки. Скрытые записи из `.gitignore`, `.claudeignore`, `.cursorignore` и `.codeviperignore` в корне проекта не показываются — см. [codeviperignore.md](codeviperignore.md).

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `path` | string | нет | Абсолютный путь к папке. По умолчанию — корень проекта |
| `max_depth` | string | нет | Глубина дерева 1–5. По умолчанию `"3"` |

**Пример:**
```json
{ "path": "/home/user/myproject/src", "max_depth": "2" }
```

---

### `find_files`

Найти файлы по имени или glob-шаблону.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `pattern` | string | **да** | Имя файла или glob: `*.tsx`, `*test*`, `agent.ts` |
| `path` | string | нет | Ограничить поиск подпапкой |

**Пример:**
```json
{ "pattern": "*.test.ts", "path": "/home/user/myproject/app" }
```

---

### `grep_files`

Поиск текста в файлах проекта (аналог ripgrep). Поддерживает регулярные выражения.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `query` | string | **да** | Текст или `/regex/flags` для поиска |
| `path` | string | нет | Ограничить поиск подпапкой |

**Примеры:**
```json
{ "query": "TODO" }
{ "query": "/import.*from/i", "path": "/home/user/myproject/src" }
```

---

### `read_file`

Прочитать содержимое файла. Большие файлы (>500 KB) читаются частями — используйте `offset` и `limit`.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `path` | string | **да** | Абсолютный путь к файлу |
| `offset` | string | нет | Начальная строка (0-based). По умолчанию `"0"` |
| `limit` | string | нет | Количество строк. По умолчанию `"300"` |

Ответ содержит заголовок с диапазоном строк и подсказку `[продолжить с offset=N]` если файл не закончился.

**Пример:**
```json
{ "path": "/home/user/myproject/src/App.tsx", "offset": "100", "limit": "50" }
```

---

### `create_file`

Создать новый файл. Родительские папки создаются автоматически. Возвращает ошибку, если файл уже существует — используйте `write_file` для перезаписи.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `path` | string | **да** | Абсолютный путь к новому файлу |
| `content` | string | **да** | Содержимое нового файла |

**Пример:**
```json
{ "path": "/home/user/myproject/src/utils/format.ts", "content": "export function..." }
```

---

### `write_file`

Полностью перезаписать существующий файл. Для создания нового — `create_file`, для точечных правок — `edit_file`.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `path` | string | **да** | Абсолютный путь к файлу |
| `content` | string | **да** | Новое содержимое (заменяет всё) |

---

### `edit_file`

Точечная замена фрагмента в файле: `old_string` → `new_string`. Перед вызовом нужно прочитать файл через `read_file` — `old_string` должен точно совпадать, включая пробелы и переносы строк.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `path` | string | **да** | Абсолютный путь к файлу |
| `old_string` | string | **да** | Точный фрагмент из файла |
| `new_string` | string | **да** | Новый фрагмент вместо `old_string` |
| `replace_all` | string | нет | `"true"` — заменить все вхождения. По умолчанию только первое |

> **Важно:** Если `old_string` встречается несколько раз и `replace_all` не задан — операция завершится ошибкой. Используйте больший контекст или `replace_all: "true"`.

**Пример:**
```json
{
  "path": "/home/user/myproject/src/config.ts",
  "old_string": "const VERSION = '1.0.0'",
  "new_string": "const VERSION = '1.1.0'"
}
```

---

### `undo_edit`

Отменить последнее изменение файла, сделанное через `edit_file`. Восстанавливает снимок, сохранённый непосредственно перед правкой. Работает только для последнего вызова `edit_file` для каждого конкретного файла.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `path` | string | **да** | Абсолютный путь к файлу, правку которого нужно отменить |

---

### `append_file`

Дописать текст в конец существующего файла.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `path` | string | **да** | Абсолютный путь к существующему файлу |
| `content` | string | **да** | Текст для добавления в конец |

---

### `delete_file`

Удалить файл проекта. Только отдельный файл — папки не удаляются.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `path` | string | **да** | Абсолютный путь к файлу |

---

### `move_file`

Переместить или переименовать файл проекта.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `from` | string | **да** | Текущий абсолютный путь файла |
| `to` | string | **да** | Новый абсолютный путь (не должен существовать) |

---

## Git

### `git_status`

Статус git-репозитория проекта: ветка, изменённые файлы. Только чтение — безопаснее чем `run_command git status`.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `path` | string | нет | Ограничить подпапкой проекта |

---

### `git_diff`

Показать diff изменений. Только чтение.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `path` | string | нет | Ограничить файлом или папкой |
| `staged` | string | нет | `"true"` — только staged изменения (`git diff --staged`) |
| `commit` | string | нет | Хеш/ссылка коммита — показать его изменения (`git show`) |

**Пример:**
```json
{ "staged": "true" }
{ "commit": "abc1234" }
```

---

### `git_log`

История коммитов проекта. Только чтение.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `limit` | string | нет | Число коммитов 1–100. По умолчанию `"20"` |
| `path` | string | нет | Только коммиты, затронувшие путь |
| `oneline` | string | нет | `"true"` — краткий формат (`--oneline`) |

---

### `git_commit`

Закоммитить staged-изменения. Параметр `message` (обяз.).

### `git_push`

Отправить коммиты на remote. Параметры: `remote`, `branch` (необяз.).

### `git_checkout`

Переключить ветку. Параметры: `branch` (обяз.), `force` (`"true"` — принудительно).

### `git_stash` / `git_stash_pop`

Спрятать незакоммиченные изменения / вернуть из stash.

### `recent_changes`

Список недавно изменённых файлов в проекте (git + mtime).

---

## GitHub

Инструменты через `gh` CLI в корне git-репозитория. Перед push коллективной памяти или при ошибках sync — `check_github_auth`.

### `check_github_auth`

Проверить установку `gh`, авторизацию (CLI или token) и наличие git-клона. Параметров нет.

### `create_issue` / `list_issues` / `open_issue`

Создать, список (до 30), открыть в браузере issue. `create_issue`: `title` (обяз.), `body`, `labels`.

### `report_trace_to_github`

Отправить трейс текущего прогона на GitHub: gist с JSON + issue в `rkfsociety/CodeViper` с автоописанием от агента. Нужен `gh auth login`. Вызывать после ошибки или по запросу пользователя зафиксировать баг. Параметр: `note` (необяз.) — комментарий агента к отчёту. Доступен только во время прогона агента (нужен `chatId`).

### `create_pr` / `list_pull_requests`

Создать PR или список открытых PR с веткой и статусом CI (как панель PR в UI). `list_pull_requests` — без параметров.

### `trigger_github_workflow`

Запуск GitHub Actions: `workflow_id` (обяз.), `ref`, `fields` (key=value через запятую).

---

## GitLab

`list_gitlab_mrs`, `create_gitlab_mr`, `get_gitlab_pipeline` — через GitLab API и `gitlabToken` в настройках. MR: `source_branch`, `target_branch`, `title`.

---

## Терминал

### `run_command`

Выполнить shell-команду в корне проекта. Команды из blocklist (например, `rm -rf /`) блокируются. Таймаут определяется настройкой `commandTimeoutSec` (по умолчанию 120 с).

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `command` | string | **да** | Команда для терминала |

**Примеры:**
```json
{ "command": "npm test" }
{ "command": "npx tsc --noEmit" }
```

> **Режим readOnly:** В режиме «только чтение» вызов `run_command` заблокирован.

### `run_script`

Запуск скрипта в песочнице Docker (если настроено). Параметры: `script`, `language`.

### `review_code`

Запросить ревью фрагмента кода у модели. Параметры: `path` или `content`, `focus`.

### `format_project`

Отформатировать код проекта (Prettier / Black). Авто-определяет форматтер по `package.json` (`scripts.format`, prettier) или Python-маркерам (`pyproject.toml` и т.п.). Параметры: `path` (подпапка), `formatter` (`auto` | `prettier` | `black`).

### `run_tests`

Запустить тесты проекта с авто-починкой (vitest/jest и т.п.). Параметры по схеме в `core.ts`.

---

## Зависимости

`package_info` — сведения из `package.json`. `read_package_lock` — фрагмент lock-файла. `dependency_summary` / `test_summary` — сводки по зависимостям и тестам.

---

## Память

### `remember`

Сохранить знание в `ViperMemory.md`. Переживает перезапуск и смену проекта.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `content` | string | **да** | Краткое знание для запоминания |
| `category` | string | **да** | `pattern` \| `mistake` \| `preference` \| `project` \| `skill` |
| `tags` | string | нет | Теги через запятую |
| `scope` | string | нет | `global` \| `project`. По умолчанию определяется автоматически |

**Пример:**
```json
{
  "content": "Этот проект использует pnpm, не npm",
  "category": "project",
  "tags": "deps,package-manager",
  "scope": "project"
}
```

---

### `search_memory`

Найти сохранённые знания по ключевым словам. Использует семантический поиск (эмбеддинги `nomic-embed-text`) если модель доступна, иначе — полнотекстовый.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `query` | string | **да** | Поисковый запрос |

---

### `forget`

Удалить устаревшее знание по id.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `id` | string | **да** | ID записи из `remember` / `search_memory` |

---

## Навыки (Skills)

Навыки — это именованные инструкции, которые агент подставляет в контекст при совпадении триггеров с запросом пользователя. Хранятся в `%APPDATA%/CodeViper/ViperSkills.md` и переживают перезапуски.

### `list_skills`

Список всех навыков агента. Параметров нет.

---

### `read_skill`

Прочитать полную инструкцию навыка.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `id` | string | **да** | ID навыка из `list_skills` |

---

### `create_skill`

Создать глобальный навык агента.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `name` | string | **да** | Название навыка (отображается в UI) |
| `description` | string | **да** | Краткое описание: зачем нужен |
| `instructions` | string | **да** | Markdown-инструкция: когда применять, шаги, формат ответа |
| `triggers` | string | нет | Слова-триггеры через запятую (`todo, task, задача`) |
| `id` | string | нет | Slug для id. По умолчанию генерируется автоматически |

**Пример:**
```json
{
  "name": "Code Review",
  "description": "Проводит ревью кода по чеклисту",
  "instructions": "## Когда применять\nПри словах «ревью», «review», «проверь код».\n\n## Шаги\n1. Проверить типы\n2. Проверить обработку ошибок\n3. ...",
  "triggers": "review,ревью,проверь код"
}
```

---

### `update_skill`

Обновить существующий навык. Передавайте только изменяемые поля.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `id` | string | **да** | ID навыка |
| `name` | string | нет | Новое название |
| `description` | string | нет | Новое описание |
| `instructions` | string | нет | Новая инструкция |
| `triggers` | string | нет | Новые триггеры через запятую |

---

### `delete_skill`

Удалить пользовательский навык. Системные навыки (`viper-*`) удалить нельзя.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `id` | string | **да** | ID навыка |

---

### `read_skill_data`

Прочитать JSON-данные, связанные с навыком (todo-список, состояние и т.д.). Данные хранятся отдельно от инструкций навыка.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `skill_id` | string | **да** | ID навыка |

---

### `write_skill_data`

Записать JSON-данные навыка. Используется навыками для хранения состояния.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `skill_id` | string | **да** | ID навыка |
| `content` | string | **да** | Валидная JSON-строка |

**Пример:**
```json
{
  "skill_id": "my-todo-skill",
  "content": "{\"tasks\": [{\"id\": \"1\", \"text\": \"Написать тесты\", \"done\": false}]}"
}
```

---

## Todo

`set_todo_list` — создать/обновить список задач в UI (`items`, `title`). `complete_todo_item` — отметить по `id`. `clear_todo_list` — скрыть список.

---

## Саморедактирование (CodeViper)

Эти инструменты работают с исходным кодом самого CodeViper, а не с пользовательским проектом. Доступны только агенту при выполнении задач по улучшению собственного кода.

Все инструменты этой группы — зеркальные аналоги инструментов для проекта, но работают в директории исходников CodeViper:

| Инструмент | Аналог для проекта | Описание |
|---|---|---|
| `list_codeviper_directory` | `list_directory` | Дерево файлов исходников |
| `find_codeviper_files` | `find_files` | Поиск файлов по шаблону |
| `grep_codeviper_files` | `grep_files` | Поиск текста в исходниках |
| `read_codeviper_file` | `read_file` | Чтение файла (offset/limit) |
| `create_codeviper_file` | `create_file` | Создание нового файла |
| `write_codeviper_file` | `write_file` | Полная перезапись файла |
| `edit_codeviper_file` | `edit_file` | Точечная замена фрагмента |
| `append_codeviper_file` | `append_file` | Дозапись в конец файла |
| `delete_codeviper_file` | `delete_file` | Удаление файла |
| `move_codeviper_file` | `move_file` | Перемещение/переименование |
| `run_codeviper_command` | `run_command` | Shell-команда в корне исходников |
| `create_codeviper_branch` | — | Ветка для самоулучшения |
| `push_codeviper_branch` | — | Push ветки CodeViper |
| `create_codeviper_pr` | — | PR изменений CodeViper |

Сигнатуры параметров идентичны соответствующим инструментам проекта. Путь передаётся как абсолютный путь внутри директории исходников CodeViper.

---

## Самоулучшение

### ROADMAP

`list_roadmap` — список пунктов «В планах» из `ROADMAP.md` (номер · название · цепочка). Без параметров.

`read_roadmap_item` — полный блок пункта N: цель, файлы, действие, проверка. Параметр `number` (обяз.).

`prioritize_roadmap_items` — приоритизирует пункты «В планах» по пользе и риску; возвращает отсортированный список для UI и self-improvement. Параметр `limit` (опц., по умолчанию 10) — сколько верхних пунктов показать.

### План выполнения

### `set_self_improvement_plan`

Задать план автономного самоулучшения CodeViper (3–8 пунктов). Используйте после изучения кода через `list_codeviper_directory` и `read_codeviper_file`. Каждый пункт должен быть реализуем через доступные инструменты.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `items` | string | **да** | JSON-массив `[{"id": "1", "title": "..."}, ...]` |

**Пример:**
```json
{
  "items": "[{\"id\":\"1\",\"title\":\"Добавить skill для code review\"},{\"id\":\"2\",\"title\":\"Обновить системный промпт\"}]"
}
```

> **Защита от зацикливания:** После 3 неудачных попыток выполнить один пункт он блокируется автоматически. Максимальная частота запусков ограничена настройкой `maxRunsPerHour`.

---

### `complete_self_improvement_item`

Отметить пункт плана выполненным. Вызывайте после реального применения изменений (edit/create файла, создания навыка и т.д.).

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `id` | string | **да** | ID пункта из `set_self_improvement_plan` |

---

### `get_self_improvement_plan`

Получить текущий план самоулучшения и статус всех пунктов. Параметров нет.

---

## Модели Ollama

### `preview_ollama_modelfile`

Собрать Ollama Modelfile из файла с примерами (few-shot) **без создания модели**. Используйте для проверки перед `create_ollama_model`.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `data_path` | string | **да** | Абсолютный путь к JSON/JSONL с примерами `{"user": "...", "assistant": "..."}` |
| `base_model` | string | **да** | Базовая модель Ollama (FROM), напр. `qwen2.5-coder:7b` |
| `system` | string | нет | SYSTEM-промпт для производной модели |
| `temperature` | string | нет | Температура генерации, напр. `"0.3"` |

---

### `create_ollama_model`

Создать производную модель Ollama из файла примеров через Modelfile + MESSAGE. Это **не** GPU fine-tuning — модель просто получает few-shot примеры в контексте.

| Параметр | Тип | Обязательный | Описание |
|---|---|---|---|
| `model_name` | string | **да** | Имя новой модели, напр. `my-project-coder` |
| `data_path` | string | **да** | Абсолютный путь к JSON/JSONL с примерами |
| `base_model` | string | **да** | Базовая модель (FROM) |
| `system` | string | нет | SYSTEM-промпт |
| `temperature` | string | нет | Температура |

**Формат файла данных (`data_path`):**
```jsonl
{"user": "Объясни async/await", "assistant": "async/await — это синтаксический сахар над Promise..."}
{"user": "Что такое замыкание?", "assistant": "Замыкание — функция, которая захватывает..."}
```

---

## Индексация и веб

### `index_project`

Построить или обновить семантический индекс проекта (Qdrant). Параметры по схеме в `mcp.ts`.

### `check_cve`

Проверка уязвимостей через публичные CVE API (NVD + OSV). Один режим за вызов:

| Режим | Параметры | API |
|-------|-----------|-----|
| По CVE ID | `cve_id` — `CVE-YYYY-NNNN` | NVD 2.0 |
| Поиск | `keyword`, опц. `max_results` (1–10) | NVD 2.0 |
| Пакет | `package` + `version`, опц. `ecosystem` (по умолч. `npm`) | OSV |

Ответ — Markdown-отчёт в чат (CVSS, описание, ссылки). NVD без API-ключа ограничен ~5 запросов / 30 с.

### `web_fetch` / `web_search`

Загрузка URL в текст и поиск в интернете (DuckDuckGo). `web_fetch`: `url` (обяз.), `max_chars`. `web_search`: `query` (обяз.), `max_results`.

---

## Субагенты

### `delegate_to_editor`

Делегировать подзадачу субагенту-редактору (изолированный прогон с write-инструментами). Параметры: `task`, `context` — см. `mcp.ts`.

---

## Соглашения

### Типы параметров

Все параметры инструментов передаются как **строки** (`string`), даже числовые значения и булевы флаги:

```json
{ "max_depth": "3" }       // число как строка
{ "replace_all": "true" }  // булев флаг как строка
{ "staged": "true" }       // булев флаг как строка
```

### Пути

Все пути — **абсолютные**. Относительные пути принимаются, но разрешаются относительно корня проекта.

**Защита от path traversal:** Инструменты для работы с файлами проекта проверяют, что путь после `path.resolve()` остаётся внутри `projectPath`. Попытка выйти за пределы проекта (`../../etc/passwd`) вернёт ошибку `AgentError(readonly)`.

### Параллельное выполнение

Инструменты только для чтения (`read_file`, `list_directory`, `grep_files`, `find_files`, `git_status`, `git_diff`, `git_log`, `search_memory`) можно вызывать параллельно — агент делает это автоматически при независимых задачах.

Инструменты записи (`write_file`, `edit_file`, `create_file` и др.) выполняются последовательно, так как могут конфликтовать.

---

## Создание плагина

Плагин для CodeViper — это TypeScript-файл в `~/.codeviper/plugins/`, который экспортирует обработчики инструментов. Интерфейс строится вокруг типа `ToolHandlers` из `agentTools.ts`.

### Минимальный пример

```typescript
// ~/.codeviper/plugins/my-plugin.ts
import type { ToolHandlers } from 'path/to/agentTools'

// Дополнительный инструмент (добавляется к стандартным)
export const tools = [
  {
    type: 'function',
    function: {
      name: 'my_custom_tool',
      description: 'Моё кастомное действие',
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Входные данные' }
        },
        required: ['input']
      }
    }
  }
] as const

// Обработчик инструмента
export const handlers = {
  my_custom_tool: async ({ input }: { input: string }): Promise<string> => {
    // Ваша логика
    return `Обработано: ${input}`
  }
}
```

### Хранение состояния в навыке

Навыки с состоянием используют `write_skill_data` / `read_skill_data`:

```typescript
// Записать
await callTool('write_skill_data', {
  skill_id: 'my-todo',
  content: JSON.stringify({ tasks: [{ id: '1', text: 'Задача', done: false }] })
})

// Прочитать
const raw = await callTool('read_skill_data', { skill_id: 'my-todo' })
const data = JSON.parse(raw)
```

### Полезные ссылки

- [Схемы инструментов](../app/electron/main/agentTools/index.ts) (`AGENT_TOOLS`)
- [Реестр имён `AGENT_TOOL_NAMES`](../app/shared/toolCalls.ts)
- [Обработчики файловых операций](../app/electron/main/agentHandlersProject.ts)
- [Обработчики памяти и навыков](../app/electron/main/agentHandlersMemory.ts)
- [Обработчики саморедактирования](../app/electron/main/agentHandlersCodeViper.ts)
- [Архитектура системы](architecture.md)
