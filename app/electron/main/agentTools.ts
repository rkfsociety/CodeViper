export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Показать дерево файлов проекта или подпапки',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь к папке (необязательно — корень проекта)' },
          max_depth: { type: 'string', description: 'Глубина дерева 1–5 (по умолчанию 3)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep_files',
      description: 'Поиск текста в файлах проекта (как ripgrep). Строка или /regex/flags',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Текст или /regex/i для поиска' },
          path: { type: 'string', description: 'Ограничить подпапкой (абсолютный путь, необязательно)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_files',
      description: 'Найти файлы по имени или шаблону (*.tsx, *test*, agent.ts)',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Имя или glob-шаблон' },
          path: { type: 'string', description: 'Ограничить подпапкой (необязательно)' }
        },
        required: ['pattern']
      }
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
      description: 'Полностью перезаписать существующий файл (для новых — create_file, для правок — edit_file)',
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
      name: 'create_file',
      description:
        'Создать новый файл с содержимым. Папки создаются автоматически. Ошибка, если файл уже существует.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь к новому файлу' },
          content: { type: 'string', description: 'Содержимое нового файла' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Точечная правка: заменить old_string на new_string в существующем файле. Сначала read_file. old_string должен быть уникален (или replace_all: true).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь к файлу' },
          old_string: { type: 'string', description: 'Точный фрагмент из файла (с пробелами и переносами)' },
          new_string: { type: 'string', description: 'Новый фрагмент вместо old_string' },
          replace_all: {
            type: 'string',
            description: 'true — заменить все вхождения; по умолчанию false (одно вхождение)'
          }
        },
        required: ['path', 'old_string', 'new_string']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'append_file',
      description: 'Дописать текст в конец существующего файла (логи, строки в конец и т.п.)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь к существующему файлу' },
          content: { type: 'string', description: 'Текст для добавления в конец' }
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
        'Создать глобальный навык агента → %APPDATA%/CodeViper/ViperSkills.md. Переживает перезапуск и смену проекта; применяется автоматически по триггерам.',
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
            description: 'Слова-триггеры через запятую — по ним навык подставится в контекст (todo, code review...)'
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
      description: 'Удалить пользовательский навык по id (встроенные viper-* удалять нельзя)',
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
      name: 'set_self_improvement_plan',
      description:
        'Задать план автономного самоулучшения CodeViper (3–8 пунктов). Используй после изучения кода. Все пункты должны быть выполнены через инструменты.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'string',
            description: 'JSON-массив [{id, title}, ...], напр. [{"id":"1","title":"Добавить skill X"}]'
          }
        },
        required: ['items']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'complete_self_improvement_item',
      description: 'Отметить пункт плана самоулучшения выполненным после реальной правки/создания skill',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'id пункта из set_self_improvement_plan' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_self_improvement_plan',
      description: 'Текущий план самоулучшения и статус пунктов (done/pending)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_codeviper_directory',
      description: 'Дерево исходников CodeViper (своё приложение). Для саморедактирования.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Подпапка в исходниках (необязательно)' },
          max_depth: { type: 'string', description: 'Глубина 1–5 (по умолчанию 3)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep_codeviper_files',
      description: 'Поиск текста в исходниках CodeViper',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Текст или /regex/i' },
          path: { type: 'string', description: 'Подпапка в исходниках (необязательно)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_codeviper_files',
      description: 'Найти файлы в исходниках CodeViper по шаблону имени',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Имя или glob (*.ts, agent.ts)' },
          path: { type: 'string', description: 'Подпапка (необязательно)' }
        },
        required: ['pattern']
      }
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
      name: 'create_codeviper_file',
      description: 'Создать новый файл в исходниках CodeViper (ошибка, если уже существует)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь внутри исходников CodeViper' },
          content: { type: 'string', description: 'Содержимое нового файла' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_codeviper_file',
      description:
        'Точечная правка файла CodeViper: old_string → new_string. Сначала read_codeviper_file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь внутри исходников CodeViper' },
          old_string: { type: 'string', description: 'Точный фрагмент из файла' },
          new_string: { type: 'string', description: 'Новый фрагмент' },
          replace_all: { type: 'string', description: 'true — заменить все вхождения' }
        },
        required: ['path', 'old_string', 'new_string']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'append_codeviper_file',
      description: 'Дописать текст в конец файла исходников CodeViper',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь внутри исходников CodeViper' },
          content: { type: 'string', description: 'Текст для добавления' }
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
