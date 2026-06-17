import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentSkill } from '../types'
import { isBuiltinSkill } from '../types'

interface Props {
  projectPath: string
  githubToken?: string
  refreshKey?: number
}

const PAGE_SIZE = 10

export function SkillsPanel({ projectPath, githubToken, refreshKey = 0 }: Props) {
  const [skills, setSkills] = useState<AgentSkill[]>([])
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [sharing, setSharing] = useState(false)
  const [shareResult, setShareResult] = useState<string | null>(null)

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

  async function remove(id: string) {
    await window.codeviper.deleteSkill(projectPath, id)
    await refresh()
  }

  async function share() {
    if (!githubToken) {
      setShareResult('⚠ Укажите GitHub Token в настройках (вкладка Поведение)')
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
        <button
          type="button"
          className="btn share-btn"
          onClick={share}
          disabled={sharing || !globalSkills.length}
          title={
            githubToken ? 'Создать Gist и скопировать ссылку' : 'Нужен GitHub Token в настройках'
          }
        >
          {sharing ? '…' : '⬆ Поделиться'}
        </button>
      </div>
      {shareResult && <div className="share-result">{shareResult}</div>}

      <div className="empty skills-hint">
        Глобальные навыки хранятся в %APPDATA%/CodeViper/ViperSkills.md — это поведение агента, не
        файлы проекта. При совпадении триггеров с запросом инструкции подставляются автоматически.
        Скажи: «сделай skill для todo» или «улучши себя».
      </div>

      {!globalSkills.length && !loading && (
        <div className="empty">Пока нет навыков — попроси агента создать.</div>
      )}

      <div className="memory-list">{globalSkills.slice(0, visible).map(renderSkill)}</div>

      {globalSkills.length > visible && (
        <button
          type="button"
          className="btn memory-more-btn"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
        >
          Показать ещё ({globalSkills.length - visible})
        </button>
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
