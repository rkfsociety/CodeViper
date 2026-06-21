// ============================================================================
// БАЗОВЫЕ ИНСТРУМЕНТЫ — разбиты по категориям для оптимизации памяти
// ============================================================================
const FILE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'Показать дерево файлов проекта или подпапки',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'папка (по умолч. корень проекта)' },
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
            description: 'ограничить подпапкой'
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
      description: 'Читать файл. Для больших файлов используй offset/limit.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь к файлу' },
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
      name: 'file_info',
      description:
        'Показать метаданные файла: размер, число строк, символов, слов, дату изменения и признак бинарности.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь к файлу' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'project_stats',
      description:
        'Краткая сводка по проекту: число файлов и папок, размер, верхнеуровневые папки и последние изменения git.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Подпапка проекта (необязательно)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_in_file',
      description:
        'Поиск текста внутри одного файла (включая файлы >512KB, которые grep_files пропускает). Возвращает строки с совпадениями и их номера.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь к файлу' },
          query: { type: 'string', description: 'Текст или /regex/i для поиска' },
          context_lines: {
            type: 'string',
            description: 'Число строк контекста вокруг совпадения (0–5, по умолч. 0)'
          }
        },
        required: ['path', 'query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'file_search_summary',
      description:
        'Краткая сводка поиска по файлам: сколько совпадений найдено и где они находятся',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Текст или /regex/i для поиска' },
          path: { type: 'string', description: 'Ограничить подпапкой (необязательно)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'show_file_history',
      description:
        'Показать историю правок файла: список всех изменений, внесённых агентом, с датой и unified diff каждого изменения.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь к файлу относительно корня проекта' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'copy_file',
      description: 'Скопировать файл проекта в другое место внутри проекта',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Текущий путь файла' },
          to: { type: 'string', description: 'Новый путь файла' }
        },
        required: ['from', 'to']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rename_folder',
      description: 'Переименовать или переместить папку внутри проекта',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Текущий путь папки' },
          to: { type: 'string', description: 'Новый путь папки' }
        },
        required: ['from', 'to']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'copy_folder',
      description: 'Скопировать папку внутри проекта',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Текущий путь папки' },
          to: { type: 'string', description: 'Новый путь папки' }
        },
        required: ['from', 'to']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'preview_edit',
      description:
        'Показать пользователю unified diff предлагаемых правок файла. Пользователь увидит изменения и выберет «Применить» или «Отмена». Используй вместо write_file, когда нужно согласование перед записью.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь к файлу относительно корня проекта' },
          content: { type: 'string', description: 'новое содержимое файла целиком' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Полностью перезаписать файл (для новых — create_file, для правок — edit_file)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь к файлу' },
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
      description: 'Создать новый файл (папки создаются автоматически; ошибка если уже есть)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь к новому файлу' },
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
      description: 'Точечная замена old_string → new_string. Перед правкой — read_file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь к файлу' },
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
      description: 'Откатить последнее edit_file для файла',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'путь к файлу'
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
          path: { type: 'string', description: 'путь к файлу' },
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
          path: { type: 'string', description: 'путь к файлу' }
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
  }
] as const

const GIT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Статус git (ветка, изменённые файлы)',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'ограничить подпапкой'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Git diff (рабочая копия, staged или коммит)',
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
      description: 'История коммитов git',
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
      name: 'recent_changes',
      description: 'Краткая сводка последних изменений git по проекту или папке',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Путь для фильтрации истории (необязательно)' },
          limit: { type: 'string', description: 'Число коммитов 1–20 (по умолчанию 5)' }
        }
      }
    }
  }
] as const

const GITHUB_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_issue',
      description: 'Создать GitHub Issue через gh CLI',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Заголовок issue' },
          body: { type: 'string', description: 'Описание issue (необязательно)' },
          labels: { type: 'string', description: 'Список labels через запятую (необязательно)' }
        },
        required: ['title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_pr',
      description: 'Создать GitHub Pull Request через gh CLI',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Заголовок PR (необязательно)' },
          body: { type: 'string', description: 'Описание PR в Markdown (необязательно)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_issues',
      description: 'Показать список GitHub Issues через gh CLI',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_issue',
      description: 'Открыть GitHub Issue в браузере через gh issue view --web',
      parameters: {
        type: 'object',
        properties: {
          number: { type: 'string', description: 'Номер issue' }
        },
        required: ['number']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'trigger_github_workflow',
      description: 'Запустить GitHub Actions workflow через gh workflow run',
      parameters: {
        type: 'object',
        properties: {
          workflow_id: { type: 'string', description: 'Имя или id workflow' },
          ref: { type: 'string', description: 'Ветка или тег (необязательно)' },
          fields: {
            type: 'string',
            description: 'Поля workflow через запятую key=value (необязательно)'
          }
        },
        required: ['workflow_id']
      }
    }
  }
] as const

const MEMORY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Сохранить знание в память агента',
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
  }
] as const

const PACKAGE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'package_info',
      description: 'Краткая сводка по package.json: скрипты, зависимости и базовые метаданные',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Путь к package.json или папке проекта (необязательно)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_package_lock',
      description: 'Прочитать package-lock.json или получить его краткую сводку',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Путь к package-lock.json или папке проекта' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'dependency_summary',
      description: 'Краткая сводка зависимостей: direct/dev, количество и основные пакеты',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Путь к package.json или папке проекта' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'test_summary',
      description:
        'Коротко показать доступные тестовые команды из package.json и подсказать, как запускать',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Папка проекта или package.json (необязательно)' }
        }
      }
    }
  }
] as const

const SKILLS_TOOLS = [
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
      description: 'Создать глобальный навык агента (применяется автоматически по триггерам)',
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
      description: 'Удалить навык по id (viper-* нельзя)',
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
  }
] as const

const TODO_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'set_todo_list',
      description:
        'Создать или обновить todo-лист задач. Список отображается над полем ввода в чате. Вызывай в начале многошаговой задачи.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Массив задач',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' }
              },
              required: ['id', 'title']
            }
          },
          title: {
            type: 'string',
            description: 'Заголовок списка (необязательно, по умолч. «Todo List»)'
          }
        },
        required: ['items']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'complete_todo_item',
      description: 'Отметить пункт todo-листа выполненным по id',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'id пункта из set_todo_list' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clear_todo_list',
      description: 'Скрыть todo-лист (задача полностью выполнена или отменена)',
      parameters: { type: 'object', properties: {} }
    }
  }
] as const

const CODEVIPER_TOOLS = [
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
      description: 'Читать файл исходников CodeViper (offset/limit для больших)',
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
      description: 'Точечная замена в файле CodeViper. Перед правкой — read_codeviper_file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь в исходниках CodeViper' },
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
        'Создать PR из текущей ветки agent/* через gh CLI (PR не мержится автоматически)',
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

const OLLAMA_TOOLS = [
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
      name: 'set_self_improvement_plan',
      description: 'Задать план самоулучшения (3–8 пунктов) после изучения кода',
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

// Все инструменты в одном массиве для обратной совместимости
export const AGENT_TOOLS = [
  ...FILE_TOOLS,
  ...GIT_TOOLS,
  ...GITHUB_TOOLS,
  ...MEMORY_TOOLS,
  ...PACKAGE_TOOLS,
  ...SKILLS_TOOLS,
  ...TODO_TOOLS,
  ...CODEVIPER_TOOLS,
  ...OLLAMA_TOOLS
] as const

// Кэш преобразованных схем для провайдеров (ключ = JSON хеш)
const transformedToolsCache = new Map<string, any[]>()

/** Трансформировать инструменты в формат провайдера */
function transformTools(tools: readonly any[]) {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters
  }))
}

/**
 * Получить инструменты с кэшированием преобразованных схем.
 * Экономит ~35% токенов в режиме самоулучшения, ~60% в обычном режиме.
 */
export function getAgentTools(selfImproveMode: boolean) {
  // В обычном режиме исключаем codeviper + ollama инструменты
  const filtered = !selfImproveMode
    ? AGENT_TOOLS.filter(
        (t) =>
          !CODEVIPER_TOOLS.some((ct) => ct.function.name === t.function.name) &&
          !OLLAMA_TOOLS.some((ot) => ot.function.name === t.function.name)
      )
    : AGENT_TOOLS

  // Кэш по размеру и режиму
  const cacheKey = `${filtered.length}_${selfImproveMode}`
  if (!transformedToolsCache.has(cacheKey)) {
    transformedToolsCache.set(cacheKey, transformTools(filtered))
  }

  return transformedToolsCache.get(cacheKey)!
}

/** Инструменты, нужные только в режиме самоулучшения */
const SELF_IMPROVE_ONLY_TOOLS = new Set<string>([
  ...CODEVIPER_TOOLS.map((t) => t.function.name),
  ...OLLAMA_TOOLS.map((t) => t.function.name)
])

export function formatAgentToolsSummary(selfImproveMode = true): string {
  const tools = selfImproveMode
    ? AGENT_TOOLS
    : AGENT_TOOLS.filter((t) => !SELF_IMPROVE_ONLY_TOOLS.has(t.function.name))
  return tools
    .map((tool) => `- **${tool.function.name}** — ${tool.function.description}`)
    .join('\n')
}

/** Имя любого инструмента */
export type ToolName = (typeof AGENT_TOOLS)[number]['function']['name']

/** Типы аргументов каждого инструмента */
export interface ToolArgs {
  list_directory: { path?: string; max_depth?: string }
  grep_files: { query: string; path?: string }
  find_files: { pattern: string; path?: string }
  read_file: { path: string; offset?: string; limit?: string }
  file_info: { path: string }
  project_stats: { path?: string }
  search_in_file: { path: string; query: string; context_lines?: string }
  show_file_history: { path: string }
  preview_edit: { path: string; content: string }
  write_file: { path: string; content: string }
  create_file: { path: string; content: string }
  edit_file: { path: string; old_string: string; new_string: string; replace_all?: string }
  undo_edit: { path: string }
  append_file: { path: string; content: string }
  delete_file: { path: string }
  move_file: { from: string; to: string }
  copy_file: { from: string; to: string }
  rename_folder: { from: string; to: string }
  copy_folder: { from: string; to: string }
  run_command: { command: string }
  git_status: { path?: string }
  git_diff: { path?: string; staged?: string; commit?: string }
  git_log: { limit?: string; path?: string; oneline?: string }
  create_issue: { title: string; body?: string; labels?: string }
  create_pr: { title?: string; body?: string }
  list_issues: Record<string, never>
  open_issue: { number: string }
  trigger_github_workflow: { workflow_id: string; ref?: string; fields?: string }
  recent_changes: { path?: string; limit?: string }
  remember: { content: string; category: string; tags?: string; scope?: string }
  package_info: { path?: string }
  read_package_lock: { path?: string }
  dependency_summary: { path?: string }
  test_summary: { path?: string }
  search_memory: { query: string }
  forget: { id: string }
  file_search_summary: { query: string; path?: string }
  set_todo_list: { items: Array<{ id: string; title: string }> | string; title?: string }
  complete_todo_item: { id: string }
  clear_todo_list: Record<string, never>
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
  create_codeviper_pr: { title?: string; body?: string }
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

// Гарантия на этапе компиляции: все инструменты имеют типы аргументов
type MissingToolArgs = Exclude<ToolName, keyof ToolArgs>
const _toolArgsComplete: MissingToolArgs extends never ? true : MissingToolArgs = true
void _toolArgsComplete

/** Реестр обработчиков инструментов */
export type ToolHandlers = {
  [K in ToolName]: (args: ToolArgs[K]) => Promise<string>
}
