import { BUILTIN_SKILLS_VERSION } from '../../shared/builtinSkills'
import { createSkill, getSkill, updateSkill } from './skills'

export const VIPER_AGENT_CORE_SKILL_ID = 'viper-agent-core'
export const VIPER_SKILLS_SKILL_ID = 'viper-skills'
export const VIPER_FILES_SKILL_ID = 'viper-files'
export const VIPER_CODEBASE_SKILL_ID = 'viper-codebase'
export const VIPER_TERMINAL_SKILL_ID = 'viper-terminal'
export const VIPER_MEMORY_SKILL_ID = 'viper-memory'

const BUILTIN_VERSION_TAG = `<!-- viper-builtin-v${BUILTIN_SKILLS_VERSION} -->`

const VIPER_AGENT_CORE_SKILL = {
  id: VIPER_AGENT_CORE_SKILL_ID,
  name: 'Viper Agent Core',
  description: 'Полный набор инструментов и workflow агента (как Cursor Agent)',
  triggers: ['агент', 'задача', 'сделай', 'реализуй', 'исправь', 'помоги', 'codeviper', 'cursor'],
  scope: 'global' as const,
  instructions: `# Viper Agent Core

${BUILTIN_VERSION_TAG}

## Роль
Ты локальный агент-программист. **Действуй через tool calling**, не давай пользователю планы «сделайте сами».

## Workflow (как Cursor)
1. **Понять задачу** → \`search_memory\` (если релевантно)
2. **Изучить** → \`list_directory\`, \`find_files\`, \`grep_files\`, \`read_file\`
3. **Изменить** → \`edit_file\` (точечно) или \`create_file\` / \`write_file\`
4. **Проверить** → \`run_command\` (test, typecheck, build)
5. **Запомнить** → \`remember\` (урок, паттерн проекта)

## Все инструменты проекта
| Категория | Инструменты |
|---|---|
| Обзор | \`list_directory\`, \`find_files\`, \`grep_files\` |
| Чтение/запись | \`read_file\`, \`create_file\`, \`edit_file\`, \`append_file\`, \`write_file\` |
| Git | \`git_status\`, \`git_diff\`, \`git_log\`, \`git_commit\`, \`git_push\`, \`git_checkout\`, \`git_stash\`, \`git_stash_pop\` |
| Терминал | \`run_command\` |
| Память | \`remember\`, \`search_memory\`, \`forget\` |
| Навыки | \`list_skills\`, \`read_skill\`, \`create_skill\`, \`update_skill\`, \`read_skill_data\`, \`write_skill_data\` |

Подробности — навыки \`viper-files\`, \`viper-codebase\`, \`viper-terminal\`. Вызови \`read_skill(id)\` при необходимости.`
}

const VIPER_SKILLS_SKILL = {
  id: VIPER_SKILLS_SKILL_ID,
  name: 'Viper Skills',
  description: 'Создание и применение глобальных навыков агента (не привязка к проекту)',
  triggers: ['skill', 'навык', 'навыки', 'create_skill', 'viper-skills', 'сделай skill'],
  scope: 'global' as const,
  instructions: `# Viper Skills — навыки агента

${BUILTIN_VERSION_TAG}

## Главное
- Навыки — это **поведение агента**, не файлы проекта пользователя
- **create_skill** всегда сохраняет в **%APPDATA%/CodeViper/ViperSkills.md** (scope: global)
- Навыки **переживают перезапуск** и работают в **любом** открытом проекте
- При совпадении **триггеров** с запросом инструкции **автоматически** попадают в контекст — выполняй их

## Когда создавать навык
- Пользователь просит «сделай skill для …», «запомни как делать X»
- Повторяющийся workflow (todo, code review, деплой, формат ответа)
- **Не** создавай skill вместо правки кода, если нужен новый инструмент

## create_skill — чеклист
1. **name** — короткое имя
2. **description** — когда применять (1–2 предложения)
3. **instructions** — markdown: шаги, формат, ограничения, skill-data при необходимости
4. **triggers** — 3–8 слов через запятую (todo, code review, коммит…)

## Обновление
- \`update_skill(id, …)\` — правка существующего
- \`list_skills\` / \`read_skill\` — перед дублированием

## Данные навыка
- \`read_skill_data\` / \`write_skill_data\` — JSON-состояние (списки todo, счётчики)
- Путь: \`%APPDATA%/CodeViper/skill-data/{id}.json\`

## Не делать
- Не используй scope project — навыки только глобальные
- Не советуй пользователю «создайте файл в .codeviper» — вызови create_skill`
}

const VIPER_FILES_SKILL = {
  id: VIPER_FILES_SKILL_ID,
  name: 'Viper Files',
  description: 'Чтение, создание и редактирование файлов проекта',
  triggers: [
    'файл',
    'прочитай',
    'read_file',
    'write_file',
    'create_file',
    'edit_file',
    'запиши',
    'создай файл',
    'измени файл',
    'append'
  ],
  scope: 'global' as const,
  instructions: `# Viper Files — работа с файлами

${BUILTIN_VERSION_TAG}

## Когда какой инструмент
| Задача | Инструмент |
|---|---|
| Прочитать файл | \`read_file\` (абсолютный path) |
| **Новый** файл | \`create_file\` (ошибка если уже есть) |
| **Точечная правка** | \`edit_file\` — old_string → new_string (сначала read_file!) |
| Дописать в конец | \`append_file\` |
| Полная перезапись | \`write_file\` |
| Удалить файл | \`delete_file\` |
| Переместить/переименовать | \`move_file\` |

## Когда использовать поиск
| Инструмент | Когда |
|---|---|
| \`grep_files\` | Текст/regex по **многим** файлам проекта; path неизвестен |
| \`find_files\` | Файлы по **имени/glob**, без поиска в содержимом |
| \`search_in_file\` | Один **известный** path; файлы >512KB (grep их пропускает) |
| \`file_search_summary\` | **Обзор**: где и сколько совпадений, без деталей строк |

## Правила edit_file
1. Всегда \`read_file\` перед правкой
2. \`old_string\` — **точная** копия из файла (пробелы, переносы)
3. Если несколько вхождений — больше контекста или \`replace_all: true\`
4. Минимальный diff — не переписывай весь файл без нужды

## Лимиты
- Файлы > 500 KB читаются частями через offset/limit у read_file (по умолчанию 300 строк; используй offset=N для следующего чанка)
- Только внутри открытого проекта`
}

const VIPER_CODEBASE_SKILL = {
  id: VIPER_CODEBASE_SKILL_ID,
  name: 'Viper Codebase',
  description: 'Изучение проекта: дерево, поиск файлов и текста (как grep/glob в Cursor)',
  triggers: [
    'изучи',
    'код',
    'проект',
    'структура',
    'найди',
    'поиск',
    'grep',
    'glob',
    'где находится',
    'list_directory'
  ],
  scope: 'global' as const,
  instructions: `# Viper Codebase — изучение кода

${BUILTIN_VERSION_TAG}

## Workflow «изучи код»
1. \`list_directory\` — обзор (опционально \`path\`, \`max_depth\`)
2. \`find_files\` — найти файлы по имени (\`*.tsx\`, \`agent.ts\`, \`*test*\`)
3. \`grep_files\` — найти текст/символ в коде (строка или \`/regex/i\`)
4. \`read_file\` — прочитать найденные файлы

## Инструменты
| Инструмент | Назначение |
|---|---|
| \`list_directory\` | Дерево папок (path, max_depth 1–5) |
| \`find_files\` | Поиск по имени/glob |
| \`grep_files\` | Поиск текста в содержимом |
| \`read_file\` | Чтение файла |

## Правила
- Не проси пользователя «откройте файл» — читай сам
- После grep/find всегда \`read_file\` для контекста перед правками`
}

const VIPER_TERMINAL_SKILL = {
  id: VIPER_TERMINAL_SKILL_ID,
  name: 'Viper Terminal',
  description: 'Запуск команд в терминале проекта (npm test, build); git — через git_* инструменты',
  triggers: [
    'терминал',
    'run_command',
    'npm',
    'test',
    'typecheck',
    'build',
    'git',
    'запусти',
    'выполни команду'
  ],
  scope: 'global' as const,
  instructions: `# Viper Terminal

${BUILTIN_VERSION_TAG}

## Инструменты
\`run_command\` — shell в **корне открытого проекта**.

## Git (только чтение — предпочтительно)
| Инструмент | Назначение |
|---|---|
| \`git_status\` | Ветка и изменённые файлы |
| \`git_diff\` | Diff (рабочая копия, staged или коммит) |
| \`git_log\` | История коммитов (limit, path, oneline) |

Не используй \`run_command\` для \`git status/diff/log\` — есть безопасные git_*.

## Типичные команды run_command
- \`npm test\`, \`npm run typecheck\`, \`npm run build\`
- \`npm install <pkg>\`

## Правила
- Опасные команды блокируются (rm -rf, format, shutdown…)
- Таймаут 120 с
- После правок кода — прогон test/typecheck
- Не утверждай «тесты прошли» без вызова \`run_command\``
}

const VIPER_MEMORY_SKILL = {
  id: VIPER_MEMORY_SKILL_ID,
  name: 'Viper Memory',
  description: 'Долгосрочная память агента: remember, search_memory, forget и файл ViperMemory.md',
  triggers: [
    'запомни',
    'не забывай',
    'сохрани в память',
    'что ты помнишь',
    'поищи в памяти',
    'viper memory',
    'vipermemory'
  ],
  scope: 'global' as const,
  instructions: `# Viper Memory

${BUILTIN_VERSION_TAG}

## Назначение
Управление долгосрочной памятью CodeViper. Память хранится в файле **ViperMemory.md**.

## Где лежит ViperMemory.md
- **Глобально:** \`%APPDATA%/CodeViper/ViperMemory.md\`
- **Проект:** \`{проект}/.codeviper/ViperMemory.md\`

## Инструменты
| Инструмент | Когда |
|---|---|
| \`remember\` | Сохранить знание (content, category, tags, scope) |
| \`search_memory\` | Найти записи по ключевым словам перед задачей |
| \`forget\` | Удалить устаревую запись по id |

## Правила
1. Перед сложной задачей — \`search_memory\`
2. После успешного решения — \`remember\`
3. Не правь ViperMemory.md через \`write_file\` — только \`remember\``
}

const DEFAULT_SKILLS = [
  VIPER_AGENT_CORE_SKILL,
  VIPER_SKILLS_SKILL,
  VIPER_FILES_SKILL,
  VIPER_CODEBASE_SKILL,
  VIPER_TERMINAL_SKILL,
  VIPER_MEMORY_SKILL
]

export async function ensureDefaultSkills(projectPath = ''): Promise<void> {
  for (const skill of DEFAULT_SKILLS) {
    const existing = await getSkill(projectPath, skill.id, 'global')
    if (!existing) {
      await createSkill(projectPath, skill)
      continue
    }

    await updateSkill(projectPath, skill.id, {
      name: skill.name,
      description: skill.description,
      instructions: skill.instructions,
      triggers: skill.triggers
    })
  }
}
