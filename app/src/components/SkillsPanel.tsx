import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentSkill } from '../types'
import { isBuiltinSkill } from '../types'

interface Props {
  projectPath: string
  refreshKey?: number
}

export function SkillsPanel({ projectPath, refreshKey = 0 }: Props) {
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [loading, setLoading] = useState(false)

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

  const globalSkills = useMemo(
    () => skills.filter((skill) => skill.scope === 'global'),
    [skills]
  )
  const legacyProjectSkills = useMemo(
    () => skills.filter((skill) => skill.scope === 'project'),
    [skills]
  )

  async function remove(id: string) {
    await window.codeviper.deleteSkill(projectPath, id)
    await refresh()
  }

  function renderSkill(skill: AgentSkill) {
    const builtin = isBuiltinSkill(skill.id)

    return (
      <div key={skill.id} className="memory-item skill-item">
        <div className="memory-item-head">
          <span className="memory-badge skill-badge">{skill.name}</span>
          {builtin ? (
            <span className="memory-scope skill-builtin-badge">системный</span>
          ) : (
            <button className="btn memory-delete" onClick={() => remove(skill.id)}>
              ✕
            </button>
          )}
        </div>
        <div className="memory-content">{skill.description || skill.id}</div>
        {skill.triggers.length > 0 && (
          <div className="memory-tags">{skill.triggers.join(' · ')}</div>
        )}
      </div>
    )
  }

  return (
    <div className="skills-panel">
      <div className="memory-section-title">
        Навыки агента {loading ? '…' : `(${globalSkills.length})`}
      </div>

      <div className="empty skills-hint">
        Глобальные навыки хранятся в %APPDATA%/CodeViper/ViperSkills.md — это поведение агента, не
        файлы проекта. При совпадении триггеров с запросом инструкции подставляются автоматически.
        Скажи: «сделай skill для todo» или «улучши себя».
      </div>

      {!globalSkills.length && !loading && (
        <div className="empty">Пока нет навыков — попроси агента создать.</div>
      )}

      <div className="memory-list">{globalSkills.slice(0, 10).map(renderSkill)}</div>

      {globalSkills.length > 10 && (
        <div className="memory-more">+ ещё {globalSkills.length - 10} навыков</div>
      )}

      {legacyProjectSkills.length > 0 && (
        <>
          <div className="memory-section-title memory-section-sub">
            Устаревшие project-навыки ({legacyProjectSkills.length})
          </div>
          <div className="empty skills-hint">
            Раньше навыки могли сохраняться в .codeviper проекта. Новые создаются только глобально.
          </div>
          <div className="memory-list">{legacyProjectSkills.map(renderSkill)}</div>
        </>
      )}
    </div>
  )
}
