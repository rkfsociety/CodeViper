interface QuickPrompt {
  title: string
  description: string
  text: string
  icon: string
}

const WELCOME_PROMPTS: QuickPrompt[] = [
  {
    icon: '🔍',
    title: 'Изучить проект',
    description: 'Структура, стек, ключевые модули',
    text: 'Изучи структуру проекта: перечисли основные папки, стек и архитектуру. Без правок — только обзор.'
  },
  {
    icon: '🛠',
    title: 'Исправить задачу',
    description: 'Найти и починить баг',
    text: 'Исправь следующую проблему в проекте: '
  },
  {
    icon: '✅',
    title: 'Добавить тесты',
    description: 'Unit-тесты для модуля',
    text: 'Добавь unit-тесты для модуля … Сначала изучи код, затем минимальные тесты.'
  },
  {
    icon: '📝',
    title: 'Code review',
    description: 'Проверка качества кода',
    text: 'Сделай code review: найди слабые места, предложи точечные улучшения.'
  },
  {
    icon: '🧠',
    title: 'Создать skill',
    description: 'Новый навык агента',
    text: 'Создай skill для … (scope: global). Сначала list_skills, чтобы не дублировать.'
  },
  {
    icon: '📚',
    title: 'Обновить README',
    description: 'Документация проекта',
    text: 'Изучи проект и обнови README: установка, запуск, структура.'
  }
]

interface Props {
  onSelect: (text: string) => void
}

export function WelcomePanel({ onSelect }: Props) {
  return (
    <div className="welcome-panel">
      <div className="welcome-hero">
        <div className="welcome-hero-icon" aria-hidden="true">
          🐍
        </div>
        <h2 className="welcome-title">CodeViper готов к работе</h2>
        <p className="welcome-subtitle">
          Опишите задачу или выберите шаблон — агент прочитает файлы, внесёт правки и запустит
          команды.
        </p>
      </div>

      <div className="welcome-grid">
        {WELCOME_PROMPTS.map((item) => (
          <button
            key={item.title}
            type="button"
            className="welcome-card"
            onClick={() => onSelect(item.text)}
          >
            <span className="welcome-card-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="welcome-card-title">{item.title}</span>
            <span className="welcome-card-desc">{item.description}</span>
          </button>
        ))}
      </div>

      <div className="welcome-hints">
        <span>Enter — отправить</span>
        <span>Shift+Enter — новая строка</span>
        <span>◎ Контекст — что видит модель</span>
      </div>
    </div>
  )
}
