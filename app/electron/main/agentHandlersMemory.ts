import type { AgentStreamPayload, MemoryCategory } from '../../src/types'
import type { ToolHandlers } from './agentTools'
import { addMemory, deleteMemory, searchMemories } from './memory'

export function createMemoryToolHandlers(
  projectPath: string,
  emit: (event: AgentStreamPayload) => void
): Partial<ToolHandlers> {
  return {
    remember: async (args) => {
      const entry = await addMemory(projectPath, {
        content: args.content,
        category: args.category as MemoryCategory,
        tags: args.tags,
        scope: args.scope === 'project' || args.scope === 'global' ? args.scope : undefined
      })
      emit({ type: 'learning_saved', content: entry.content, memoryId: entry.id })
      return `Запомнено [${entry.category}/${entry.scope}]: ${entry.content} (id: ${entry.id})`
    },

    search_memory: async (args) => {
      const results = await searchMemories(projectPath, args.query, 10)
      return JSON.stringify(results, null, 2)
    },

    forget: async (args) => {
      const removed = await deleteMemory(projectPath, args.id)
      return removed ? `Забыто: ${args.id}` : `Запись не найдена: ${args.id}`
    }
  }
}
