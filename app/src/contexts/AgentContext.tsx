import { createContext, useContext, useReducer, type Dispatch } from 'react'
import type { ReactNode } from 'react'
import type { AgentPhase } from '../components/AgentStatusBar'
import type { GenerationMetrics, RunStats } from '../../shared/generationMetrics'
import type { CircuitBreakerState } from '../types'

export interface AgentState {
  agentPhase: AgentPhase
  activeToolName: string | undefined
  summarizing: boolean
  generationMetrics: GenerationMetrics | null
  runModel: string
  runStats: RunStats | null
  orchestrating: boolean
  orchestratingPlan: string | null
  planAwaitingConfirm: { id: string; plan: string } | null
  exploring: boolean
  editing: boolean
  retry429: { waitMs: number; attempt: number } | null
  circuitBreakerState: CircuitBreakerState | null
  circuitBreakerOpenUntilMs: number | null
  collectiveSyncStatus: 'idle' | 'queued' | 'syncing' | 'done' | 'error'
  collectiveSyncBranch: string
  collectiveSyncPending: number
  collectiveSyncMessage: string
}

export type AgentAction =
  | { type: 'SET_PHASE'; phase: AgentPhase; toolName?: string }
  | { type: 'SET_SUMMARIZING'; value: boolean }
  | { type: 'SET_METRICS'; metrics: GenerationMetrics | null }
  | { type: 'SET_MODEL'; model: string }
  | { type: 'SET_STATS'; stats: RunStats | null }
  | { type: 'SET_ORCHESTRATING'; active: boolean; plan?: string | null }
  | { type: 'SET_PLAN_AWAITING_CONFIRM'; pending: { id: string; plan: string } | null }
  | { type: 'SET_EXPLORING'; active: boolean }
  | { type: 'SET_EDITING'; active: boolean }
  | { type: 'SET_RETRY_429'; value: { waitMs: number; attempt: number } | null }
  | {
      type: 'SET_CIRCUIT_BREAKER'
      state: CircuitBreakerState | null
      openUntilMs?: number | null
    }
  | {
      type: 'SET_COLLECTIVE_SYNC'
      status: AgentState['collectiveSyncStatus']
      branch?: string
      pending?: number
      message?: string
    }
  | { type: 'RESET' }

const initialState: AgentState = {
  agentPhase: 'thinking',
  activeToolName: undefined,
  summarizing: false,
  generationMetrics: null,
  runModel: '',
  runStats: null,
  orchestrating: false,
  orchestratingPlan: null,
  planAwaitingConfirm: null,
  exploring: false,
  editing: false,
  retry429: null,
  circuitBreakerState: null,
  circuitBreakerOpenUntilMs: null,
  collectiveSyncStatus: 'idle',
  collectiveSyncBranch: 'agent/self-improve',
  collectiveSyncPending: 0,
  collectiveSyncMessage: ''
}

function agentReducer(state: AgentState, action: AgentAction): AgentState {
  switch (action.type) {
    case 'SET_PHASE':
      return {
        ...state,
        agentPhase: action.phase,
        activeToolName: action.phase === 'tool' ? action.toolName : undefined
      }
    case 'SET_SUMMARIZING':
      return { ...state, summarizing: action.value }
    case 'SET_METRICS':
      return { ...state, generationMetrics: action.metrics }
    case 'SET_MODEL':
      return { ...state, runModel: action.model }
    case 'SET_STATS':
      return { ...state, runStats: action.stats }
    case 'SET_ORCHESTRATING':
      return {
        ...state,
        orchestrating: action.active,
        orchestratingPlan: action.active ? (action.plan ?? state.orchestratingPlan) : null
      }
    case 'SET_PLAN_AWAITING_CONFIRM':
      return { ...state, planAwaitingConfirm: action.pending }
    case 'SET_EXPLORING':
      return { ...state, exploring: action.active }
    case 'SET_EDITING':
      return { ...state, editing: action.active }
    case 'SET_RETRY_429':
      return { ...state, retry429: action.value }
    case 'SET_CIRCUIT_BREAKER':
      return {
        ...state,
        circuitBreakerState: action.state,
        circuitBreakerOpenUntilMs: action.openUntilMs ?? null
      }
    case 'SET_COLLECTIVE_SYNC':
      return {
        ...state,
        collectiveSyncStatus: action.status,
        collectiveSyncBranch: action.branch ?? state.collectiveSyncBranch,
        collectiveSyncPending:
          action.pending != null ? action.pending : state.collectiveSyncPending,
        collectiveSyncMessage: action.message ?? state.collectiveSyncMessage
      }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

const AgentStateContext = createContext<AgentState>(initialState)
const AgentDispatchContext = createContext<Dispatch<AgentAction>>(() => {})

export function AgentProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(agentReducer, initialState)
  return (
    <AgentStateContext.Provider value={state}>
      <AgentDispatchContext.Provider value={dispatch}>{children}</AgentDispatchContext.Provider>
    </AgentStateContext.Provider>
  )
}

export function useAgentState(): AgentState {
  return useContext(AgentStateContext)
}

export function useAgentDispatch(): Dispatch<AgentAction> {
  return useContext(AgentDispatchContext)
}
