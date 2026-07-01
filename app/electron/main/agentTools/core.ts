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
      name: 'find_missing_tests',
      description:
        'Поиск исходников .ts/.tsx без пары *.test.ts/*.spec.ts рядом или в зеркальной папке tests/. Исключает *.d.ts, конфиги и out/. Возвращает список path.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Ограничить подпапкой или файлом (необязательно)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_import_issues',
      description:
        'AST-анализ ts/js на import/require на несуществующие файлы и неразрешённые alias из tsconfig paths. Возвращает отчёт с path:line:col.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Ограничить подпапкой или файлом (необязательно)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_unsafe_regex',
      description:
        'AST-анализ ts/js на regex с риском catastrophic backtracking: вложенные квантификаторы и неоднозначные alternation-паттерны под квантификаторами. Возвращает отчёт с path:line:col.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Ограничить подпапкой или файлом (необязательно)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_rerender_candidates',
      description:
        'AST-анализ React .tsx на export-компоненты с props без memo/useMemo/useCallback. Возвращает кандидатов на мемоизацию с path:line:col.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Ограничить подпапкой или файлом (необязательно)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_merge_conflicts',
      description:
        'Поиск маркеров незавершённого merge-конфликта (<<<<<<<, =======, >>>>>>>) по файлам проекта. Возвращает отчёт [n] path:line без правки кода.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Ограничить подпапкой (необязательно)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_magic_numbers',
      description:
        'AST-анализ ts/js на магические числовые литералы вне shared/constants.ts и без именованной константы рядом. Возвращает path:line:col и значение.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Папка или файл для анализа (относительно корня проекта)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_dead_code',
      description:
        'AST-анализ ts/js на мёртвый код: недостижимые операторы после return/throw/break/continue, if с константным true/false и тернарные операторы с константным условием. Возвращает отчёт с severity (high/medium/low) и path:line:col.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ограничить по подпапке или файлом (необязательно)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_type_mismatches',
      description:
        'TS type-check анализ проекта на несовпадения типов: присваивания, return-ы, аргументы вызовов и явные аннотации, где фактический тип не совместим с ожидаемым. Возвращает отчёт с severity (high/medium/low) и path:line:col.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ограничить под-папкой или файлом (необязательно)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_hotkey_conflicts',
      description:
        'Анализ hotkey-комбинаций в App.tsx: ищет дубли, пересечения с частыми системными сочетаниями и контекстные overlap в модалках. Возвращает отчёт.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Путь к App.tsx или другому файлу с hotkeys' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_dependency_diagram',
      description:
        'Построить граф импортов между модулями проекта (import/require → Mermaid graph LR). Когда: нужна карта зависимостей, архитектурный обзор, поиск связей между файлами. Не для npm-зависимостей (dependency_summary) или циклов (findImportCycles в UI).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ограничить подпапкой (необязательно)' },
          focus: {
            type: 'string',
            description:
              'Файл-центр: показать только его импорты и файлы, которые его импортируют (необязательно)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_class_diagram',
      description:
        'Построить диаграмму классов по AST/парсеру TS/Java/C# (классы, интерфейсы, наследование, методы → Mermaid classDiagram). Когда: обзор ООП-структуры, иерархия типов. Не для графа импортов (generate_dependency_diagram).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ограничить подпапкой (необязательно)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_dataflow_diagram',
      description:
        'Построить DFD уровня модуля: потоки IPC (invoke/handle), HTTP (fetch/axios) и FS (readFile/writeFile) → Mermaid flowchart. Когда: понять, как модули общаются с main/renderer, сетью и файловой системой. Не для графа импортов (generate_dependency_diagram).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ограничить подпапкой (необязательно)' },
          focus: {
            type: 'string',
            description: 'Один файл-модуль: показать только его IPC/HTTP/FS потоки (необязательно)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_project_metrics',
      description:
        'Собрать метрики проекта: LOC, число файлов, разбивка по языкам и оценка цикломатической сложности → Markdown-отчёт. Когда: обзор размера кодовой базы, сравнение модулей. Не для git-истории (recent_changes) или краткой сводки (project_stats).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Ограничить подпапкой (необязательно)' }
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
      name: 'format_project',
      description:
        'Отформатировать код проекта: Prettier для JS/TS/JSON/CSS/MD или Black для Python. Авто-определяет форматтер по package.json (скрипт format / prettier) или pyproject.toml. Изменяет файлы на диске.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Подпапка для форматирования (относительно корня проекта)'
          },
          formatter: {
            type: 'string',
            enum: ['auto', 'prettier', 'black'],
            description: 'Форматтер: auto (по умолчанию), prettier или black'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_heavy_dependencies',
      description:
        'Найти в node_modules пакеты тяжелее 1 MB и вернуть отсортированный список с путями и размером. Используй для быстрого поиска самых "тяжёлых" зависимостей в проекте.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Подпапка проекта, где искать node_modules (относительно корня проекта)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_aria_issues',
      description:
        'Проверить JSX/TSX на проблемы доступности (уровень 3): неизвестные aria-атрибуты, img без alt, интерактивные элементы без имени, кликабельные span/code без role и клавиатуры, кнопки с emoji без aria-label. По умолчанию анализирует MessageBody.tsx и App.tsx; возвращает отчёт в чат.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Подпапка проекта для анализа (относительно корня проекта)'
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Список файлов для анализа (относительные пути)'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_integration_url_issues',
      description:
        'Проверить URL интеграций в settings: GitLab/Jira base URL, webhook/discord webhook, P2P ws(s), token без URL. Возвращает отчёт в чат.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_cron_issues',
      description:
        'Проверить cron-выражения в settings.automations: невалидный cron, пустой prompt/id, дубликаты id. Возвращает отчёт в чат.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'find_settings_path_issues',
      description:
        'Проверить settings.json на битые пути в sourceRootOverride, gitRepoRoot, orchestratorModelPath и recentProjects. Возвращает отчёт в чат.',
      parameters: { type: 'object', properties: {}, required: [] }
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
      name: 'find_commit_message_issues',
      description:
        'Отчёт по commit-сообщениям в последних N коммитах: поиск сообщений вне Conventional Commits',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'string',
            description: 'Число последних коммитов 1–100 (по умолчанию 50)'
          }
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
