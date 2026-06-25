import type { AgentSettings } from '../../types'
import { MemoryPanel } from '../MemoryPanel'
import { SkillsPanel } from '../SkillsPanel'

interface Props {
  settings: AgentSettings
  chatProjectPath: string
  memoryRefreshKey: number
  skillsRefreshKey: number
  onSelfLearningChange: (selfLearning: boolean) => void
}

export function MemoryTab({
  settings,
  chatProjectPath,
  memoryRefreshKey,
  skillsRefreshKey,
  onSelfLearningChange
}: Props) {
  return (
    <>
      <MemoryPanel
        projectPath={chatProjectPath}
        selfLearning={settings.selfLearning !== false}
        onSelfLearningChange={onSelfLearningChange}
        githubToken={settings.githubToken}
        refreshKey={memoryRefreshKey}
      />

      <SkillsPanel
        projectPath={chatProjectPath}
        githubToken={settings.githubToken}
        refreshKey={skillsRefreshKey}
      />
    </>
  )
}
