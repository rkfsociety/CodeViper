import { useCallback, useEffect, useState } from 'react'
import type { AgentSkill } from '../types'

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

  async function remove(id: string) {
    await window.codeviper.deleteSkill(projectPath, id)
    await refresh()
  }

  return (
    <div className="skills-panel">
      <div className="memory-section-title">
        Навыки агента {loading ? '…' : `(${skills.length})`}
      </div>

      <div className="empty skills-hint">
        По запросу агент создаёт skills: todo-лист, чеклисты, форматы работы. Скажи в чате:
        «сделай skill для todo» или «улучши себя».
      </div>

      {!skills.length && !loading && (
        <div className="empty">Пока нет навыков — попроси агента создать.</div>
      )}

      <div className="memory-list">
        {skills.slice(0, 8).map((skill) => (
          <div key={skill.id} className="memory-item skill-item">
            <div className="memory-item-head">
              <span className="memory-badge skill-badge">{skill.name}</span>
              <span className="memory-scope">{skill.scope}</span>
              <button className="btn memory-delete" onClick={() => remove(skill.id)}>
                ✕
              </button>
            </div>
            <div className="memory-content">{skill.description || skill.id}</div>
            {skill.triggers.length > 0 && (
              <div className="memory-tags">{skill.triggers.join(' · ')}</div>
            )}
          </div>
        ))}
      </div>

      {skills.length > 8 && (
        <div className="memory-more">+ ещё {skills.length - 8} навыков</div>
      )}
    </div>
  )
}
