/** Тип записи в каталоге плагинов CodeViper. */
export type PluginCatalogKind = 'skills-repo'

export interface PluginCatalogEntry {
  /** Уникальный id для state и префикса skill-id */
  id: string
  name: string
  description: string
  /** HTTPS URL репозитория (git clone) */
  repoUrl: string
  branch?: string
  kind: PluginCatalogKind
  author?: string
  homepage?: string
}

/** Статический каталог — новые плагины добавляются сюда. */
export const PLUGIN_CATALOG: PluginCatalogEntry[] = [
  {
    id: 'superpowers',
    name: 'Superpowers',
    description:
      'Методология разработки с агентом: brainstorming, TDD, code review, планы и отладка. Импортирует skills из obra/superpowers.',
    repoUrl: 'https://github.com/obra/superpowers.git',
    branch: 'main',
    kind: 'skills-repo',
    author: 'obra',
    homepage: 'https://github.com/obra/superpowers'
  }
]

export function catalogSkillIdPrefix(catalogId: string): string {
  return `plugin-${catalogId}-`
}

export function catalogSkillId(catalogId: string, folderName: string): string {
  return `${catalogSkillIdPrefix(catalogId)}${folderName}`
}

export function findCatalogEntry(id: string): PluginCatalogEntry | undefined {
  return PLUGIN_CATALOG.find((entry) => entry.id === id)
}
