import { useEffect, useRef } from 'react'
import type { SlashCommand } from '../../shared/slashCommands'
import styles from './SlashCommandMenu.module.css'

interface Props {
  commands: SlashCommand[]
  selectedIndex: number
  onSelect: (cmd: SlashCommand) => void
}

export function SlashCommandMenu({ commands, selectedIndex, onSelect }: Props) {
  const listRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  return (
    <div className={styles.menu} role="listbox" aria-label="Slash-команды">
      <ul
        ref={(el) => {
          listRef.current = el
        }}
        className={styles.list}
      >
        {commands.map((cmd, i) => (
          <li
            key={cmd.trigger}
            className={`${styles.item}${i === selectedIndex ? ' ' + styles.selected : ''}`}
            role="option"
            aria-selected={i === selectedIndex}
            onMouseDown={(e) => {
              e.preventDefault() // сохранить фокус на textarea
              onSelect(cmd)
            }}
          >
            <span className={styles.trigger}>
              /{cmd.trigger}
              {cmd.hasArg && <span className={styles.argHint}> {cmd.argHint}</span>}
            </span>
            <span className={styles.desc}>{cmd.description}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
