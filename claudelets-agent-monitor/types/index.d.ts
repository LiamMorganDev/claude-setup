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
  /** The last few actions, oldest first, for the recap behind the row's toggle */
  history?: string[]
  /** The tool it last called; picks the claude-let's prop */
  tool?: string
  /** Waiting on the model, between tool calls */
  isThinking: boolean
  /** Waiting on the person: a permission prompt or a question is open */
  isWaiting?: boolean
  /** Finished by an error */
  isError: boolean
  /** The agent's todo list, by step key */
  steps: Array<{ key: string; status: StepStatus }>
  /** Epoch ms the row started and finished (absent on rows from before 0.6.0) */
  startedAt?: number
  endedAt?: number
  /** The model it runs on, as the engine names it */
  model?: string
}

/** A file an agent wrote or edited: its path within the project (just its name outside it), and whether the request created it */
export type TouchedFile = { path: string; isNew: boolean }

export type Run = {
  /** Agent ids in the order they appeared, 'main' first */
  order: string[]
  agents: Record<string, AgentRow>
  /** Files written or edited during the request, first touch first */
  files?: TouchedFile[]
}

/** One finished request, as the history keeps it */
export type HistoryEntry = {
  /** Epoch ms the request started */
  at: number
  title: string
  outcome: 'done' | 'stuck' | 'interrupted'
  ms: number
  tokens: number
  files: number
}

/** The history fold-out: the day shown (YYYY-MM-DD, local), its requests, and whether it is open */
export type HistoryView = { day: string; entries: HistoryEntry[]; isOpen: boolean }

/** One usage reading: [epoch ms, percentUsed] */
export type Sample = [number, number]

/** A five_hour or seven_day usage-limit window, as session.measure reports it */
export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'claudelets-agent-monitor': {
      run: Run
      isHidden: boolean
      contextTokens: number
      rateLimits: RateLimit[]
      /** Recent readings per limit kind, [epoch ms, percentUsed], for the forecast */
      limitSamples: Record<string, Sample[]>
      /** The resetsAt each limit kind last toasted its 90% alert for */
      alerted: Record<string, string>
      /** Row ids whose action history is unfolded */
      expanded: string[]
      /** Bumped every second while an agent runs, so elapsed timers redraw */
      tick: number
      /** Whether the finished request's file list is unfolded */
      filesOpen: boolean
      history: HistoryView
    }
  }
}
