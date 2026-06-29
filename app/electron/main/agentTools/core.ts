// ── Файловые операции, git, shell, пакеты ────────────────────────────────────

export const FILE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description:
        'Семантический поиск по базе знаний проекта (Qdrant). Возвращает top-5 релевантных чанков с путями файлов.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Поисковый запрос на естественном языке' },
          collection: {
            type: 'string',
            description: 'Имя коллекции Qdrant (по умолчанию "codeviper_project")'
          },
          limit: { type: 'string', description: 'Количество результатов 1–10 (по умолчанию 5)' }
        },
        required: ['query']
      }
    }
  },
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
      description:
        'Поиск текста или regex по содержимому файлов проекта (как ripgrep). Когда: искать строку/символ сразу во многих файлах, точный path неизвестен. Не для имён файлов (find_files), не для одного большого файла >512KB (search_in_file), не для сводки без строк (file_search_summary). Пропускает файлы >512KB.',
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
      description:
        'Найти файлы по имени или glob-шаблону (*.tsx, *test*, agent.ts). Когда: знаешь маску имени/расширение, но не ищешь текст внутри. Не для поиска по содержимому (grep_files, search_in_file, file_search_summary).',
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
      name: 'find_symbol',
      description:
        'Найти объявление символа (функция, класс, переменная, интерфейс) по AST в ts/js/py. Возвращает path:line:col.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Имя символа' },
          path: { type: 'string', description: 'Ограничить подпапкой (необязательно)' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_references',
      description:
        'Найти все вхождения символа по AST/лексеру в ts/js/py. Возвращает path:line:col для каждой ссылки.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Имя символа' },
          path: { type: 'string', description: 'Ограничить подпапкой (необязательно)' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_slow_code',
      description:
        'AST-анализ ts/js/py на потенциально медленный код: вложенные циклы, await в цикле, sync I/O, JSON.parse/loads, линейный поиск по массиву в цикле. Возвращает отчёт с severity (high/medium/low) и path:line:col.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ограничить подпапкой или файлом (необязательно)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_in_project',
      description:
        'Универсальный поиск: type="content" — ищет текст/regex внутри файлов (как grep); type="name" — ищет файлы по имени/glob (как find). Используй этот инструмент, когда не уверен, что именно нужно.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Текст, /regex/flags или glob-паттерн имени файла'
          },
          type: {
            type: 'string',
            enum: ['content', 'name'],
            description: '"content" — поиск по содержимому; "name" — поиск по имени файла'
          },
          path: { type: 'string', description: 'Ограничить подпапкой (необязательно)' }
        },
        required: ['query', 'type']
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
      name: 'read_multiple_files',
      description:
        'Читать несколько файлов за один вызов. Возвращает массив {path, content}. Используй вместо нескольких последовательных read_file.',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'список путей к файлам'
          }
        },
        required: ['paths']
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
        'Поиск текста внутри одного известного файла. Когда: path уже есть (из find_files, list_directory и т.п.); особенно файлы >512KB, которые grep_files пропускает. Не для обхода всего проекта (grep_files) или поиска файлов по имени (find_files).',
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
        'Краткая сводка поиска по проекту: сколько совпадений и в каких файлах, без полного текста строк. Когда: быстро оценить масштаб и выбрать файлы перед grep_files или read_file. Не заменяет построчный grep_files.',
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
        'Показать diff и перезаписать файл ЦЕЛИКОМ. Только для новых файлов или полного переписывания — content должен содержать ВСЕ строки файла без исключения. Для точечных правок существующих файлов — используй preview_patch (безопаснее).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь к файлу относительно корня проекта' },
          content: {
            type: 'string',
            description: 'новое содержимое файла целиком (все строки без исключения)'
          }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'preview_patch',
      description:
        'Показать пользователю diff точечной правки и применить после подтверждения. Предпочтительный инструмент для правок существующих файлов — заменяет только указанный фрагмент, не трогая остальной код. Перед вызовом — прочитай файл, чтобы скопировать точный old_string.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь к файлу относительно корня проекта' },
          old_string: {
            type: 'string',
            description: 'точный фрагмент из файла (с пробелами и переносами)'
          },
          new_string: { type: 'string', description: 'новый фрагмент вместо old_string' },
          replace_all: {
            type: 'string',
            description: 'true — заменить все вхождения; по умолчанию false'
          }
        },
        required: ['path', 'old_string', 'new_string']
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
      description:
        'Точечная замена old_string → new_string. Копируй только код из read_file (без [Файл:…] / [Конец файла]). Большие файлы: grep + read с offset/limit.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'путь к файлу' },
          old_string: {
            type: 'string',
            description: 'Точный фрагмент кода из файла (не служебные строки read_*)'
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
  },
  {
    type: 'function',
    function: {
      name: 'run_script',
      description:
        'Запустить скрипт через интерпретатор. Используй для многострочных скриптов Python, PowerShell или Bash.',
      parameters: {
        type: 'object',
        properties: {
          interpreter: {
            type: 'string',
            enum: ['python', 'powershell', 'bash'],
            description: 'Интерпретатор: python, powershell или bash'
          },
          script: { type: 'string', description: 'Текст скрипта' },
          cwd: {
            type: 'string',
            description: 'Рабочая папка (необязательно, относительно корня проекта)'
          }
        },
        required: ['interpreter', 'script']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'review_code',
      description:
        'Проверить файл линтером: .ts/.tsx/.js/.jsx → ESLint, .py → Ruff. Возвращает список нарушений с позициями (строка:столбец) и правилами.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Путь к файлу относительно корня проекта' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_tests',
      description:
        'Запустить тесты проекта и вернуть структурированный результат: сколько прошло/упало, имена упавших тестов, стек ошибок. Авто-определяет runner (vitest/jest/pytest/cargo/go) по файлам проекта. Используй после правок, чтобы убедиться, что тесты проходят. При падениях — исправь код и вызови снова.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description:
              'Переопределить команду запуска (например, "npx vitest run src/foo.test.ts"). Если не указано — авто-определение по проекту.'
          },
          path: {
            type: 'string',
            description: 'Подпапка для запуска тестов (относительно корня проекта)'
          }
        },
        required: []
      }
    }
  }
] as const

export const GIT_TOOLS = [
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
          path: {
            type: 'string',
            description: 'Только коммиты, затронувшие путь (необязательно)'
          },
          oneline: { type: 'string', description: 'true — краткий формат (--oneline)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description:
        'Создать git-коммит staged-изменений с сообщением (безопаснее run_command git commit)',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Сообщение коммита (-m)'
          }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_push',
      description:
        'Отправить коммиты на remote (безопаснее run_command git push). Опционально remote и branch.',
      parameters: {
        type: 'object',
        properties: {
          remote: {
            type: 'string',
            description:
              'Имя remote (например origin). Без branch — push текущей ветки на этот remote'
          },
          branch: {
            type: 'string',
            description: 'Имя ветки на remote (требует remote, например main)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_checkout',
      description:
        'Переключить ветку (git switch/checkout). При незакоммиченных изменениях нужен force=true.',
      parameters: {
        type: 'object',
        properties: {
          branch: {
            type: 'string',
            description: 'Имя ветки для переключения'
          },
          force: {
            type: 'string',
            description: 'true — переключить при dirty tree (может потерять локальные правки)'
          }
        },
        required: ['branch']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_stash',
      description:
        'Спрятать незакоммиченные изменения в stash (безопаснее run_command git stash). Перед опасными операциями.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Сообщение stash (-m); по умолчанию codeviper-stash'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_stash_pop',
      description:
        'Вернуть последний stash на рабочую копию (git stash pop). Может вызвать конфликты слияния.',
      parameters: {
        type: 'object',
        properties: {}
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

export const PACKAGE_TOOLS = [
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
