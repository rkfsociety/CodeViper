import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { AgentSkill } from '../types'
import { isBuiltinSkill } from '../types'
import { Skeleton } from './Skeleton'
import styles from './MemorySkills.module.css'

interface Props {
  projectPath: string
  githubToken?: string
  refreshKey?: number
}

export function SkillsPanel({ projectPath, githubToken, refreshKey = 0 }: Props) {
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [loading, setLoading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareResult, setShareResult] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setSkills(await window.codeviper.listSkills(projectPath))
    } finally {
      setLoading(false)
    }
  }, [projectPath])

  useEffect(() => {
    refresh()
  }, [refresh, refreshKey])

  const globalSkills = useMemo(() => skills.filter((skill) => skill.scope === 'global'), [skills])
  const legacyProjectSkills = useMemo(
    () => skills.filter((skill) => skill.scope === 'project'),
    [skills]
  )

  const rowVirtualizer = useVirtualizer({
    count: globalSkills.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 82,
    overscan: 3
  })

  async function remove(id: string) {
    await window.codeviper.deleteSkill(projectPath, id)
    await refresh()
  }

  async function share() {
    if (!githubToken) {
      setShareResult('⚠ Укажите GitHub Token в настройках (вкладка Интеграции)')
      return
    }
    setSharing(true)
    setShareResult(null)
    try {
      const url = await window.codeviper.shareAsGist(githubToken, projectPath, 'skills')
      await navigator.clipboard.writeText(url)
      setShareResult(`✓ Скопировано: ${url}`)
    } catch (e) {
      setShareResult(`✕ Ошибка: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSharing(false)
    }
  }

  function renderSkillContent(skill: AgentSkill) {
    const builtin = isBuiltinSkill(skill.id)
    return (
      <div className={styles.item}>
        <div className={styles.itemHead}>
          <span className={`${styles.badge} ${styles.skillBadge}`}>{skill.name}</span>
          {builtin ? (
            <span className={`${styles.scope} ${styles.builtinBadge}`}>системный</span>
          ) : (
            <button className={`btn ${styles.delete}`} onClick={() => remove(skill.id)}>
              ✕
            </button>
          )}
        </div>
        <div className={styles.content}>{skill.description || skill.id}</div>
        {skill.triggers.length > 0 && (
          <div className={styles.tags}>{skill.triggers.join(' · ')}</div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.skillsPanel}>
      <div className={styles.sectionTitle}>
        Навыки агента{' '}
        {loading ? <Skeleton inline width={28} height={14} /> : `(${globalSkills.length})`}
        <button
          type="button"
          className={`btn ${styles.shareBtn}`}
          onClick={share}
          disabled={sharing || !globalSkills.length}
          title={
            githubToken ? 'Создать Gist и скопировать ссылку' : 'Нужен GitHub Token в настройках'
          }
        >
          {sharing ? <Skeleton inline width={20} height={14} /> : '⬆ Поделиться'}
        </button>
      </div>
      {shareResult && <div className={styles.shareResult}>{shareResult}</div>}

      <div className={`empty ${styles.skillsHint}`}>
        Глобальные навыки хранятся в %APPDATA%/CodeViper/ViperSkills.md — это поведение агента, не
        файлы проекта. При совпадении триггеров с запросом инструкции подставляются автоматически.
        Скажи: «сделай skill для todo» или «улучши себя».
      </div>

      {!globalSkills.length && !loading && (
        <div className="empty">Пока нет навыков — попроси агента создать.</div>
      )}

      <div ref={listRef} className={styles.list}>
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const skill = globalSkills[virtualRow.index]
            return (
              <div
                key={virtualRow.key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingBottom: 8
                }}
              >
                {renderSkillContent(skill)}
              </div>
            )
          })}
        </div>
      </div>

      {legacyProjectSkills.length > 0 && (
        <>
          <div className={styles.sectionTitle}>
            Устаревшие project-навыки ({legacyProjectSkills.length})
          </div>
          <div className={`empty ${styles.skillsHint}`}>
            Раньше навыки могли сохраняться в .codeviper проекта. Новые создаются только глобально.
          </div>
          <div className={styles.list}>
            {legacyProjectSkills.map((skill) => (
              <div key={skill.id} style={{ paddingBottom: 8 }}>
                {renderSkillContent(skill)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
