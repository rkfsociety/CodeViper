import type { AgentStreamPayload, MemoryCategory, MemoryEntry } from '../../src/types'
import type { ToolHandlers } from './agentTools'
import { getPendingCollectiveMemoryCount, queueCollectiveMemoryEntry } from './collectiveMemorySync'
import { addMemory, deleteMemory, searchMemories } from './memory'

export interface MemoryToolHandlerOptions {
  syncCollectiveMemory?: boolean
}

function emitCollectiveMemoryQueued(
  emit: (event: AgentStreamPayload) => void,
  entry: MemoryEntry,
  enabled: boolean
): void {
  if (enabled === false || entry.scope !== 'global') return
  if (!queueCollectiveMemoryEntry(entry)) return
  emit({
    type: 'collective_sync',
    collectiveSyncStatus: 'queued',
    collectiveSyncCount: getPendingCollectiveMemoryCount(),
    content: entry.content
  })
}

export function createMemoryToolHandlers(
  projectPath: string,
  emit: (event: AgentStreamPayload) => void,
  ollamaUrl?: string,
  options?: MemoryToolHandlerOptions
): Partial<ToolHandlers> {
  const handlers: Partial<ToolHandlers> = {
    remember: async (args: any) => {
      const entry = await addMemory(
        projectPath,
        {
          content: args.content,
          category: args.category as MemoryCategory,
          tags: args.tags,
          scope: args.scope === 'project' || args.scope === 'global' ? args.scope : undefined
        },
        ollamaUrl
      )
      emit({ type: 'learning_saved', content: entry.content, memoryId: entry.id })
      emitCollectiveMemoryQueued(emit, entry, options?.syncCollectiveMemory !== false)
      return `Запомнено [${entry.category}/${entry.scope}]: ${entry.content} (id: ${entry.id})`
    },

    search_memory: async (args: any) => {
      const results = await searchMemories(projectPath, args.query, 10, ollamaUrl)
      return JSON.stringify(results, null, 2)
    },

    forget: async (args: any) => {
      const removed = await deleteMemory(projectPath, args.id)
      return removed ? `Забыто: ${args.id}` : `Запись не найдена: ${args.id}`
    }
  }
  return handlers
}
