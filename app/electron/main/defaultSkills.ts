import { getSkill, createSkill } from './skills'

export const VIPER_MEMORY_SKILL_ID = 'viper-memory'
export const VIPER_MODEL_TRAINING_SKILL_ID = 'viper-model-training'

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

## Правила
1. Перед сложной задачей — \`search_memory\`
2. После успешного решения — \`remember\` (кратко, одна мысль)
3. Не правь ViperMemory.md через \`write_file\` — только \`remember\``
}

const VIPER_MODEL_TRAINING_SKILL = {
  id: VIPER_MODEL_TRAINING_SKILL_ID,
  name: 'Viper Model Training',
  description: 'Адаптация локальных моделей Ollama через Modelfile и few-shot примеры',
  triggers: [
    'обучи модель',
    'обучить модель',
    'train model',
    'fine-tune',
    'дообуч',
    'адаптируй модель',
    'viper model training'
  ],
  scope: 'global' as const,
  instructions: `# Viper Model Training

## Что это
CodeViper работает с **Ollama**. «Обучение» здесь — создание **производной модели** через Ollama Modelfile:
- базовая модель (\`FROM\`)
- опциональный \`SYSTEM\`
- few-shot пары \`MESSAGE user\` / \`MESSAGE assistant\` из ваших данных

Это **не** полный GPU fine-tuning. Для классического fine-tuning используйте внешние инструменты и \`ollama import\`.

## Формат данных (\`data_path\`)
JSON-массив или JSONL (по строке):
\`\`\`json
{"user": "вопрос или задача", "assistant": "ожидаемый ответ"}
\`\`\`
Алиасы полей: \`prompt/response\`, \`input/output\`, \`question/answer\`.

Рекомендуемый путь в проекте: \`.codeviper/training/examples.json\`

## Workflow
1. \`read_file\` — проверить/создать файл с примерами (\`write_file\`)
2. \`preview_ollama_modelfile\` — проверить Modelfile до создания
3. \`create_ollama_model\` — создать модель в Ollama (\`model_name\`, \`base_model\`, \`data_path\`)
4. Сообщить пользователю имя модели; предложить выбрать её в настройках CodeViper

## Инструменты
| Инструмент | Назначение |
|---|---|
| \`preview_ollama_modelfile\` | Сборка Modelfile без создания |
| \`create_ollama_model\` | Создание модели через Ollama API |

## Правила
- Не утверждай «модель обучена», пока \`create_ollama_model\` не вернул успех
- Сначала \`preview_ollama_modelfile\`, если данные новые или большие
- \`base_model\` должна быть уже скачана в Ollama (настройки → модели)
- До 48 примеров попадут в Modelfile`
}

const DEFAULT_SKILLS = [VIPER_MEMORY_SKILL, VIPER_MODEL_TRAINING_SKILL]

export async function ensureDefaultSkills(projectPath = ''): Promise<void> {
  for (const skill of DEFAULT_SKILLS) {
    const existing = await getSkill(projectPath, skill.id, 'global')
    if (existing) continue
    await createSkill(projectPath, skill)
  }
}
