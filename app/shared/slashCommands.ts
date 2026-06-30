import type { PromptTemplate } from '../src/types'

export interface SlashCommand {
  trigger: string
  description: string
  hasArg?: boolean
  argHint?: string
  expand: (arg?: string) => string
}

function toSlashCommands(templates: PromptTemplate[]): SlashCommand[] {
  return templates.map((t) => ({
    trigger: t.trigger,
    description: t.description,
    expand: () => t.text
  }))
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    trigger: 'test',
    description: 'Запустить тесты и исправить упавшие',
    expand: () => 'Запусти npm run test. Если есть упавшие тесты — найди причину и исправь каждый.'
  },
  {
    trigger: 'typecheck',
    description: 'Проверить типы и исправить ошибки TS',
    expand: () => 'Запусти npm run typecheck. Исправь все ошибки TypeScript.'
  },
  {
    trigger: 'lint',
    description: 'Проверить ESLint и исправить ошибки',
    expand: () => 'Запусти npm run lint. Исправь все ошибки ESLint.'
  },
  {
    trigger: 'build',
    description: 'Собрать проект и исправить ошибки сборки',
    expand: () => 'Запусти npm run build. Исправь все ошибки сборки.'
  },
  {
    trigger: 'commit',
    description: 'Сделать git commit текущих изменений',
    expand: () =>
      'Сделай git commit с понятным сообщением для текущих несохранённых изменений. Если нечего коммитить — скажи об этом.'
  },
  {
    trigger: 'review',
    description: 'Code review — найти баги и предложить улучшения',
    expand: () =>
      'Проведи code review: найди баги, неочевидные ошибки, нарушения стиля. Предложи конкретные улучшения с кратким объяснением каждого.'
  },
  {
    trigger: 'security',
    description: 'Security review — секреты, injection, небезопасные команды',
    expand: () =>
      'Проведи security review: найди утечки секретов и ключей в коде, injection-уязвимости (SQL, XSS, command injection), небезопасные shell-команды и опасные API. Опиши риск каждой находки и предложи конкретные исправления.'
  },
  {
    trigger: 'fix',
    description: 'Найти и исправить ошибки',
    expand: () => 'Найди и исправь ошибки в коде.'
  },
  {
    trigger: 'explain',
    description: 'Объяснить как работает код',
    expand: () => 'Объясни как работает этот код — кратко, по существу.'
  },
  {
    trigger: 'refactor',
    description: 'Отрефакторить — улучшить читаемость',
    expand: () => 'Отрефактори код: улучши читаемость и структуру без изменения поведения.'
  }
]

/** Разобрать /trigger [arg] из строки ввода. */
export function parseSlashInput(text: string): { trigger: string; arg: string } | null {
  if (!text.startsWith('/')) return null
  const m = text.match(/^\/(\S*)(?:\s+(.*))?$/)
  if (!m) return null
  return { trigger: m[1].toLowerCase(), arg: (m[2] ?? '').trim() }
}

/** Найти команды, чьё trigger начинается с введённого текста. */
export function matchSlashCommands(
  text: string,
  userTemplates: PromptTemplate[] = []
): SlashCommand[] {
  if (!text.startsWith('/')) return []
  const parsed = parseSlashInput(text)
  if (!parsed) return []
  // Если уже введён аргумент у команды с hasArg — не менять список (продолжаем показывать)
  const all = [...SLASH_COMMANDS, ...toSlashCommands(userTemplates)]
  return all.filter((c) => c.trigger.startsWith(parsed.trigger))
}

/** Раскрыть команду, если ввод — слэш-команда. Иначе вернуть исходный текст. */
export function expandSlashCommand(text: string, userTemplates: PromptTemplate[] = []): string {
  if (!text.startsWith('/')) return text
  const parsed = parseSlashInput(text)
  if (!parsed) return text
  // Пользовательские шаблоны имеют приоритет над встроенными
  const all = [...toSlashCommands(userTemplates), ...SLASH_COMMANDS]
  const cmd = all.find((c) => c.trigger === parsed.trigger)
  if (!cmd) return text
  return cmd.expand(parsed.arg || undefined)
}
