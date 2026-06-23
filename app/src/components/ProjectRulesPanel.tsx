import { memo, useCallback, useEffect, useRef, useState } from 'react'
import styles from './ProjectRulesPanel.module.css'

const RULES_PATH = '.codeviper/rules.md'

interface Props {
  projectPath: string
  onClose?: () => void
}

export const ProjectRulesPanel = memo(function ProjectRulesPanel({ projectPath, onClose }: Props) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isNew, setIsNew] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!projectPath) return
    setLoading(true)
    setMessage(null)
    window.codeviper
      .readFile(projectPath, RULES_PATH)
      .then((content) => {
        setText(content)
        setSaved(content)
        setIsNew(false)
      })
      .catch(() => {
        setText('')
        setSaved('')
        setIsNew(true)
      })
      .finally(() => setLoading(false))
  }, [projectPath])

  const handleSave = useCallback(async () => {
    if (!projectPath) return
    setMessage(null)
    try {
      await window.codeviper.writeFile(projectPath, RULES_PATH, text)
      setSaved(text)
      setIsNew(false)
      setMessage('✓ Сохранено')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => setMessage(null), 2500)
    } catch (e) {
      setMessage(`✗ ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [projectPath, text])

  const dirty = text !== saved

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.icon}>📋</span>
        <span className={styles.title}>Правила проекта</span>
        <span className={styles.path}>{RULES_PATH}</span>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
      </div>

      <div className={styles.body}>
        {isNew && !loading && (
          <div className={styles.hint}>
            Файл не найден — будет создан при первом сохранении. Агент автоматически учитывает эти
            правила в каждом запросе.
          </div>
        )}

        {loading ? (
          <div className={styles.hint}>Загрузка…</div>
        ) : (
          <textarea
            className={styles.textarea}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'# Правила проекта\n\nНапиши инструкции для агента по этому проекту…'}
            spellCheck={false}
            rows={8}
          />
        )}

        <div className={styles.footer}>
          {message && <span className={styles.message}>{message}</span>}
          <button
            type="button"
            className={styles.btn}
            onClick={() => void handleSave()}
            disabled={!dirty || loading || !projectPath}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  )
})
