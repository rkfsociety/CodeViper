import { useEffect } from 'react'
import { useModalA11y } from '../hooks/useModalA11y'
import styles from './KeyboardShortcutsModal.module.css'

interface Props {
  open: boolean
  onClose: () => void
}

interface ShortcutRow {
  keys: string[]
  label: string
}

interface ShortcutGroup {
  title: string
  rows: ShortcutRow[]
}

const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Навигация',
    rows: [
      { keys: ['Ctrl', ','], label: 'Открыть настройки' },
      { keys: ['Ctrl', 'K'], label: 'Фокус на поле ввода' },
      { keys: ['Ctrl', 'Shift', 'N'], label: 'Новый чат' },
      { keys: ['Ctrl', 'P'], label: 'Быстрое открытие файла (Quick Open)' },
      { keys: ['Ctrl', 'B'], label: 'Показать / скрыть дерево файлов' },
      { keys: ['Esc'], label: 'Остановить агента / Закрыть модалку' },
      { keys: ['?'], label: 'Показать шпаргалку горячих клавиш' }
    ]
  },
  {
    title: 'Чат',
    rows: [
      { keys: ['Enter'], label: 'Отправить сообщение' },
      { keys: ['Shift', 'Enter'], label: 'Новая строка в сообщении' },
      { keys: ['Ctrl', 'Enter'], label: 'Новая строка в сообщении' }
    ]
  },
  {
    title: 'Диалоги и модалки',
    rows: [{ keys: ['Esc'], label: 'Закрыть открытый диалог / модалку' }]
  },
  {
    title: 'Встроенный терминал',
    rows: [
      { keys: ['Ctrl', '`'], label: 'Показать / скрыть терминал' },
      { keys: ['↑', '↓'], label: 'Навигация по автодополнению' },
      { keys: ['Tab'], label: 'Применить автодополнение' },
      { keys: ['Enter'], label: 'Выполнить команду / принять вариант' },
      { keys: ['Esc'], label: 'Закрыть список автодополнения' }
    ]
  }
]

export function KeyboardShortcutsModal({ open, onClose }: Props) {
  const modalRef = useModalA11y<HTMLDivElement>(open)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        className={`modal ${styles.modal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="shortcuts-title">Горячие клавиши</h2>
          <button type="button" className="btn modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </div>

        <div className={`modal-body ${styles.body}`}>
          {SHORTCUTS.map((group) => (
            <section key={group.title} className={styles.group}>
              <h3 className={styles.groupTitle}>{group.title}</h3>
              <ul className={styles.list}>
                {group.rows.map((row, i) => (
                  <li key={i} className={styles.row}>
                    <span className={styles.keys}>
                      {row.keys.map((k, ki) => (
                        <span key={ki}>
                          <kbd className={styles.kbd}>{k}</kbd>
                          {ki < row.keys.length - 1 && <span className={styles.plus}>+</span>}
                        </span>
                      ))}
                    </span>
                    <span className={styles.label}>{row.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
