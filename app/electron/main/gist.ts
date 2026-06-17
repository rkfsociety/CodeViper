import type { MemoryEntry } from '../../src/types'
import type { AgentSkill } from '../../src/types'

interface GistFile {
  content: string
}

interface GistPayload {
  description: string
  public: boolean
  files: Record<string, GistFile>
}

interface GistResponse {
  html_url: string
  id: string
}

export async function createGist(
  token: string,
  files: Record<string, string>,
  description: string
): Promise<string> {
  const payload: GistPayload = {
    description,
    public: false,
    files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { content }]))
  }

  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub API: ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`)
  }

  const data = (await res.json()) as GistResponse
  return data.html_url
}

export function formatMemoriesAsMarkdown(entries: MemoryEntry[]): string {
  if (!entries.length) return '_Памяти пусто_\n'
  const lines: string[] = ['# Память агента CodeViper\n']
  for (const e of entries) {
    lines.push(`## [${e.category}] ${e.content.slice(0, 60).replace(/\n/g, ' ')}`)
    lines.push(`**Scope:** ${e.scope} | **Tags:** ${e.tags.join(', ') || '—'}`)
    lines.push('')
    lines.push(e.content)
    lines.push('')
    lines.push('---')
    lines.push('')
  }
  return lines.join('\n')
}

export function formatSkillsAsMarkdown(skills: AgentSkill[]): string {
  if (!skills.length) return '_Навыков пусто_\n'
  const lines: string[] = ['# Навыки агента CodeViper\n']
  for (const s of skills) {
    lines.push(`## ${s.name}`)
    lines.push(`**Scope:** ${s.scope} | **Triggers:** ${s.triggers.join(', ') || '—'}`)
    lines.push('')
    if (s.description) lines.push(`> ${s.description}`)
    lines.push('')
    lines.push(s.instructions)
    lines.push('')
    lines.push('---')
    lines.push('')
  }
  return lines.join('\n')
}
