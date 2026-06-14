import { useEffect, useState } from 'react'
import type { AgentSettings, ChatMessage } from './types'
import { FileTree } from './components/FileTree'
import { ChatPanel } from './components/ChatPanel'
import { TerminalPanel } from './components/TerminalPanel'

const DEFAULT_SETTINGS: AgentSettings = {
  ollamaUrl: 'http://127.0.0.1:11434',
  model: '',
  projectPath: '',
  maxSteps: 12
}

export default function App() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS)
  const [ollamaOnline, setOllamaOnline] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState<string>()
  const [filePreview, setFilePreview] = useState('')
  const [, setMessages] = useState<ChatMessage[]>([])

  async function refreshOllama() {
    const online = await window.codeviper.checkOllama(settings.ollamaUrl)
    setOllamaOnline(online)

    if (online) {
      const list = await window.codeviper.listOllamaModels(settings.ollamaUrl)
      const names = list.map((m) => m.name)
      setModels(names)
      setSettings((prev) => ({
        ...prev,
        model: prev.model && names.includes(prev.model) ? prev.model : names[0] ?? ''
      }))
    } else {
      setModels([])
    }
  }

  useEffect(() => {
    refreshOllama()
  }, [])

  async function openProject() {
    const folder = await window.codeviper.selectProjectFolder()
    if (!folder) return
    setSettings((prev) => ({ ...prev, projectPath: folder }))
    setSelectedFile(undefined)
    setFilePreview('')
  }

  async function handleFileSelect(path: string) {
    setSelectedFile(path)
    if (!settings.projectPath) return

    try {
      const content = await window.codeviper.readFile(settings.projectPath, path)
      setFilePreview(content.slice(0, 4000))
    } catch (error) {
      setFilePreview(error instanceof Error ? error.message : 'Не удалось прочитать файл')
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <span>🐍 CodeViper</span>
        </div>
        <div
          className={`status-dot ${ollamaOnline ? 'online' : 'offline'}`}
          title={ollamaOnline ? 'Ollama online' : 'Ollama offline'}
        />
        <div className="topbar-path">
          {settings.projectPath || 'Проект не выбран — нажми «Открыть проект»'}
        </div>
        <div className="topbar-actions">
          <button className="btn" onClick={refreshOllama}>
            Обновить Ollama
          </button>
          <button className="btn primary" onClick={openProject}>
            Открыть проект
          </button>
        </div>
      </header>

      <div className="layout">
        <section className="panel">
          <div className="panel-header">Файлы</div>
          {settings.projectPath ? (
            <FileTree
              root={settings.projectPath}
              onSelect={handleFileSelect}
              selected={selectedFile}
            />
          ) : (
            <div className="file-tree empty">Сначала открой папку проекта</div>
          )}
          {filePreview && (
            <div className="hint">
              <strong>Превью:</strong>
              <pre>{filePreview}</pre>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">Агент</div>
          <ChatPanel
            settings={settings}
            projectPath={settings.projectPath}
            onMessagesChange={setMessages}
          />
        </section>

        <section className="panel">
          <div className="panel-header">Настройки</div>
          <div className="settings">
            <label>
              Ollama URL
              <input
                value={settings.ollamaUrl}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, ollamaUrl: e.target.value }))
                }
              />
            </label>

            <label>
              Модель
              <select
                value={settings.model}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, model: e.target.value }))
                }
              >
                {!models.length && <option value="">Ollama не найдена</option>}
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Макс. шагов агента
              <input
                type="number"
                min={3}
                max={30}
                value={settings.maxSteps}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    maxSteps: Number(e.target.value) || 12
                  }))
                }
              />
            </label>
          </div>

          {!ollamaOnline && (
            <div className="hint">
              Установи Ollama с <strong>ollama.com</strong>, затем:
              <pre>ollama pull qwen2.5-coder:7b</pre>
            </div>
          )}

          {settings.projectPath ? (
            <TerminalPanel projectPath={settings.projectPath} />
          ) : (
            <div className="hint">Терминал доступен после выбора проекта</div>
          )}
        </section>
      </div>
    </div>
  )
}
