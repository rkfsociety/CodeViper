export const MAX_RECENT_PROJECTS = 10

/** Добавляет путь в начало списка недавних (без дублей, макс. 10). */
export function touchRecentProject(list: string[] | undefined, projectPath: string): string[] {
  const path = projectPath.trim()
  if (!path) return list ?? []
  const prev = (list ?? []).filter((item) => item !== path)
  return [path, ...prev].slice(0, MAX_RECENT_PROJECTS)
}

export function formatRecentProjectLabel(path: string): string {
  if (!path.trim()) return 'без проекта'
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}
