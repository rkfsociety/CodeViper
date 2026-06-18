import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { makeId } from '../../shared/makeId'
import { formatPrerequisitesMessage } from '../../shared/agentPrerequisites'
import { detectDanger } from '../../shared/dangerDetector'
import type { DangerWarning } from '../../shared/dangerDetector'
import type { AgentPrerequisiteIssue, AgentSettings, ChatMessage } from '../types'
import { AgentError } from '../../shared/agentError'
import { AGENT_RUN_TIMEOUT_MS, MAX_QUEUE_SIZE } from '../../shared/constants'

export interface PrerequisiteBlock {
  issues: AgentPrerequisiteIssue[]
  pendingRun: { userMessageId: string; text: string }
  installing: boolean
}

export interface DangerBlock {
  warning: DangerWarning
  pendingRun: { userMessageId: string; text: string }
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
  onDangerWarning: (block: DangerBlock) => void
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
  onPrerequisiteIssue,
  onDangerWarning
}: UseMessageQueueOptions) {
  const queueRef = useRef<Array<{ id: string; text: string }>>([])
  const agentRunningRef = useRef(false)
  const stoppingRef = useRef(false) // Task 40: guards stopAgent ↔ processNextQueuedRun race
  const onRunStartRef = useRef(onRunStart)
  const onPrerequisiteIssueRef = useRef(onPrerequisiteIssue)
  const onDangerWarningRef = useRef(onDangerWarning)
  const [queueSize, setQueueSize] = useState(0)
  const [agentRunning, setAgentRunning] = useState(false)

  // Держим рефы на свежих колбэках — без этого стейт-машина видит устаревшие замыкания.
  onRunStartRef.current = onRunStart
  onPrerequisiteIssueRef.current = onPrerequisiteIssue
  onDangerWarningRef.current = onDangerWarning

  const busy = agentRunning || queueSize > 0

  useEffect(() => {
    onBusyChange?.(busy)
  }, [busy, onBusyChange])

  function setRunning(value: boolean) {
    agentRunningRef.current = value
    setAgentRunning(value)
  }

  function syncBusyState(running: boolean, queued: number) {
    onBusyChange?.(running || queued > 0)
  }

  async function executeRun(userMessageId: string, text: string) {
    const project = projectPathRef.current
    const chat = chatIdRef.current
    const currentSettings = settingsRef.current
    if (!project || !chat) return

    setRunning(true)
    syncBusyState(true, queueRef.current.length)

    runIdRef.current += 1
    doneRunIdRef.current = -1
    onRunStartRef.current()

    const prereq = await window.codeviper.checkAgentPrerequisites(
      currentSettings.ollamaUrl,
      project,
      (currentSettings.modelProvider ?? 'ollama') !== 'ollama'
    )
    if (!prereq.ok) {
      setRunning(false)
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
      setRunning(false)
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

    // Task 42: one retry on transient network errors
    const isNetworkError = (err: unknown) =>
      err instanceof Error &&
      !(err instanceof AgentError) &&
      (err.message.includes('fetch failed') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('network'))

    for (let attempt = 0; attempt <= 1; attempt++) {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new AgentError('Агент не ответил — превышено время ожидания', 'timeout')),
          AGENT_RUN_TIMEOUT_MS
        )
      })

      try {
        await Promise.race([
          window.codeviper.runAgent(currentSettings, project, chat, history, text),
          timeoutPromise
        ])
        clearTimeout(timeoutHandle)
        // Brief window for the 'done' stream event to be processed
        await new Promise<void>((resolve) => setTimeout(resolve, 150))
        if (doneRunIdRef.current !== runIdRef.current) {
          void processNextQueuedRunRef.current()
        }
        return
      } catch (error) {
        clearTimeout(timeoutHandle)
        if (attempt === 0 && isNetworkError(error)) {
          appendMessage({
            id: makeId(),
            role: 'system',
            content: 'Сбой сети, повторяю через 2 с…',
            timestamp: Date.now()
          })
          await new Promise<void>((r) => setTimeout(r, 2000))
          continue
        }
        appendMessage({
          id: makeId(),
          role: 'system',
          content: error instanceof Error ? error.message : String(error),
          timestamp: Date.now()
        })
        void processNextQueuedRunRef.current()
        return
      }
    }
  }

  async function processNextQueuedRun() {
    setRunning(false)

    // Task 40: stopAgent is in progress — don't start next run
    if (stoppingRef.current) return

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
    if (!chatIdRef.current || !projectPathRef.current) return
    const danger = detectDanger(text)
    if (danger) {
      onDangerWarningRef.current({ warning: danger, pendingRun: { userMessageId, text } })
      return
    }
    if (agentRunningRef.current) {
      if (queueRef.current.length >= MAX_QUEUE_SIZE) {
        appendMessage({
          id: makeId(),
          role: 'system',
          content: `Очередь переполнена (максимум ${MAX_QUEUE_SIZE} сообщений). Дождитесь завершения текущих задач.`,
          timestamp: Date.now()
        })
        return
      }
      queueRef.current.push({ id: userMessageId, text })
      setQueueSize(queueRef.current.length)
      syncBusyState(true, queueRef.current.length)
      return
    }
    await executeRun(userMessageId, text)
  }

  async function confirmDangerRun(userMessageId: string, text: string) {
    if (!chatIdRef.current || !projectPathRef.current) return
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
      stoppingRef.current = true // Task 40: block processNextQueuedRun during stop
      try {
        await window.codeviper.stopAgent()
        // If done event doesn't arrive after stop, force queue continuation
        await new Promise<void>((resolve) => setTimeout(resolve, 250))
        if (agentRunningRef.current) {
          stoppingRef.current = false
          void processNextQueuedRunRef.current()
        }
      } finally {
        stoppingRef.current = false
      }
    } else {
      setRunning(false)
      syncBusyState(false, 0)
    }
  }

  function resetQueue() {
    queueRef.current = []
    setQueueSize(0)
    setRunning(false)
    // Task 41: mark the current run as stale so stream events from it are ignored
    runIdRef.current += 1
    doneRunIdRef.current = runIdRef.current
  }

  function getQueueSnapshot(): Array<{ id: string; text: string }> {
    return [...queueRef.current]
  }

  return {
    submitMessage,
    confirmDangerRun,
    stopAgent,
    executeRun,
    resetQueue,
    getQueueSnapshot,
    queueSize,
    agentRunning,
    agentRunningRef,
    busy
  }
}
