import { useMemo, useRef, useState } from 'react'
import { parseAnsi } from '../../shared/ansi'
import { useCommandHistory } from '../hooks/useCommandHistory'

interface Props {
  projectPath: string
  embedded?: boolean
}

export function TerminalPanel({ projectPath, embedded = false }: Props) {
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState<string>(
    'CodeViper Terminal — команды выполняются в корне проекта.\n'
  )
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const { push, getSuggestions } = useCommandHistory()

  const segments = useMemo(() => parseAnsi(output), [output])

  function handleChange(value: string) {
    setCommand(value)
    setSelectedIdx(-1)
    if (value.startsWith('/')) {
      setSuggestions(getSuggestions(value.slice(1)))
    } else {
      setSuggestions([])
    }
  }

  function applySuggestion(suggestion: string) {
    setCommand(suggestion)
    setSuggestions([])
    setSelectedIdx(-1)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((i) => Math.max(i - 1, -1))
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && selectedIdx >= 0)) {
        e.preventDefault()
        applySuggestion(suggestions[selectedIdx >= 0 ? selectedIdx : 0])
        return
      }
      if (e.key === 'Escape') {
        setSuggestions([])
        setSelectedIdx(-1)
        return
      }
    }
    if (e.key === 'Enter') run()
  }

  async function run() {
    if (!command.trim()) return
    setSuggestions([])
    setSelectedIdx(-1)
    push(command)
    setOutput((prev) => `${prev}\n> ${command}\n`)

    const result = await window.codeviper.runTerminalCommand(projectPath, command)
    const chunk = [result.stdout, result.stderr, `exit code: ${result.exitCode}`]
      .filter(Boolean)
      .join('\n')

    setOutput((prev) => `${prev}${chunk}\n`)
    setCommand('')
  }

  return (
    <>
      {!embedded && <div className="panel-header">Терминал</div>}
      <div className="terminal-output">
        {segments.map((seg, i) => (
          <span
            key={i}
            style={{
              color: seg.color,
              background: seg.background,
              fontWeight: seg.bold ? 700 : undefined,
              fontStyle: seg.italic ? 'italic' : undefined,
              textDecoration: seg.underline ? 'underline' : undefined
            }}
          >
            {seg.text}
          </span>
        ))}
      </div>
      <div className="terminal-input">
        <div className="terminal-input-wrap">
          <input
            ref={inputRef}
            value={command}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e as unknown as KeyboardEvent)}
            onBlur={() => setTimeout(() => setSuggestions([]), 150)}
            placeholder="npm test, git status  |  /команда для автодополнения"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
          />
          {suggestions.length > 0 && (
            <ul className="terminal-suggestions" role="listbox">
              {suggestions.map((s, i) => (
                <li
                  key={s}
                  role="option"
                  aria-selected={i === selectedIdx}
                  className={i === selectedIdx ? 'selected' : ''}
                  onMouseDown={() => applySuggestion(s)}
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="btn" onClick={run}>
          Run
        </button>
      </div>
    </>
  )
}
