import { createContext, useContext, useReducer, type Dispatch } from 'react'
import type { ReactNode } from 'react'
import type { AgentPhase } from '../components/AgentStatusBar'
import type { GenerationMetrics, RunStats } from '../../shared/generationMetrics'

export interface AgentState {
  agentPhase: AgentPhase
  activeToolName: string | undefined
  summarizing: boolean
  generationMetrics: GenerationMetrics | null
  runModel: string
  runStats: RunStats | null
  orchestrating: boolean
  orchestratingPlan: string | null
  retry429: { waitMs: number; attempt: number } | null
}

export type AgentAction =
  | { type: 'SET_PHASE'; phase: AgentPhase; toolName?: string }
  | { type: 'SET_SUMMARIZING'; value: boolean }
  | { type: 'SET_METRICS'; metrics: GenerationMetrics | null }
  | { type: 'SET_MODEL'; model: string }
  | { type: 'SET_STATS'; stats: RunStats | null }
  | { type: 'SET_ORCHESTRATING'; active: boolean; plan?: string | null }
  | { type: 'SET_RETRY_429'; value: { waitMs: number; attempt: number } | null }
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
  retry429: null
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
    case 'SET_RETRY_429':
      return { ...state, retry429: action.value }
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
