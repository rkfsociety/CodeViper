// ── Индексирование, субагенты ────────────────────────────────────────────────

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
      name: 'delegate_to_reviewer',
      description:
        'Делегирует read-only обзор diff/изменений субагенту-ревьюеру (reviewer). Субагент не редактирует файлы: использует только чтение, git status/diff/log, recent_changes, test_summary и тестовые проверки. Используй для шагов ревью перед коммитом: найти риски, регрессии, пропущенные тесты и спорные места.',
      parameters: {
        type: 'object',
        properties: {
          task: {
            type: 'string',
            description:
              'Конкретная задача ревью: какой diff или область проверить, на какие риски обратить внимание.'
          },
          context: {
            type: 'string',
            description:
              'Дополнительный контекст: цель изменения, уже выполненные проверки, ожидаемое поведение.'
          }
        },
        required: ['task']
      }
    }
  },
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
