import { getSkill, createSkill } from './skills'

export const VIPER_MEMORY_SKILL_ID = 'viper-memory'

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

## Назначение
Управление долгосрочной памятью CodeViper. Память хранится в файле **ViperMemory.md**.

## Где лежит ViperMemory.md
- **Глобально:** \`%APPDATA%/CodeViper/ViperMemory.md\` — предпочтения пользователя, общие паттерны
- **Проект:** \`{проект}/.codeviper/ViperMemory.md\` — знания о конкретном репозитории

## Инструменты
| Инструмент | Когда |
|---|---|
| \`remember\` | Сохранить знание (content, category, tags, scope) |
| \`search_memory\` | Найти записи по ключевым словам перед задачей |
| \`forget\` | Удалить устаревшую запись по id |

## Категории (category)
- \`pattern\` — паттерн кода или workflow
- \`mistake\` — ошибка, которую не повторять
- \`preference\` — предпочтение пользователя (стиль, язык, инструменты)
- \`project\` — факт о текущем проекте (архитектура, соглашения)
- \`skill\` — урок, связанный с навыком

## Правила
1. **Перед сложной задачей** — \`search_memory\` по теме запроса
2. **После успешного решения** — \`remember\` с краткой формулировкой (одна мысль — одна запись)
3. \`scope: global\` — для предпочтений пользователя; \`scope: project\` — для правил репозитория
4. Не дублируй: \`remember\` сам объединяет одинаковые записи
5. Не утверждай «запомнил», пока \`remember\` не вернул id
6. Файл ViperMemory.md обновляется автоматически — не правь его через \`write_file\` вместо \`remember\`

## Примеры
- «Запомни: пользователь предпочитает TypeScript strict» → \`remember\` (preference, global)
- «Что ты знаешь про этот проект?» → \`search_memory\` + краткий ответ
- «Забудь запись abc123» → \`forget\` с id`
}

export async function ensureDefaultSkills(projectPath = ''): Promise<void> {
  const existing = await getSkill(projectPath, VIPER_MEMORY_SKILL_ID, 'global')
  if (existing) return

  await createSkill(projectPath, VIPER_MEMORY_SKILL)
}
