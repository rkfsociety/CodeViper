import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import { makeId } from '../../shared/makeId'
import { compactToolChatLine } from '../../shared/toolDisplay'
import { sanitizeAssistantContent, visibleAssistantContent } from '../../shared/toolCalls'
import type { AgentContextPreview, ChatMessage, TodoItem } from '../types'
import type { GenerationMetrics } from '../../shared/generationMetrics'
import type { AgentAction } from '../contexts/AgentContext'
import {
  formatAgentDoneNotificationBody,
  playAgentDoneSound,
  shouldShowAgentDoneToast
} from '../../shared/agentNotifications'

export type { RunStats } from '../../shared/generationMetrics'

export interface UseAgentStreamOptions {
  chatIdRef: MutableRefObject<string | null>
  runIdRef: MutableRefObject<number>
  doneRunIdRef: MutableRefObject<number>
  onLearningSavedRef: MutableRefObject<(() => void) | undefined>
  onActiveModelChangeRef: MutableRefObject<((model: string) => void) | undefined>
  onOllamaFallbackOfferRef?: MutableRefObject<((ollamaUrl: string) => void) | undefined>
  onTraceReportRef?: MutableRefObject<
    ((issueUrl: string, auto: boolean, title?: string) => void) | undefined
  >
  processNextQueuedRunRef: MutableRefObject<() => Promise<void>>
  appendMessage: (message: ChatMessage) => void
  upsertMessage: (message: ChatMessage) => void
  setContextPreview: (preview: AgentContextPreview | null) => void
  notificationsEnabledRef?: MutableRefObject<boolean>
  isVisibleChatRef?: MutableRefObject<boolean>
  chatTitleRef?: MutableRefObject<string>
  setTodoItemsRef?: MutableRefObject<
    ((items: TodoItem[] | null, title?: string) => void) | undefined
  >
  dispatch: Dispatch<AgentAction>
}

export function useAgentStream({
  chatIdRef,
  runIdRef,
  doneRunIdRef,
  onLearningSavedRef,
  onActiveModelChangeRef,
  onOllamaFallbackOfferRef,
  onTraceReportRef,
  processNextQueuedRunRef,
  appendMessage,
  upsertMessage,
  setContextPreview,
  notificationsEnabledRef,
  isVisibleChatRef,
  chatTitleRef,
  setTodoItemsRef,
  dispatch
}: UseAgentStreamOptions) {
  const [draft, setDraft] = useState('')
  const [draftThinking, setDraftThinking] = useState('')
  const draftRef = useRef('')

  const lastAssistantContentRef = useRef('')
  const activeToolMessageIdRef = useRef<string | null>(null)
  const activeToolNameRef = useRef<string | undefined>(undefined)
  const genStartRef = useRef<number | null>(null)
  const draftThinkingRef = useRef('')
  const runStartRef = useRef<number | null>(null)
  const cumulativeTokensRef = useRef(0)
  const runActiveRef = useRef(false)
  const draftMessageIdRef = useRef<string | null>(null)

  // Батчинг: upsertMessage вызывается не на каждый токен, а раз в 80 мс
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasPendingFlushRef = useRef(false)

  // Стабильные рефы на колбэки
  const appendMessageRef = useRef(appendMessage)
  const upsertMessageRef = useRef(upsertMessage)
  const setContextPreviewRef = useRef(setContextPreview)
  const dispatchRef = useRef(dispatch)
  appendMessageRef.current = appendMessage
  upsertMessageRef.current = upsertMessage
  setContextPreviewRef.current = setContextPreview
  dispatchRef.current = dispatch

  // Сбрасывает накопленные токены в messages немедленно (до таймера)
  const flushPending = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current)
      flushTimerRef.current = null
    }
    if (!hasPendingFlushRef.current) return
    hasPendingFlushRef.current = false
    const id = draftMessageIdRef.current
    if (!id) return
    upsertMessageRef.current({
      id,
      role: 'assistant',
      content: visibleAssistantContent(draftRef.current, true),
      thinking: draftThinkingRef.current || undefined,
      timestamp: Date.now()
    })
  }, [])

  const resetStreamState = useCallback(() => {
    flushPending()
    setDraft('')
    setDraftThinking('')
    draftRef.current = ''
    draftThinkingRef.current = ''
    dispatchRef.current({ type: 'RESET' })
    activeToolMessageIdRef.current = null
    activeToolNameRef.current = undefined
    lastAssistantContentRef.current = ''
    genStartRef.current = null
    runStartRef.current = Date.now()
    cumulativeTokensRef.current = 0
    runActiveRef.current = true
    draftMessageIdRef.current = null
  }, [flushPending])

  // Тикает каждую секунду пока агент работает — обновляет elapsed в runStats.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!runActiveRef.current || runStartRef.current === null) return
      const elapsed = Math.floor((Date.now() - runStartRef.current) / 1000)
      dispatchRef.current({
        type: 'SET_STATS',
        stats: { elapsedSec: elapsed, tokens: cumulativeTokensRef.current }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const unsubscribe = window.codeviper.onAgentStream((event) => {
      if (event.chatId !== chatIdRef.current) return

      if (event.type === 'thinking') {
        if (genStartRef.current === null) {
          // Начало новой LLM-генерации — сбрасываем метрики предыдущего вызова и оркестрацию
          dispatchRef.current({ type: 'SET_METRICS', metrics: null })
          dispatchRef.current({ type: 'SET_ORCHESTRATING', active: false })
          genStartRef.current = Date.now()
        }
        dispatchRef.current({ type: 'SET_PHASE', phase: 'thinking' })
        const thinking = event.content ?? ''
        const newThinking = draftThinkingRef.current + thinking
        draftThinkingRef.current = newThinking
        setDraftThinking(newThinking)

        if (!draftMessageIdRef.current) draftMessageIdRef.current = makeId()

        hasPendingFlushRef.current = true
        if (!flushTimerRef.current) {
          flushTimerRef.current = setTimeout(flushPending, 150)
        }
      }

      if (event.type === 'token') {
        if (genStartRef.current === null) {
          dispatchRef.current({ type: 'SET_METRICS', metrics: null })
          dispatchRef.current({ type: 'SET_ORCHESTRATING', active: false })
          genStartRef.current = Date.now()
        }
        dispatchRef.current({ type: 'SET_PHASE', phase: 'writing' })

        const token = event.content ?? ''
        const newContent = draftRef.current + token
        draftRef.current = newContent
        setDraft(newContent)

        if (!draftMessageIdRef.current) draftMessageIdRef.current = makeId()

        hasPendingFlushRef.current = true
        if (!flushTimerRef.current) {
          flushTimerRef.current = setTimeout(flushPending, 150)
        }
      }

      if (event.type === 'clear_draft') {
        flushPending()
        setDraft('')
        setDraftThinking('')
        draftRef.current = ''
        draftThinkingRef.current = ''
        genStartRef.current = null
        draftMessageIdRef.current = null
      }

      if (event.type === 'assistant') {
        flushPending()
        const durationMs =
          genStartRef.current != null ? Date.now() - genStartRef.current : undefined
        genStartRef.current = null

        const id = draftMessageIdRef.current
        if (id) {
          const raw = event.content ?? draftRef.current
          const finalContent = sanitizeAssistantContent(raw)
          const thinking = event.thinking?.trim() || draftThinkingRef.current || undefined
          upsertMessageRef.current({
            id,
            role: 'assistant',
            content: finalContent,
            thinking,
            timestamp: Date.now(),
            durationMs
          })
          draftMessageIdRef.current = null
        } else {
          const cleaned = sanitizeAssistantContent(event.content ?? '')
          if (cleaned) {
            appendMessageRef.current({
              id: makeId(),
              role: 'assistant',
              content: cleaned,
              thinking: event.thinking?.trim(),
              timestamp: Date.now(),
              durationMs
            })
          }
        }

        setDraft('')
        setDraftThinking('')
        draftRef.current = ''
        draftThinkingRef.current = ''
      }

      if (event.type === 'tool_start') {
        dispatchRef.current({ type: 'SET_ORCHESTRATING', active: false })
        flushPending()
        genStartRef.current = null
        setDraft('')
        setDraftThinking('')
        draftRef.current = ''
        draftThinkingRef.current = ''
        draftMessageIdRef.current = null
        dispatchRef.current({ type: 'SET_PHASE', phase: 'tool', toolName: event.toolName })
        activeToolNameRef.current = event.toolName
        const id = makeId()
        activeToolMessageIdRef.current = id
        upsertMessageRef.current({
          id,
          role: 'tool',
          content: compactToolChatLine(event.toolName, undefined, 'start', event.toolInput),
          toolName: event.toolName,
          timestamp: Date.now()
        })
      }

      if (event.type === 'tool_end') {
        dispatchRef.current({ type: 'SET_PHASE', phase: 'thinking' })
        dispatchRef.current({ type: 'SET_INDEX_PROGRESS', value: null })
        activeToolNameRef.current = undefined
        const id = activeToolMessageIdRef.current ?? makeId()
        activeToolMessageIdRef.current = null
        upsertMessageRef.current({
          id,
          role: 'tool',
          content: compactToolChatLine(event.toolName, event.toolOutput, 'end', event.toolInput),
          toolName: event.toolName,
          toolOutput: event.toolOutput,
          timestamp: Date.now()
        })
      }

      if (event.type === 'error') {
        runActiveRef.current = false
        appendMessageRef.current({
          id: makeId(),
          role: 'system',
          content: event.content ?? '',
          timestamp: Date.now()
        })
        const runId = runIdRef.current
        if (doneRunIdRef.current !== runId) {
          doneRunIdRef.current = runId
          void processNextQueuedRunRef.current()
        }
      }

      if (event.type === 'learning_saved') {
        appendMessageRef.current({
          id: makeId(),
          role: 'system',
          content: `🧠 Запомнено: ${event.content ?? ''}`,
          timestamp: Date.now()
        })
        onLearningSavedRef.current?.()
      }

      if (event.type === 'collective_sync') {
        const status = event.collectiveSyncStatus ?? 'idle'
        dispatchRef.current({
          type: 'SET_COLLECTIVE_SYNC',
          status,
          branch: event.collectiveSyncBranch,
          pending: event.collectiveSyncCount,
          message: event.content
        })
        if (status === 'syncing') {
          appendMessageRef.current({
            id: makeId(),
            role: 'system',
            content: `☁️ Отправляю ${event.collectiveSyncCount ?? 1} знаний на GitHub (${event.collectiveSyncBranch ?? 'agent/self-improve'})…`,
            timestamp: Date.now()
          })
        } else if (status === 'done') {
          appendMessageRef.current({
            id: makeId(),
            role: 'system',
            content: `☁️ Коллективная память на GitHub: ${event.content ?? 'готово'}`,
            timestamp: Date.now()
          })
        } else if (status === 'error') {
          appendMessageRef.current({
            id: makeId(),
            role: 'system',
            content: `⚠️ Синхронизация памяти: ${event.content ?? 'ошибка'}`,
            timestamp: Date.now()
          })
        }
      }

      if (event.type === 'skill_saved') {
        appendMessageRef.current({
          id: makeId(),
          role: 'system',
          content: `🛠️ Навык сохранён: ${event.content ?? ''}${event.skillId ? ` (${event.skillId})` : ''}`,
          timestamp: Date.now()
        })
        onLearningSavedRef.current?.()
      }

      if (event.type === 'todo_update') {
        setTodoItemsRef?.current?.(event.todoItems ?? null, event.content)
      }

      if (event.type === 'model_selected') {
        const model = event.selectedModel ?? ''
        if (model) {
          dispatchRef.current({ type: 'SET_MODEL', model })
          onActiveModelChangeRef.current?.(model)
        }
        appendMessageRef.current({
          id: makeId(),
          role: 'system',
          content: event.content ?? `🤖 Модель: ${model}`,
          timestamp: Date.now()
        })
      }

      if (event.type === 'orchestrating') {
        dispatchRef.current({
          type: 'SET_ORCHESTRATING',
          active: event.orchestrating !== false,
          plan: event.content ?? null
        })
      }

      if (event.type === 'plan_awaiting_confirm' && event.planConfirmId && event.content) {
        dispatchRef.current({
          type: 'SET_PLAN_AWAITING_CONFIRM',
          pending: { id: event.planConfirmId, plan: event.content }
        })
      }

      if (event.type === 'clarify_awaiting_answer' && event.clarifyId && event.content) {
        dispatchRef.current({
          type: 'SET_CLARIFY_AWAITING_ANSWER',
          pending: { id: event.clarifyId, question: event.content }
        })
      }

      if (event.type === 'exploring') {
        dispatchRef.current({ type: 'SET_EXPLORING', active: event.exploring !== false })
      }

      if (event.type === 'editing') {
        dispatchRef.current({ type: 'SET_EDITING', active: event.editing !== false })
      }

      if (event.type === 'generation_metrics' && event.generationMetrics) {
        const m = event.generationMetrics as GenerationMetrics
        dispatchRef.current({ type: 'SET_METRICS', metrics: m })
        if (m.sessionTokens != null) {
          cumulativeTokensRef.current = m.sessionTokens
        } else {
          cumulativeTokensRef.current += m.evalCount
        }
      }

      if (event.type === 'context') {
        if (typeof event.summarizing === 'boolean') {
          dispatchRef.current({ type: 'SET_SUMMARIZING', value: event.summarizing })
        }
        if (event.contextPreview) {
          setContextPreviewRef.current(event.contextPreview)
        } else if (event.content) {
          appendMessageRef.current({
            id: makeId(),
            role: 'system',
            content: event.content,
            timestamp: Date.now()
          })
        }
      }

      if (event.type === 'preview') {
        flushPending()
        appendMessageRef.current({
          id: makeId(),
          role: 'system',
          content: `📋 Предпросмотр правок: ${event.previewPath ?? ''}`,
          previewId: event.previewId,
          previewPath: event.previewPath,
          previewDiff: event.previewDiff,
          previewStatus: 'pending',
          timestamp: Date.now()
        })
      }

      if (event.type === 'index_progress') {
        dispatchRef.current({
          type: 'SET_INDEX_PROGRESS',
          value: event.indexPercent ?? null
        })
      }

      if (event.type === 'circuit_breaker') {
        dispatchRef.current({
          type: 'SET_CIRCUIT_BREAKER',
          state: event.circuitBreakerState ?? null,
          openUntilMs: event.circuitBreakerOpenUntilMs
        })
      }

      if (event.type === 'ollama_fallback_offer' && event.ollamaFallbackUrl) {
        onOllamaFallbackOfferRef?.current?.(event.ollamaFallbackUrl)
      }

      if (event.type === 'trace_report' && event.traceReportIssueUrl) {
        onTraceReportRef?.current?.(
          event.traceReportIssueUrl,
          event.traceReportAuto === true,
          event.traceReportTitle
        )
      }

      if (event.type === 'retry_429') {
        const value =
          event.retryWaitMs != null && event.retryAttempt != null
            ? {
                waitMs: event.retryWaitMs,
                attempt: event.retryAttempt,
                untilMs: Date.now() + event.retryWaitMs
              }
            : null
        dispatchRef.current({ type: 'SET_RETRY_429', value })
        if (event.retryWaitMs != null) {
          setTimeout(
            () => dispatchRef.current({ type: 'SET_RETRY_429', value: null }),
            event.retryWaitMs + 200
          )
        }
      }

      if (event.type === 'done') {
        flushPending()
        const runId = runIdRef.current
        if (doneRunIdRef.current === runId) return
        doneRunIdRef.current = runId
        if (activeToolMessageIdRef.current) {
          const name = activeToolNameRef.current ?? ''
          upsertMessageRef.current({
            id: activeToolMessageIdRef.current,
            role: 'tool',
            content: compactToolChatLine(name, '⚠️ Прервано', 'end'),
            toolName: name,
            timestamp: Date.now()
          })
          activeToolMessageIdRef.current = null
          activeToolNameRef.current = undefined
        }
        setDraft('')
        setDraftThinking('')
        draftRef.current = ''
        draftThinkingRef.current = ''
        draftMessageIdRef.current = null
        dispatchRef.current({ type: 'SET_PHASE', phase: 'idle' })
        dispatchRef.current({ type: 'SET_SUMMARIZING', value: false })
        dispatchRef.current({ type: 'SET_ORCHESTRATING', active: false })
        dispatchRef.current({ type: 'SET_PLAN_AWAITING_CONFIRM', pending: null })
        dispatchRef.current({ type: 'SET_CLARIFY_AWAITING_ANSWER', pending: null })
        dispatchRef.current({ type: 'SET_RETRY_429', value: null })
        dispatchRef.current({ type: 'SET_INDEX_PROGRESS', value: null })
        genStartRef.current = null
        runActiveRef.current = false

        if (notificationsEnabledRef?.current) {
          playAgentDoneSound()
          const isBackground = isVisibleChatRef?.current === false
          const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
          if (shouldShowAgentDoneToast(isBackground, hidden)) {
            const body = formatAgentDoneNotificationBody(chatTitleRef?.current ?? '')
            void window.codeviper.showAgentDoneNotification({
              title: 'CodeViper',
              body
            })
          }
        }

        void processNextQueuedRunRef.current()
      }
    })

    return unsubscribe
  }, [flushPending]) // eslint-disable-line react-hooks/exhaustive-deps -- остальные зависимости через стабильные рефы

  return {
    draft,
    draftThinking,
    draftRef,
    draftMessageIdRef,
    resetStreamState
  }
}
