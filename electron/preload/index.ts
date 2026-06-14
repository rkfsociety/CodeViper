import { contextBridge, ipcRenderer } from 'electron'
import type { AgentSettings, AgentStreamEvent, ChatMessage } from '../src/types'

const codeviper = {
  selectProjectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('select-project-folder'),

  listDirectory: (dirPath: string) => ipcRenderer.invoke('list-directory', dirPath),

  readFile: (projectPath: string, filePath: string) =>
    ipcRenderer.invoke('read-file', projectPath, filePath),

  writeFile: (projectPath: string, filePath: string, content: string) =>
    ipcRenderer.invoke('write-file', projectPath, filePath, content),

  listOllamaModels: (url?: string) => ipcRenderer.invoke('list-ollama-models', url),

  checkOllama: (url?: string) => ipcRenderer.invoke('check-ollama', url),

  runAgent: (settings: AgentSettings, messages: ChatMessage[], userMessage: string) =>
    ipcRenderer.invoke('run-agent', settings, messages, userMessage),

  onAgentStream: (callback: (event: AgentStreamEvent) => void) => {
    const handler = (_: unknown, event: AgentStreamEvent) => callback(event)
    ipcRenderer.on('agent-stream', handler)
    return () => ipcRenderer.removeListener('agent-stream', handler)
  },

  runTerminalCommand: (cwd: string, command: string) =>
    ipcRenderer.invoke('run-terminal-command', cwd, command)
}

contextBridge.exposeInMainWorld('codeviper', codeviper)
