export type StepStatus = 'pending' | 'in_progress' | 'completed'

export type AgentRow = {
  /** 'main' for the main loop, else the subagent's id */
  id: string
  name: string
  description: string
  parentId?: string
  isDone: boolean
  /** Input + output + cache-write tokens, summed over the agent's model requests (cache reads left out) */
  tokens: number
  doing: string
  /** The last few actions, oldest first, for the numbered recap (absent on rows from before 0.4.0) */
  history?: string[]
  /** The tool it last called; picks the claude-let's prop */
  tool?: string
  /** Waiting on the model, between tool calls */
  isThinking: boolean
  /** Finished by an error */
  isError: boolean
  /** The agent's todo list, by step key */
  steps: Array<{ key: string; status: StepStatus }>
}

export type Run = {
  /** Agent ids in the order they appeared, 'main' first */
  order: string[]
  agents: Record<string, AgentRow>
}

/** A five_hour or seven_day usage-limit window, as session.measure reports it */
export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'agent-monitor': { run: Run; isHidden: boolean; contextTokens: number; rateLimits: RateLimit[] }
  }
}
