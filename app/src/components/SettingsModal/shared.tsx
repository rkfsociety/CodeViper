import { createContext, useContext, type ReactNode } from 'react'
import styles from './SettingsModal.module.css'

export type SettingsTab =
  | 'model'
  | 'behavior'
  | 'performance'
  | 'memory'
  | 'integrations'
  | 'plugins'

export const SETTINGS_TABS: { id: SettingsTab; label: string; icon: string }[] = [
  {
    id: 'model',
    label: 'Модель',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  },
  {
    id: 'behavior',
    label: 'Поведение',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  },
  {
    id: 'performance',
    label: 'Производительность',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12L5 7l3 3 3-4 3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  },
  {
    id: 'memory',
    label: 'Память и навыки',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 3.5V2M11 3.5V2M1.5 7h13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  },
  {
    id: 'integrations',
    label: 'Интеграции',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="3" cy="8" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="4" r="2" stroke="currentColor" stroke-width="1.5"/><circle cx="13" cy="12" r="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 8h3l2.5-4M5 8h3l2.5 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  },
  {
    id: 'plugins',
    label: 'Плагины',
    icon: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="2" width="10" height="12" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M6 6h4M6 9h4M6 12h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
  }
]

export const TOOL_GROUPS: { id: string; label: string; desc: string; tools: string[] }[] = [
  {
    id: 'files',
    label: 'Файлы',
    desc: 'Чтение, запись, поиск, история файлов',
    tools: [
      'search_knowledge_base',
      'list_directory',
      'grep_files',
      'find_files',
      'search_in_project',
      'read_file',
      'read_multiple_files',
      'file_info',
      'project_stats',
      'search_in_file',
      'file_search_summary',
      'show_file_history',
      'copy_file',
      'rename_folder',
      'copy_folder',
      'preview_edit',
      'preview_patch',
      'write_file',
      'create_file',
      'edit_file',
      'undo_edit',
      'append_file',
      'delete_file',
      'move_file'
    ]
  },
  {
    id: 'commands',
    label: 'Команды',
    desc: 'Shell, скрипты, линтер',
    tools: ['run_command', 'run_script', 'review_code']
  },
  {
    id: 'git',
    label: 'Git',
    desc: 'Статус, diff, история, commit',
    tools: [
      'git_status',
      'git_diff',
      'git_log',
      'git_commit',
      'git_push',
      'git_checkout',
      'recent_changes'
    ]
  },
  {
    id: 'github',
    label: 'GitHub',
    desc: 'Issues, PR, Workflows',
    tools: ['create_issue', 'create_pr', 'list_issues', 'open_issue', 'trigger_github_workflow']
  },
  {
    id: 'gitlab',
    label: 'GitLab',
    desc: 'Merge Requests, пайплайны',
    tools: ['list_gitlab_mrs', 'create_gitlab_mr', 'get_gitlab_pipeline']
  },
  {
    id: 'memory',
    label: 'Память',
    desc: 'Сохранять паттерны и знания',
    tools: ['remember', 'search_memory', 'forget']
  },
  {
    id: 'packages',
    label: 'Зависимости',
    desc: 'package.json, тесты, lock-файл',
    tools: ['package_info', 'read_package_lock', 'dependency_summary', 'test_summary']
  },
  {
    id: 'skills',
    label: 'Навыки',
    desc: 'Управление навыками агента',
    tools: [
      'list_skills',
      'read_skill',
      'create_skill',
      'update_skill',
      'delete_skill',
      'read_skill_data',
      'write_skill_data'
    ]
  },
  {
    id: 'todo',
    label: 'Todo',
    desc: 'Список задач в чате',
    tools: ['set_todo_list', 'complete_todo_item', 'clear_todo_list']
  },
  {
    id: 'indexing',
    label: 'Индексация',
    desc: 'RAG и семантический поиск (Qdrant)',
    tools: ['index_project']
  },
  {
    id: 'web',
    label: 'Веб',
    desc: 'Fetch и поиск в интернете',
    tools: ['web_fetch', 'web_search']
  }
]

export const SearchCtx = createContext('')

export function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className={styles.searchMark}>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export function SettingItem({
  tab,
  label,
  desc,
  children
}: {
  tab: SettingsTab
  label: string
  desc?: string
  children: ReactNode
}) {
  const query = useContext(SearchCtx)
  if (query) {
    const hay = (label + ' ' + (desc ?? '')).toLowerCase()
    if (!hay.includes(query.toLowerCase())) return null
    const tabLabel = SETTINGS_TABS.find((t) => t.id === tab)?.label ?? ''
    return (
      <div className={styles.searchItem}>
        <div className={styles.searchItemHeader}>
          <span className={styles.searchItemTab}>{tabLabel}</span>
          <span className={styles.searchItemLabel}>
            <Highlight text={label} query={query} />
          </span>
        </div>
        {children}
      </div>
    )
  }
  return <>{children}</>
}
