import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { computeEmbeddingQueued } from './embeddingQueue'
import { EMBED_MODEL, cosineSimilarity } from './embeddingShared'
const INDEX_FILENAME = 'embeddings.json'

interface EmbeddingIndex {
  version: number
  model: string
  entries: Record<string, number[]>
}

function globalIndexPath(): string {
  return join(app.getPath('userData'), INDEX_FILENAME)
}

function projectIndexPath(projectPath: string): string {
  return join(projectPath, '.codeviper', INDEX_FILENAME)
}

function emptyIndex(): EmbeddingIndex {
  return { version: 1, model: EMBED_MODEL, entries: {} }
}

async function loadIndex(path: string): Promise<EmbeddingIndex> {
  if (!existsSync(path)) return emptyIndex()
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as EmbeddingIndex
    if (typeof parsed.entries !== 'object') return emptyIndex()
    return parsed
  } catch {
    return emptyIndex()
  }
}

async function saveIndex(path: string, index: EmbeddingIndex): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, JSON.stringify(index), 'utf-8')
}

export async function computeEmbedding(text: string, ollamaUrl: string): Promise<number[] | null> {
  return computeEmbeddingQueued(text, ollamaUrl)
}

export async function upsertEmbedding(
  id: string,
  text: string,
  scope: 'global' | 'project',
  projectPath: string,
  ollamaUrl: string
): Promise<void> {
  const vec = await computeEmbedding(text, ollamaUrl)
  if (!vec) return

  const path =
    scope === 'project' && projectPath ? projectIndexPath(projectPath) : globalIndexPath()
  const index = await loadIndex(path)
  index.entries[id] = vec
  await saveIndex(path, index)
}

export async function removeEmbedding(id: string, projectPath: string): Promise<void> {
  const paths = [globalIndexPath(), ...(projectPath ? [projectIndexPath(projectPath)] : [])]
  for (const p of paths) {
    const index = await loadIndex(p)
    if (id in index.entries) {
      delete index.entries[id]
      await saveIndex(p, index)
    }
  }
}

export interface ScoredId {
  id: string
  score: number
}

export async function semanticSearch(
  query: string,
  projectPath: string,
  ollamaUrl: string,
  limit = 10
): Promise<ScoredId[] | null> {
  const queryVec = await computeEmbedding(query, ollamaUrl)
  if (!queryVec) return null

  const paths = [globalIndexPath(), ...(projectPath ? [projectIndexPath(projectPath)] : [])]

  const scored: ScoredId[] = []
  for (const p of paths) {
    const index = await loadIndex(p)
    for (const [id, vec] of Object.entries(index.entries)) {
      scored.push({ id, score: cosineSimilarity(queryVec, vec) })
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}
