import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { makeId } from '../../shared/makeId'
import { formatPrerequisitesMessage } from '../../shared/agentPrerequisites'
import type { AgentPrerequisiteIssue, AgentSettings, ChatMessage } from '../types'

export interface PrerequisiteBlock {
  issues: AgentPrerequisiteIssue[]
  pendingRun: { userMessageId: string; text: string }
  installing: boolean
}

export interface UseMessageQueueOptions {
  chatIdRef: MutableRefObject<string | null>
  projectPathRef: MutableRefObject<string>
  settingsRef: MutableRefObject<AgentSettings>
  messagesRef: MutableRefObject<ChatMessage[]>
  runIdRef: MutableRefObject<number>
  doneRunIdRef: MutableRefObject<number>
  processNextQueuedRunRef: MutableRefObject<() => Promise<void>>
  appendMessage: (message: ChatMessage) => void
  onRunStart: () => void
  onBusyChange?: (busy: boolean) => void
  onPrerequisiteIssue: (block: PrerequisiteBlock) => void
}

export function useMessageQueue({
  chatIdRef,
  projectPathRef,
  settingsRef,
  messagesRef,
  runIdRef,
  doneRunIdRef,
  processNextQueuedRunRef,
  appendMessage,
  onRunStart,
  onBusyChange,
  onPrerequisiteIssue
}: UseMessageQueueOptions) {
  const queueRef = useRef<Array<{ id: string; text: string }>>([])
  const agentRunningRef = useRef(false)
  const onRunStartRef = useRef(onRunStart)
  const onPrerequisiteIssueRef = useRef(onPrerequisiteIssue)
  const [queueSize, setQueueSize] = useState(0)
  const [agentRunning, setAgentRunning] = useState(false)

  // Держим рефы на свежих колбэках — без этого стейт-машина видит устаревшие замыкания.
  onRunStartRef.current = onRunStart
  onPrerequisiteIssueRef.current = onPrerequisiteIssue

  const busy = agentRunning || queueSize > 0

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  function syncBusyState(running: boolean, queued: number) {
    onBusyChange?.(running || queued > 0)
  }

  async function executeRun(userMessageId: string, text: string) {
    const project = projectPathRef.current
    const chat = chatIdRef.current
    const currentSettings = settingsRef.current
    if (!project || !chat) return

    agentRunningRef.current = true
    setAgentRunning(true)
    syncBusyState(true, queueRef.current.length)

    runIdRef.current += 1
    doneRunIdRef.current = -1
    onRunStartRef.current()

    const prereq = await window.codeviper.checkAgentPrerequisites(
      currentSettings.ollamaUrl,
      project
    )
    if (!prereq.ok) {
      agentRunningRef.current = false
      setAgentRunning(false)
      syncBusyState(false, queueRef.current.length)
      onPrerequisiteIssueRef.current({
        issues: prereq.issues,
        pendingRun: { userMessageId, text },
        installing: false
      })
      appendMessage({
        id: makeId(),
        role: 'system',
        content: formatPrerequisitesMessage(prereq.issues),
        timestamp: Date.now()
      })
      return
    }

    if (!currentSettings.model.trim()) {
      agentRunningRef.current = false
      setAgentRunning(false)
      syncBusyState(false, queueRef.current.length)
      appendMessage({
        id: makeId(),
        role: 'system',
        content: 'Модель не выбрана. Скачайте модель в настройках.',
        timestamp: Date.now()
      })
      return
    }

    const idx = messagesRef.current.findIndex((item) => item.id === userMessageId)
    const history = idx >= 0 ? messagesRef.current.slice(0, idx) : messagesRef.current

    try {
      await window.codeviper.runAgent(currentSettings, project, chat, history, text)
    } catch (error) {
      agentRunningRef.current = false
      setAgentRunning(false)
      syncBusyState(false, queueRef.current.length)
      onRunStartRef.current()
      appendMessage({
        id: makeId(),
        role: 'system',
        content: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      })
    }
  }

  async function processNextQueuedRun() {
    agentRunningRef.current = false
    setAgentRunning(false)

    const next = queueRef.current.shift()
    setQueueSize(queueRef.current.length)

    if (!next) {
      syncBusyState(false, 0)
      return
    }

    await executeRun(next.id, next.text)
  }

  processNextQueuedRunRef.current = processNextQueuedRun

  async function submitMessage(userMessageId: string, text: string) {
    if (agentRunningRef.current) {
      queueRef.current.push({ id: userMessageId, text })
      setQueueSize(queueRef.current.length)
      syncBusyState(true, queueRef.current.length)
      return
    }
    await executeRun(userMessageId, text)
  }

  async function stopAgent() {
    if (!agentRunningRef.current && queueRef.current.length === 0) return
    queueRef.current = []
    setQueueSize(0)
    syncBusyState(agentRunningRef.current, 0)
    if (agentRunningRef.current) {
      await window.codeviper.stopAgent()
    } else {
      agentRunningRef.current = false
      setAgentRunning(false)
      syncBusyState(false, 0)
    }
  }

  function resetQueue() {
    queueRef.current = []
    setQueueSize(0)
    agentRunningRef.current = false
    setAgentRunning(false)
  }

  return {
    submitMessage,
    stopAgent,
    executeRun,
    resetQueue,
    queueSize,
    agentRunning,
    agentRunningRef,
    busy
  }
}
