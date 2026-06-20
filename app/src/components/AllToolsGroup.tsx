import { useState } from 'react'
import type { ChatMessage } from '../types'
import styles from './AllToolsGroup.module.css'

interface AllToolsGroupProps {
  items: ChatMessage[]
}

function humanizeToolName(name: string): string {
  const map: Record<string, string> = {
    read_file: 'Read',
    write_file: 'Write',
    edit_file: 'Edit',
    bash: 'Run',
    search_files: 'Search',
    grep_search: 'Search',
    grep: 'Search',
    list_directory: 'List',
    list_files: 'List',
    create_file: 'Create',
    delete_file: 'Delete',
    move_file: 'Move',
    copy_file: 'Copy',
    execute_command: 'Run',
    run_command: 'Run',
    web_search: 'Search Web',
    fetch_url: 'Fetch'
  }
  if (map[name]) return map[name]
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function parseContent(content: string) {
  const isRunning = content.startsWith('▶')
  const isError = content.startsWith('✗') || content.startsWith('❌')
  const lines = content.split('\n')
  const firstLine = lines[0].replace(/^[▶✓✗❌]\s*/, '').trim()
  const result = lines.slice(1).join('\n').trim()
  return { isRunning, isError, firstLine, result }
}

function ToolItem({ m }: { m: ChatMessage }) {
  const [open, setOpen] = useState(false)
  const name = m.toolName || 'tool'
  const { isRunning, isError, firstLine, result } = parseContent(m.content)

  const statusIcon = isRunning ? '…' : isError ? '✗' : '✓'
  const statusClass = isRunning
    ? styles.statusRunning
    : isError
      ? styles.statusError
      : styles.statusOk

  const label = `${humanizeToolName(name)}${firstLine ? ' ' + firstLine : ''}`

  return (
    <div className={styles.item}>
      <button
        type="button"
        className={styles.itemRow}
        onClick={() => result && setOpen((v) => !v)}
        aria-expanded={open}
        style={{ cursor: result ? 'pointer' : 'default' }}
      >
        <span className={`${styles.itemStatus} ${statusClass}`}>{statusIcon}</span>
        <span className={styles.itemLabel}>{label}</span>
        {result && <span className={styles.itemChevron}>{open ? '▾' : '›'}</span>}
      </button>
      {open && result && <div className={styles.itemResult}>{result}</div>}
    </div>
  )
}

export function AllToolsGroup({ items }: AllToolsGroupProps) {
  const [open, setOpen] = useState(false)

  const lastItem = items[items.length - 1]
  const allDone = items.every((m) => !m.content.startsWith('▶'))
  const hasError = items.some((m) => m.content.startsWith('✗') || m.content.startsWith('❌'))

  const headerStatus = !allDone ? 'running' : hasError ? 'error' : 'done'
  const headerIcon = headerStatus === 'running' ? '…' : headerStatus === 'error' ? '✗' : '✓'

  let headerLabel = 'Инструменты'
  if (lastItem) {
    const name = lastItem.toolName || 'tool'
    const { firstLine } = parseContent(lastItem.content)
    headerLabel = `${humanizeToolName(name)}${firstLine ? ' ' + firstLine : ''}`
  }

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span
          className={
            headerStatus === 'running'
              ? styles.statusRunning
              : headerStatus === 'error'
                ? styles.statusError
                : styles.statusOk
          }
        >
          {headerIcon}
        </span>
        <span className={styles.headerLabel}>{headerLabel}</span>
        {items.length > 1 && <span className={styles.headerCount}>+{items.length - 1}</span>}
        <span className={styles.headerChevron}>{open ? '▾' : '›'}</span>
      </button>

      {open && (
        <div className={styles.list}>
          {items.map((m) => (
            <ToolItem key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  )
}
