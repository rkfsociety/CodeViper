import logoUrl from '../../resources/icon.png'
import { formatRecentProjectLabel } from '../../shared/recentProjects'

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
    text: 'Создай глобальный skill для … (навык агента). Сначала list_skills, чтобы не дублировать.'
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
  hasProject?: boolean
  currentProjectPath?: string
  recentProjects?: string[]
  onOpenRecentProject?: (path: string) => void
  onBrowseProject?: () => void
}

export function WelcomePanel({
  onSelect,
  hasProject = true,
  currentProjectPath = '',
  recentProjects = [],
  onOpenRecentProject,
  onBrowseProject
}: Props) {
  const recents = recentProjects.filter((path) => path.trim())

  return (
    <div className="welcome-panel">
      <div className="welcome-hero">
        <div className="welcome-hero-icon" aria-hidden="true">
          <img src={logoUrl} alt="CodeViper" width={64} height={64} />
        </div>
        <h2 className="welcome-title">CodeViper готов к работе</h2>
        <p className="welcome-subtitle">
          {hasProject
            ? 'Опишите задачу или выберите шаблон — агент прочитает файлы, внесёт правки и запустит команды.'
            : 'Выберите папку с кодом или недавний проект — затем опишите задачу.'}
        </p>
      </div>

      {recents.length > 0 && (
        <div className="welcome-recent">
          <div className="welcome-recent-title">Недавние проекты</div>
          <div className="welcome-recent-list">
            {recents.map((path) => {
              const isCurrent = path === currentProjectPath
              return (
                <button
                  key={path}
                  type="button"
                  className={`welcome-recent-item${isCurrent ? ' welcome-recent-item-active' : ''}`}
                  title={path}
                  disabled={isCurrent}
                  onClick={() => onOpenRecentProject?.(path)}
                >
                  <span className="welcome-recent-name">{formatRecentProjectLabel(path)}</span>
                  <span className="welcome-recent-path">{path}</span>
                </button>
              )
            })}
          </div>
          {onBrowseProject && (
            <button type="button" className="welcome-recent-browse" onClick={onBrowseProject}>
              Открыть другую папку…
            </button>
          )}
        </div>
      )}

      {!hasProject && recents.length === 0 && onBrowseProject && (
        <div className="welcome-recent">
          <button type="button" className="welcome-recent-browse primary" onClick={onBrowseProject}>
            📁 Выбрать проект
          </button>
        </div>
      )}

      {hasProject && (
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
      )}

      <div className="welcome-hints">
        <span>Enter — отправить</span>
        <span>Shift+Enter — новая строка</span>
        <span>◎ Контекст — что видит модель</span>
      </div>
    </div>
  )
}
