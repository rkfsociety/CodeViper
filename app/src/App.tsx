import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentSettings, ChatMessage, ChatStore, OllamaModel } from './types'
import { ChatPanel } from './components/ChatPanel'
import { ChatHistoryPanel } from './components/ChatHistoryPanel'
import { TerminalPanel } from './components/TerminalPanel'
import { SettingsModal } from './components/SettingsModal'

const DEFAULT_SETTINGS: AgentSettings = {
  ollamaUrl: 'http://127.0.0.1:11434',
  model: '',
  projectPath: '',
  maxSteps: 12,
  selfLearning: true
}

function makeChatTitle(messages: ChatMessage[]): string | undefined {
  const firstUser = messages.find((message) => message.role === 'user')
  if (!firstUser?.content.trim()) return undefined
  const line = firstUser.content.trim().replace(/\s+/g, ' ')
  return line.length > 48 ? `${line.slice(0, 48)}…` : line
}

export default function App() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_SETTINGS)
  const [ollamaOnline, setOllamaOnline] = useState(false)
  const [models, setModels] = useState<OllamaModel[]>([])
  const [chatStore, setChatStore] = useState<ChatStore | null>(null)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatBusy, setChatBusy] = useState(false)
  const [memoryRefreshKey, setMemoryRefreshKey] = useState(0)
  const [skillsRefreshKey, setSkillsRefreshKey] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [settingsReady, setSettingsReady] = useState(false)
  const activeChatIdRef = useRef(activeChatId)
  const messagesRef = useRef(messages)

  activeChatIdRef.current = activeChatId
  messagesRef.current = messages

  const flushCurrentChat = useCallback(async () => {
    const chatId = activeChatIdRef.current
    const chatMessages = messagesRef.current
    if (!chatId) return

    const title = makeChatTitle(chatMessages)
    await window.codeviper.updateChat(chatId, {
      messages: chatMessages,
      ...(title ? { title } : {})
    })
  }, [])

  const refreshChatStore = useCallback(async () => {
    const store = await window.codeviper.getChatStore()
    setChatStore(store)
    return store
  }, [])

  async function refreshOllama() {
    const online = await window.codeviper.checkOllama(settings.ollamaUrl)
    setOllamaOnline(online)

    if (online) {
      const list = await window.codeviper.listOllamaModels(settings.ollamaUrl)
      setModels(list)
      const names = list.map((m) => m.name)
      setSettings((prev) => ({
        ...prev,
        model: prev.model && names.includes(prev.model) ? prev.model : names[0] ?? ''
      }))
    } else {
      setModels([])
    }
  }

  useEffect(() => {
    void window.codeviper.loadSettings().then((saved) => {
      setSettings(saved)
      setSettingsReady(true)
    })
  }, [])

  useEffect(() => {
    if (!settingsReady) return

    void refreshOllama()
    refreshChatStore().then((store) => {
      if (!store.activeChatId) return
      const chat = store.chats.find((item) => item.id === store.activeChatId)
      if (!chat) return
      setActiveChatId(chat.id)
      setMessages(chat.messages)
    })
  }, [settingsReady])

  useEffect(() => {
    if (!settingsReady) return

    const timer = window.setTimeout(() => {
      void window.codeviper.saveSettings(settings)
    }, 400)

    return () => window.clearTimeout(timer)
  }, [settings, settingsReady])

  useEffect(() => {
    if (!activeChatId) return

    const timer = window.setTimeout(async () => {
      await flushCurrentChat()
      setChatStore(await window.codeviper.getChatStore())
    }, 500)

    return () => window.clearTimeout(timer)
  }, [messages, activeChatId, flushCurrentChat])

  useEffect(() => {
    return () => {
      void flushCurrentChat()
    }
  }, [flushCurrentChat])

  async function openProject() {
    const folder = await window.codeviper.selectProjectFolder()
    if (!folder) return
    setSettings((prev) => ({ ...prev, projectPath: folder }))
  }

  async function selectChat(id: string) {
    if (chatBusy) return
    if (id === activeChatId) return

    await flushCurrentChat()

    const store = chatStore ?? (await refreshChatStore())
    const chat = store.chats.find((item) => item.id === id)
    if (!chat) return

    setActiveChatId(id)
    setMessages(chat.messages)
    await window.codeviper.setActiveChat(id)
    setChatStore(await window.codeviper.getChatStore())
  }

  async function createChat(folderId: string | null = null) {
    if (!settings.projectPath) return

    await flushCurrentChat()

    const chat = await window.codeviper.createChat(settings.projectPath, folderId)
    await refreshChatStore()
    setActiveChatId(chat.id)
    setMessages([])
  }

  async function createFolder() {
    const name = window.prompt('Название папки', 'Новая папка')
    if (!name?.trim()) return
    await window.codeviper.createChatFolder(name.trim())
    await refreshChatStore()
  }

  async function deleteChat(id: string) {
    if (chatBusy) return
    await window.codeviper.deleteChat(id)
    const store = await refreshChatStore()
    if (activeChatId === id) {
      const next = store.chats[0]
      setActiveChatId(next?.id ?? null)
      setMessages(next?.messages ?? [])
      await window.codeviper.setActiveChat(next?.id ?? null)
    }
  }

  async function renameChat(id: string, title: string) {
    await window.codeviper.updateChat(id, { title })
    await refreshChatStore()
  }

  async function renameFolder(id: string, name: string) {
    await window.codeviper.renameChatFolder(id, name)
    await refreshChatStore()
  }

  async function deleteFolder(id: string) {
    await window.codeviper.deleteChatFolder(id)
    await refreshChatStore()
  }

  async function moveChat(chatId: string, folderId: string | null) {
    await window.codeviper.moveChatToFolder(chatId, folderId)
    await refreshChatStore()
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
          <button
            className={`btn ${terminalOpen ? 'active' : ''}`}
            onClick={() => setTerminalOpen((open) => !open)}
            disabled={!settings.projectPath}
            title={settings.projectPath ? undefined : 'Сначала выберите проект'}
          >
            Терминал
          </button>
          <button className="btn" onClick={() => setSettingsOpen(true)}>
            Настройки
          </button>
          <button className="btn primary" onClick={openProject}>
            Открыть проект
          </button>
        </div>
      </header>

      <div className="layout">
        <section className="panel panel-history">
          <div className="panel-header">История чатов</div>
          <ChatHistoryPanel
            store={chatStore}
            projectPath={settings.projectPath}
            activeChatId={activeChatId}
            chatBusy={chatBusy}
            onSelectChat={selectChat}
            onCreateChat={createChat}
            onCreateFolder={createFolder}
            onDeleteChat={deleteChat}
            onRenameChat={renameChat}
            onRenameFolder={renameFolder}
            onDeleteFolder={deleteFolder}
            onMoveChat={moveChat}
          />
        </section>

        <section className="panel panel-main">
          <div className="panel-header">Агент</div>
          <ChatPanel
            settings={settings}
            projectPath={settings.projectPath}
            chatId={activeChatId}
            messages={messages}
            onMessagesChange={setMessages}
            onBusyChange={setChatBusy}
            onLearningSaved={() => {
              setMemoryRefreshKey((key) => key + 1)
              setSkillsRefreshKey((key) => key + 1)
            }}
          />

          {terminalOpen && (
            <div className="terminal-dock">
              <div className="terminal-dock-header">
                <span>Терминал</span>
                <button
                  type="button"
                  className="btn terminal-dock-close"
                  onClick={() => setTerminalOpen(false)}
                >
                  Скрыть
                </button>
              </div>
              {settings.projectPath ? (
                <TerminalPanel projectPath={settings.projectPath} embedded />
              ) : (
                <div className="hint">Терминал доступен после выбора проекта</div>
              )}
            </div>
          )}
        </section>
      </div>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        ollamaOnline={ollamaOnline}
        models={models}
        memoryRefreshKey={memoryRefreshKey}
        skillsRefreshKey={skillsRefreshKey}
        onClose={() => setSettingsOpen(false)}
        onSettingsChange={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
        onRefreshOllama={refreshOllama}
        onSelfLearningChange={(selfLearning) =>
          setSettings((prev) => ({ ...prev, selfLearning }))
        }
      />
    </div>
  )
}
