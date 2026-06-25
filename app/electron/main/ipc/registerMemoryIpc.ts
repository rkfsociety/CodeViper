import { ipcMain } from 'electron'
import { IPC, parseIpcArgs, Contracts } from '../../../shared/ipcContracts'
import { deleteMemory, listMemories } from '../memory'
import { voteEntry } from '../collectiveScores'
import { createSkill, deleteSkill, listSkills } from '../skills'
import { createGist, formatMemoriesAsMarkdown, formatSkillsAsMarkdown } from '../gist'
import { loadSettings } from '../settings'
import { resolveSelfImproveBranch } from '../../../shared/selfImprovement'
import {
  getPendingCollectiveMemoryCount,
  flushCollectiveMemoryToGit
} from '../collectiveMemorySync'

export function registerMemoryIpc(): void {
  ipcMain.handle('list-memories', async (_e, projectPath: string) => listMemories(projectPath))

  ipcMain.handle('delete-memory', async (_e, projectPath: string, id: string) =>
    deleteMemory(projectPath, id)
  )

  ipcMain.handle(IPC.VOTE_MEMORY, async (_e, entryId: string, delta: 1 | -1) =>
    voteEntry(entryId, delta)
  )

  ipcMain.handle('list-skills', async (_e, projectPath: string) => listSkills(projectPath))

  ipcMain.handle(
    'create-skill',
    async (
      _e,
      projectPath: string,
      input: { name: string; description: string; instructions: string; triggers?: string[] }
    ) => createSkill(projectPath, input)
  )

  ipcMain.handle('delete-skill', async (_e, projectPath: string, id: string) =>
    deleteSkill(projectPath, id)
  )

  ipcMain.handle(
    'share-as-gist',
    async (_e, token: string, projectPath: string, what: 'memory' | 'skills' | 'both') => {
      const files: Record<string, string> = {}
      const parts: string[] = []

      if (what === 'memory' || what === 'both') {
        const entries = await listMemories(projectPath)
        files['codeviper-memory.md'] = formatMemoriesAsMarkdown(entries)
        parts.push('память')
      }
      if (what === 'skills' || what === 'both') {
        const skills = await listSkills(projectPath)
        files['codeviper-skills.md'] = formatSkillsAsMarkdown(skills)
        parts.push('навыки')
      }

      const description = `CodeViper: ${parts.join(' + ')}`
      return createGist(token, files, description)
    }
  )

  ipcMain.handle(IPC.GET_COLLECTIVE_SYNC_STATUS, async (_e, ...a) => {
    parseIpcArgs(Contracts[IPC.GET_COLLECTIVE_SYNC_STATUS].args, a)
    const settings = await loadSettings()
    const branch = resolveSelfImproveBranch(settings.selfImproveBranch)
    const pendingCount = getPendingCollectiveMemoryCount()
    return { branch, pendingCount }
  })

  ipcMain.handle(IPC.FLUSH_COLLECTIVE_MEMORY, async (_e, ...a) => {
    const [summary] = parseIpcArgs(Contracts[IPC.FLUSH_COLLECTIVE_MEMORY].args, a)
    const settings = await loadSettings()
    return flushCollectiveMemoryToGit(
      summary,
      settings.selfImproveBranch,
      settings.autoCollectivePr
    )
  })
}
