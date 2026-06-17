export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Показать дерево файлов проекта или подпапки',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Абсолютный путь к папке (необязательно — корень проекта)'
          },
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
          path: {
            type: 'string',
            description: 'Ограничить подпапкой (абсолютный путь, необязательно)'
          }
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
      description:
        'Прочитать содержимое файла. Большие файлы (>500 KB) читаются частями: укажи offset и limit. Ответ содержит заголовок с номерами строк и подсказку, если файл не закончился.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь к файлу' },
          offset: { type: 'string', description: 'Начальная строка (0-based). По умолчанию 0.' },
          limit: { type: 'string', description: 'Количество строк для чтения. По умолчанию 300.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Полностью перезаписать существующий файл (для новых — create_file, для правок — edit_file)',
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
          old_string: {
            type: 'string',
            description: 'Точный фрагмент из файла (с пробелами и переносами)'
          },
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
      name: 'undo_edit',
      description:
        'Отменить последнее изменение файла, сделанное через edit_file (восстановить снимок до правки). Работает только для последнего вызова edit_file для каждого файла.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Абсолютный путь к файлу, правку которого нужно отменить'
          }
        },
        required: ['path']
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
      name: 'delete_file',
      description: 'Удалить файл проекта (только файл, не папку)',
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
      name: 'move_file',
      description: 'Переместить или переименовать файл проекта (целевой не должен существовать)',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Текущий абсолютный путь файла' },
          to: { type: 'string', description: 'Новый абсолютный путь файла' }
        },
        required: ['from', 'to']
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
      name: 'git_status',
      description:
        'Статус git-репозитория проекта (ветка, изменённые файлы). Только чтение — безопаснее, чем run_command.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Ограничить подпапкой проекта (абсолютный путь, необязательно)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description:
        'Diff изменений в git (рабочая копия, staged или конкретный коммит). Только чтение — безопаснее, чем run_command.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Ограничить файлом/папкой (абсолютный путь, необязательно)'
          },
          staged: { type: 'string', description: 'true — только staged (git diff --staged)' },
          commit: {
            type: 'string',
            description: 'Хеш/ссылка коммита — показать его изменения (git show)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'История коммитов git проекта. Только чтение — безопаснее, чем run_command.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'string', description: 'Число коммитов 1–100 (по умолчанию 20)' },
          path: { type: 'string', description: 'Только коммиты, затронувшие путь (необязательно)' },
          oneline: { type: 'string', description: 'true — краткий формат (--oneline)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remember',
      description:
        'Сохранить знание в ViperMemory.md (паттерн, ошибка, предпочтение, правило проекта)',
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
            description:
              'Слова-триггеры через запятую — по ним навык подставится в контекст (todo, code review...)'
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
            description:
              'JSON-массив [{id, title}, ...], напр. [{"id":"1","title":"Добавить skill X"}]'
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
      description:
        'Отметить пункт плана самоулучшения выполненным после реальной правки/создания skill',
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
      description:
        'Прочитать файл исходников CodeViper. Поддерживает offset/limit для больших файлов.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Абсолютный путь внутри исходников CodeViper' },
          offset: { type: 'string', description: 'Начальная строка (0-based). По умолчанию 0.' },
          limit: { type: 'string', description: 'Количество строк для чтения. По умолчанию 300.' }
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
      name: 'delete_codeviper_file',
      description: 'Удалить файл исходников CodeViper (только файл)',
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
      name: 'move_codeviper_file',
      description:
        'Переместить/переименовать файл исходников CodeViper (целевой не должен существовать)',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Текущий путь внутри исходников CodeViper' },
          to: { type: 'string', description: 'Новый путь внутри исходников CodeViper' }
        },
        required: ['from', 'to']
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
          data_path: {
            type: 'string',
            description: 'Абсолютный путь к JSON/JSONL с примерами {user, assistant}'
          },
          base_model: {
            type: 'string',
            description: 'Базовая модель Ollama (FROM), напр. qwen2.5-coder:7b'
          },
          system: {
            type: 'string',
            description: 'SYSTEM промпт для производной модели (необязательно)'
          },
          temperature: {
            type: 'string',
            description: 'PARAMETER temperature (необязательно, напр. 0.3)'
          }
        },
        required: ['data_path', 'base_model']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_codeviper_branch',
      description:
        'Создать ветку agent/<name> для правок своего кода. Переключает репозиторий на новую ветку. Имя санитизируется автоматически.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Короткое имя ветки, напр. fix-crash-recovery или add-dark-theme'
          }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'push_codeviper_branch',
      description:
        'Запушить текущую ветку agent/... на GitHub (git push --set-upstream origin). Только для веток agent/*, не для master.',
      parameters: {
        type: 'object',
        properties: {}
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

/** Имя любого инструмента — выводится прямо из AGENT_TOOLS, не разъезжается со схемами. */
export type ToolName = (typeof AGENT_TOOLS)[number]['function']['name']

/**
 * Точные типы аргументов каждого инструмента. Значения — строки (приходят из JSON
 * tool call); обязательность полей соответствует `required` в схемах AGENT_TOOLS.
 */
export interface ToolArgs {
  list_directory: { path?: string; max_depth?: string }
  grep_files: { query: string; path?: string }
  find_files: { pattern: string; path?: string }
  read_file: { path: string; offset?: string; limit?: string }
  write_file: { path: string; content: string }
  create_file: { path: string; content: string }
  edit_file: { path: string; old_string: string; new_string: string; replace_all?: string }
  undo_edit: { path: string }
  append_file: { path: string; content: string }
  delete_file: { path: string }
  move_file: { from: string; to: string }
  run_command: { command: string }
  git_status: { path?: string }
  git_diff: { path?: string; staged?: string; commit?: string }
  git_log: { limit?: string; path?: string; oneline?: string }
  remember: { content: string; category: string; tags?: string; scope?: string }
  search_memory: { query: string }
  forget: { id: string }
  list_skills: Record<string, never>
  read_skill: { id: string }
  create_skill: {
    name: string
    description: string
    instructions: string
    triggers?: string
    id?: string
  }
  update_skill: {
    id: string
    name?: string
    description?: string
    instructions?: string
    triggers?: string
  }
  delete_skill: { id: string }
  read_skill_data: { skill_id: string }
  write_skill_data: { skill_id: string; content: string }
  set_self_improvement_plan: { items: string }
  complete_self_improvement_item: { id: string }
  get_self_improvement_plan: Record<string, never>
  list_codeviper_directory: { path?: string; max_depth?: string }
  grep_codeviper_files: { query: string; path?: string }
  find_codeviper_files: { pattern: string; path?: string }
  read_codeviper_file: { path: string; offset?: string; limit?: string }
  write_codeviper_file: { path: string; content: string }
  create_codeviper_file: { path: string; content: string }
  edit_codeviper_file: {
    path: string
    old_string: string
    new_string: string
    replace_all?: string
  }
  append_codeviper_file: { path: string; content: string }
  delete_codeviper_file: { path: string }
  move_codeviper_file: { from: string; to: string }
  run_codeviper_command: { command: string }
  create_codeviper_branch: { name: string }
  push_codeviper_branch: Record<string, never>
  preview_ollama_modelfile: {
    data_path: string
    base_model: string
    system?: string
    temperature?: string
  }
  create_ollama_model: {
    model_name: string
    data_path: string
    base_model: string
    system?: string
    temperature?: string
  }
}

// Гарантия на этапе компиляции: у каждого инструмента из AGENT_TOOLS описаны аргументы.
// Если добавить инструмент в AGENT_TOOLS и забыть тип — здесь будет ошибка с его именем.
type MissingToolArgs = Exclude<ToolName, keyof ToolArgs>
const _toolArgsComplete: MissingToolArgs extends never ? true : MissingToolArgs = true
void _toolArgsComplete

/** Реестр обработчиков: каждому имени соответствует обработчик со своими типами аргументов. */
export type ToolHandlers = {
  [K in ToolName]: (args: ToolArgs[K]) => Promise<string>
}
