import { useMemo, useState } from 'react'
import { parseAnsi } from '../../shared/ansi'

interface Props {
  projectPath: string
  embedded?: boolean
}

export function TerminalPanel({ projectPath, embedded = false }: Props) {
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState<string>('CodeViper Terminal — команды выполняются в корне проекта.\n')

  const segments = useMemo(() => parseAnsi(output), [output])

  async function run() {
    if (!command.trim()) return
    setOutput((prev) => `${prev}\n> ${command}\n`)

    const result = await window.codeviper.runTerminalCommand(projectPath, command)
    const chunk = [
      result.stdout,
      result.stderr,
      `exit code: ${result.exitCode}`
    ]
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
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="npm test, git status, python main.py..."
        />
        <button className="btn" onClick={run}>
          Run
        </button>
      </div>
    </>
  )
}
