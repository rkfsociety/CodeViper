import { app } from 'electron'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

/** Оценки ≤ этого значения скрываются в UI и не пушатся в collective. */
export const COLLECTIVE_SCORE_HIDE_THRESHOLD = -2

function scoresPath(): string {
  return join(app.getPath('userData'), 'collective-scores.json')
}

export async function loadScores(): Promise<Record<string, number>> {
  const path = scoresPath()
  if (!existsSync(path)) return {}
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as Record<string, number>
  } catch {
    return {}
  }
}

async function saveScores(scores: Record<string, number>): Promise<void> {
  await writeFile(scoresPath(), JSON.stringify(scores, null, 2), 'utf8')
}

/**
 * Изменяет оценку записи на delta (+1 или -1) и сохраняет.
 * Возвращает новое значение оценки.
 */
export async function voteEntry(entryId: string, delta: 1 | -1): Promise<number> {
  const scores = await loadScores()
  scores[entryId] = (scores[entryId] ?? 0) + delta
  await saveScores(scores)
  return scores[entryId]
}
