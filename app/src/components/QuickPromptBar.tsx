const QUICK_CHIPS = [
  'Изучи проект',
  'Исправь ошибку',
  'Добавь тесты',
  'Обнови README',
  'Создай skill'
] as const

const CHIP_TEXT: Record<(typeof QUICK_CHIPS)[number], string> = {
  'Изучи проект': 'Кратко изучи структуру проекта и опиши архитектуру.',
  'Исправь ошибку': 'Исправь ошибку: ',
  'Добавь тесты': 'Добавь unit-тесты для …',
  'Обнови README': 'Обнови README по текущему состоянию проекта.',
  'Создай skill': 'Создай skill для … (global). Сначала list_skills.'
}

interface Props {
  onInsert: (text: string) => void
  disabled?: boolean
}

export function QuickPromptBar({ onInsert, disabled }: Props) {
  return (
    <div className="quick-prompt-bar">
      <span className="quick-prompt-label">Быстро:</span>
      <div className="quick-prompt-chips">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className="quick-prompt-chip"
            disabled={disabled}
            onClick={() => onInsert(CHIP_TEXT[chip])}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  )
}
