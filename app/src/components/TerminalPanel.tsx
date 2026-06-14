import { useState } from 'react'

interface Props {
  projectPath: string
}

export function TerminalPanel({ projectPath }: Props) {
  const [command, setCommand] = useState('')
  const [output, setOutput] = useState<string>('CodeViper Terminal — команды выполняются в корне проекта.\n')

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
      <div className="panel-header">Терминал</div>
      <div className="terminal-output">{output}</div>
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
