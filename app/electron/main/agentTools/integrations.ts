// ── Внешние интеграции: GitHub, GitLab, Jira, Linear, Web, Memory, Skills, Todo ──

export const GITHUB_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'check_github_auth',
      description:
        'Проверить авторизацию GitHub (gh CLI и/или Token) и наличие локального git-клона для синхронизации коллективных знаний. Вызывай перед push коллективной памяти, если sync падает.',
      parameters: { type: 'object', properties: {} }
    }
  },
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
      name: 'report_trace_to_github',
      description:
        'Отправить трейс текущего прогона на GitHub: gist с JSON + issue в rkfsociety/CodeViper с автоописанием от агента. Нужен gh auth login. Вызывай после ошибки или когда пользователь просит зафиксировать баг.',
      parameters: {
        type: 'object',
        properties: {
          note: {
            type: 'string',
            description: 'Дополнительный комментарий агента к отчёту (необязательно)'
          }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_pr',
      description: 'Создать GitHub Pull Request для текущего проекта пользователя через gh CLI',
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
      name: 'list_pull_requests',
      description:
        'Показать открытые GitHub Pull Request в текущем репозитории (как панель PR в UI): номер, заголовок, ветка, статус CI. Вызывай перед созданием PR или чтобы проверить CI.',
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

export const GITLAB_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_gitlab_mrs',
      description:
        'Показать открытые Merge Request в текущем GitLab-проекте (из git remote origin)',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_gitlab_mr',
      description: 'Создать GitLab Merge Request через API',
      parameters: {
        type: 'object',
        properties: {
          source_branch: { type: 'string', description: 'Ветка-источник (feature-ветка)' },
          target_branch: {
            type: 'string',
            description: 'Целевая ветка (обычно main или develop)'
          },
          title: { type: 'string', description: 'Заголовок MR' },
          description: { type: 'string', description: 'Описание MR в Markdown (необязательно)' }
        },
        required: ['source_branch', 'target_branch', 'title']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_gitlab_pipeline',
      description:
        'Получить статус GitLab Pipeline. Без pipeline_id — возвращает последний пайплайн проекта.',
      parameters: {
        type: 'object',
        properties: {
          pipeline_id: { type: 'string', description: 'ID пайплайна (необязательно)' }
        }
      }
    }
  }
] as const

export const JIRA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_jira_issue',
      description: 'Создать Issue в Jira через REST API',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Заголовок issue' },
          description: { type: 'string', description: 'Описание issue (необязательно)' },
          issue_type: {
            type: 'string',
            description: 'Тип issue: Bug, Task, Story, etc. (по умолчанию Task)'
          },
          project_key: { type: 'string', description: 'Ключ проекта в Jira (например, PROJ)' }
        },
        required: ['summary', 'project_key']
      }
    }
  }
] as const

export const LINEAR_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_linear_issue',
      description: 'Создать Issue в Linear через GraphQL API',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Заголовок issue' },
          description: { type: 'string', description: 'Описание issue (необязательно)' },
          team_key: {
            type: 'string',
            description: 'Ключ команды в Linear (например, ENG, FEAT)'
          },
          priority: {
            type: 'string',
            description: 'Приоритет 0=No priority, 1=Urgent, 2=High, 3=Medium, 4=Low'
          }
        },
        required: ['title', 'team_key']
      }
    }
  }
] as const

export const MEMORY_TOOLS = [
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

export const SKILLS_TOOLS = [
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

export const TODO_TOOLS = [
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
                title: { type: 'string', description: 'Текст задачи (допустим alias: text)' },
                text: { type: 'string', description: 'Текст задачи (alias для title)' }
              },
              required: ['id']
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

export const WEB_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_fetch',
      description:
        'Загружает содержимое URL-страницы и возвращает текст. Поддерживает HTTP/HTTPS. HTML автоматически конвертируется в читаемый текст. Используй для чтения документации, статей, npm-пакетов, GitHub-страниц.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL страницы для загрузки (http:// или https://)'
          },
          max_chars: {
            type: 'number',
            description: 'Максимальное количество символов в ответе (по умолчанию 20000)'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        'Поиск в интернете через DuckDuckGo. Возвращает краткий ответ и список релевантных ссылок. Используй для поиска документации, решений ошибок, актуальных данных. После получения ссылок используй web_fetch для чтения нужной страницы.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Поисковый запрос'
          },
          max_results: {
            type: 'number',
            description: 'Максимальное количество результатов (по умолчанию 5)'
          }
        },
        required: ['query']
      }
    }
  }
] as const
