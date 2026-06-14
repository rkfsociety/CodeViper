export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Показать дерево файлов проекта (до 3 уровней)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Прочитать содержимое файла',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь к файлу' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Записать или перезаписать файл',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь к файлу' },
          content: { type: 'string', description: 'Новое содержимое файла' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Выполнить shell-команду в корне проекта',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Команда для терминала' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Сохранить знание в ViperMemory.md (паттерн, ошибка, предпочтение, правило проекта)',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Краткое знание для запоминания' },
          category: {
            type: 'string',
            description: 'pattern | mistake | preference | project | skill'
          },
          tags: { type: 'string', description: 'Теги через запятую (необязательно)' },
          scope: { type: 'string', description: 'global | project (по умолчанию auto)' }
        },
        required: ['content', 'category']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_memory',
      description: 'Найти сохранённые знания по ключевым словам',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Поисковый запрос' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'forget',
      description: 'Удалить устаревшее знание по id',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID записи из remember/search_memory' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: 'Список навыков (skills), которые агент создал для себя',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_skill',
      description: 'Прочитать полную инструкцию навыка по id',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID навыка из list_skills' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_skill',
      description:
        'Создать навык агента (сохраняется в ViperSkills.md). По умолчанию scope: global — переживает перезапуск.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Название навыка' },
          description: { type: 'string', description: 'Кратко, зачем нужен' },
          instructions: {
            type: 'string',
            description: 'Markdown: когда применять, шаги, формат ответа, работа с skill-data'
          },
          triggers: {
            type: 'string',
            description: 'Слова-триггеры через запятую (todo, задачи, план...)'
          },
          scope: {
            type: 'string',
            description: 'global (по умолчанию) — навык агента; project — только для текущего репозитория'
          },
          id: { type: 'string', description: 'Необязательный id (slug)' }
        },
        required: ['name', 'description', 'instructions']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_skill',
      description: 'Обновить существующий навык',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID навыка' },
          name: { type: 'string' },
          description: { type: 'string' },
          instructions: { type: 'string' },
          triggers: { type: 'string', description: 'Триггеры через запятую' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_skill',
      description: 'Удалить навык по id',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'ID навыка' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_skill_data',
      description: 'Прочитать JSON-данные навыка (todo, состояние и т.д.)',
      parameters: {
        type: 'object',
        properties: {
          skill_id: { type: 'string', description: 'ID навыка' }
        },
        required: ['skill_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_skill_data',
      description: 'Записать JSON-данные навыка',
      parameters: {
        type: 'object',
        properties: {
          skill_id: { type: 'string', description: 'ID навыка' },
          content: { type: 'string', description: 'JSON-строка' }
        },
        required: ['skill_id', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_codeviper_directory',
      description: 'Дерево исходников CodeViper (своё приложение). Для саморедактирования.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_codeviper_file',
      description: 'Прочитать файл исходников CodeViper по абсолютному пути',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь внутри исходников CodeViper' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_codeviper_file',
      description: 'Записать файл исходников CodeViper (саморедактирование кода агента)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь внутри исходников CodeViper' },
          content: { type: 'string', description: 'Новое содержимое файла' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_codeviper_command',
      description: 'Shell-команда в корне исходников CodeViper (npm test, typecheck, build)',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Команда для терминала' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'preview_ollama_modelfile',
      description:
        'Собрать Ollama Modelfile из файла с примерами (few-shot). Без создания модели — для проверки.',
      parameters: {
        type: 'object',
        properties: {
          data_path: { type: 'string', description: 'Абсолютный путь к JSON/JSONL с примерами {user, assistant}' },
          base_model: { type: 'string', description: 'Базовая модель Ollama (FROM), напр. qwen2.5-coder:7b' },
          system: { type: 'string', description: 'SYSTEM промпт для производной модели (необязательно)' },
          temperature: { type: 'string', description: 'PARAMETER temperature (необязательно, напр. 0.3)' }
        },
        required: ['data_path', 'base_model']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_ollama_model',
      description:
        'Создать производную модель Ollama из файла примеров (Modelfile + MESSAGE). Не GPU fine-tuning.',
      parameters: {
        type: 'object',
        properties: {
          model_name: { type: 'string', description: 'Имя новой модели, напр. my-project-coder' },
          data_path: { type: 'string', description: 'Абсолютный путь к JSON/JSONL с примерами' },
          base_model: { type: 'string', description: 'Базовая модель (FROM)' },
          system: { type: 'string', description: 'SYSTEM промпт (необязательно)' },
          temperature: { type: 'string', description: 'temperature (необязательно)' }
        },
        required: ['model_name', 'data_path', 'base_model']
      }
    }
  }
] as const

export function formatAgentToolsSummary(): string {
  return AGENT_TOOLS.map(
    (tool) => `- **${tool.function.name}** — ${tool.function.description}`
  ).join('\n')
}
