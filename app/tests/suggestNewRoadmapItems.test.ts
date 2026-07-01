import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let userDataDir = mkdtempSync(join(tmpdir(), 'cv-suggest-roadmap-userdata-'))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? userDataDir : process.cwd())
  }
}))

import { createProjectToolHandlers } from '../electron/main/agentHandlersProject'

function writeTrace(tool: string, error: string): void {
  const traceDir = join(userDataDir, 'traces', 'chats')
  mkdirSync(traceDir, { recursive: true })
  writeFileSync(
    join(traceDir, 'chat-1.json'),
    JSON.stringify({
      chatId: 'chat-1',
      updatedAt: Date.now(),
      events: [
        {
          ts: Date.now(),
          kind: 'tool_result',
          label: `✖ ${tool} — ошибка`,
          data: { tool, ok: false, error }
        }
      ]
    }),
    'utf8'
  )
}

function makeProject(): string {
  const projectDir = mkdtempSync(join(tmpdir(), 'cv-suggest-roadmap-project-'))
  mkdirSync(join(projectDir, 'ROADMAP'), { recursive: true })
  writeFileSync(
    join(projectDir, 'ROADMAP', '13-s-generation-and-docs.md'),
    [
      '# S: Генерация CI, пайплайнов и документации',
      '',
      '**90 · S · Последний S пункт** — уровень 4',
      '- **Цель:** old',
      '- **Файлы:** `old.ts`',
      '- **Действие:** old',
      '- **Проверка:** old',
      '',
      '### 🟡 M — средние',
      '',
      '> Несколько файлов.'
    ].join('\n'),
    'utf8'
  )
  writeFileSync(
    join(projectDir, 'ROADMAP', '29-m-guides-and-architecture-docs.md'),
    [
      '# M: Developer-гайды и API-документация',
      '',
      '**465 · M · Последний M пункт** — уровень 4',
      '- **Цель:** old',
      '- **Файлы:** `old.ts`',
      '- **Действие:** old',
      '- **Проверка:** old',
      '',
      '### 🟠 L — крупные',
      '',
      '> Много компонентов.'
    ].join('\n'),
    'utf8'
  )
  return projectDir
}

describe('suggest_new_roadmap_items', () => {
  beforeEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
    userDataDir = mkdtempSync(join(tmpdir(), 'cv-suggest-roadmap-userdata-'))
  })

  it('добавляет S-задачу из trace перед маркером следующего уровня', async () => {
    writeTrace('read_file', 'Ошибка: ENOENT missing path')
    const projectDir = makeProject()
    const { handlers } = createProjectToolHandlers(projectDir)

    const result = await handlers.suggest_new_roadmap_items!({ level: 'S', limit: '1' })

    const roadmap = readFileSync(join(projectDir, 'ROADMAP', '13-s-generation-and-docs.md'), 'utf8')
    expect(result).toContain('Номера: 91–91')
    expect(roadmap).toContain('**91 · S · Диагностика ошибки tool read_file')
    expect(roadmap.indexOf('**91 · S ·')).toBeLessThan(roadmap.indexOf('### 🟡 M'))
    rmSync(projectDir, { recursive: true, force: true })
  })

  it('добавляет M-задачу в конец M уровня', async () => {
    writeTrace('run_command', 'Ошибка: exit 1 npm run build')
    const projectDir = makeProject()
    const { handlers } = createProjectToolHandlers(projectDir)

    const result = await handlers.suggest_new_roadmap_items!({ level: 'M', limit: '1' })

    const roadmap = readFileSync(
      join(projectDir, 'ROADMAP', '29-m-guides-and-architecture-docs.md'),
      'utf8'
    )
    expect(result).toContain('Номера: 466–466')
    expect(roadmap).toContain('**466 · M · Диагностика ошибки tool run_command')
    expect(roadmap.indexOf('**466 · M ·')).toBeLessThan(roadmap.indexOf('### 🟠 L'))
    rmSync(projectDir, { recursive: true, force: true })
  })
})
