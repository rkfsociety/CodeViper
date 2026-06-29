// ── Саморедактирование, Ollama, индексирование, субагенты ────────────────────

export const CODEVIPER_TOOLS = [
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
        'Читать файл исходников CodeViper. Без offset/limit файлы >20KB — только первые и последние 50 строк; для edit — offset/limit или grep_codeviper_files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь в исходниках CodeViper' },
          offset: { type: 'string', description: 'начало (строка, 0-based)' },
          limit: { type: 'string', description: 'кол-во строк (по умолч. 300)' }
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
          path: { type: 'string', description: 'путь в исходниках CodeViper' },
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
          path: { type: 'string', description: 'путь в исходниках CodeViper' },
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
        'Точечная замена в файле CodeViper. old_string — только код из read/grep (без строк [Файл:…], [Конец файла]). Большие файлы: grep + read с offset/limit.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь в исходниках CodeViper' },
          old_string: {
            type: 'string',
            description: 'Точный фрагмент кода из файла (не служебные строки read_*)'
          },
          new_string: { type: 'string', description: 'Новый фрагмент кода' },
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
          path: { type: 'string', description: 'путь в исходниках CodeViper' },
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
          path: { type: 'string', description: 'путь в исходниках CodeViper' }
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
      name: 'create_codeviper_branch',
      description: 'Создать и переключиться на ветку agent/<name>',
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
      description: 'Пушить текущую ветку agent/* на GitHub',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_codeviper_pr',
      description:
        'Создать PR для исходников CodeViper из текущей ветки agent/* через gh CLI (PR не мержится автоматически)',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Заголовок PR (необязательно)' },
          body: { type: 'string', description: 'Описание PR в Markdown (необязательно)' }
        }
      }
    }
  }
] as const

export const OLLAMA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'preview_ollama_modelfile',
      description: 'Собрать Ollama Modelfile из примеров (без создания — только проверка)',
      parameters: {
        type: 'object',
        properties: {
          data_path: {
            type: 'string',
            description: 'путь к JSON/JSONL с примерами'
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
      name: 'create_ollama_model',
      description: 'Создать производную модель Ollama из примеров (Modelfile + MESSAGE)',
      parameters: {
        type: 'object',
        properties: {
          model_name: { type: 'string', description: 'Имя новой модели, напр. my-project-coder' },
          data_path: { type: 'string', description: 'путь к JSON/JSONL с примерами' },
          base_model: { type: 'string', description: 'Базовая модель (FROM)' },
          system: { type: 'string', description: 'SYSTEM промпт (необязательно)' },
          temperature: { type: 'string', description: 'temperature (необязательно)' }
        },
        required: ['model_name', 'data_path', 'base_model']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_roadmap',
      description:
        'Список пунктов раздела «В планах» из ROADMAP.md (номер · название · цепочка). Вызывай перед read_roadmap_item или самоулучшением по пункту ROADMAP.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_roadmap_item',
      description:
        'Полный блок пункта N из ROADMAP.md: цель, файлы, действие, проверка. Сначала list_roadmap для списка номеров.',
      parameters: {
        type: 'object',
        properties: {
          number: { type: 'string', description: 'Номер пункта из list_roadmap' }
        },
        required: ['number']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'prioritize_roadmap_items',
      description:
        'Приоритизирует пункты «В планах» из ROADMAP.md по пользе и риску: сначала критичные и быстрые задачи, затем остальное. Возвращает отсортированный список для UI и self-improvement.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'string',
            description: 'Сколько верхних пунктов показать (по умолчанию 10)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_self_improvement_plan',
      description:
        'Задать план самоулучшения (3–8 пунктов) после изучения кода. items — JSON [{id,title}] или маркированный список «- шаг».',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'string',
            description:
              'JSON: [{"id":"1","title":"…"}] или список строк «- шаг 1\\n- шаг 2». title обязателен (алиасы: action, item).'
          },
          plan: {
            type: 'array',
            description:
              'Алиас для items: массив строк шагов или [{id, title}] (Gemini иногда шлёт plan вместо items).'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'complete_self_improvement_item',
      description: 'Отметить пункт плана выполненным',
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
  }
] as const

export const INDEXING_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'index_project',
      description:
        'Рекурсивно читает файлы проекта, разбивает на чанки по 500 строк, вычисляет эмбеддинги и загружает в Qdrant-коллекцию codeviper_project. Требует настройки Qdrant URL в настройках.',
      parameters: { type: 'object', properties: {} }
    }
  }
] as const

export const SUBAGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'delegate_to_editor',
      description:
        'Делегирует конкретную задачу редактирования субагенту-редактору (editor). Субагент имеет полный доступ к файловым инструментам (edit_file, write_file, run_command и др.) и выполняет задачу автономно, возвращая итог. Используй для атомарных шагов плана: «исправь X в файле Y», «добавь функцию Z», «рефактори модуль M». Не делегируй несколько несвязанных задач за один вызов.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description:
              'Конкретная задача на русском языке. Максимально подробно: что нужно сделать, в каких файлах, какой результат ожидается.'
          },
          context: {
            type: 'string',
            description: 'Дополнительный контекст: уже известные факты о структуре, зависимости.'
          }
        },
        required: ['task']
      }
    }
  }
] as const
