// Dracula palettes (draculatheme.com: Dracula dark, Alucard light) and the tag each transcript row gets.

export type Palette = Record<'fg' | 'dim' | 'purple' | 'pink' | 'green' | 'cyan' | 'orange' | 'red' | 'yellow', string>

export const DARK: Palette = {
  fg: '#F8F8F2',
  dim: '#6272A4',
  purple: '#BD93F9',
  pink: '#FF79C6',
  green: '#50FA7B',
  cyan: '#8BE9FD',
  orange: '#FFB86C',
  red: '#FF5555',
  yellow: '#F1FA8C',
}

export const LIGHT: Palette = {
  fg: '#1F1F1F',
  dim: '#635D97',
  purple: '#644AC9',
  pink: '#A3144D',
  green: '#14710A',
  cyan: '#036A96',
  orange: '#A34D14',
  red: '#CB3A2A',
  yellow: '#846E15',
}

/** `theme` config values containing "light" (light, light-daltonized, light-ansi) get Alucard. */
export const isLightTheme = (value: unknown) => typeof value === 'string' && /light/i.test(value)
export const paletteFor = (isLight: boolean) => (isLight ? LIGHT : DARK)

export type Tag = { label: string; color: keyof Palette }

export const TAGS = {
  you: { label: 'you', color: 'pink' },
  claude: { label: 'claude', color: 'purple' },
  sum: { label: 'sum', color: 'yellow' },
  read: { label: 'read', color: 'cyan' },
  run: { label: 'run', color: 'orange' },
  edit: { label: 'edit', color: 'pink' },
  agent: { label: 'agent', color: 'purple' },
  tool: { label: 'tool', color: 'dim' },
  tools: { label: 'tools', color: 'dim' },
  err: { label: 'err', color: 'red' },
  stop: { label: 'stop', color: 'dim' },
} satisfies Record<string, Tag>

export type ToolKind = 'run' | 'edit' | 'agent' | 'read' | 'tool'

const RUN = /^(Bash|PowerShell|BashOutput|KillShell|Monitor|TaskStop|mcp__terminal__run_in_terminal)$/
const READ = /^(Read|Grep|Glob|LS|WebFetch|WebSearch|LSP|ToolSearch|NotebookRead)$|^mcp__.*(read|search|find|get|list|query)/i
const EDIT = /^(Edit|MultiEdit|Write|NotebookEdit)$/
const AGENT = /^(Agent|Task|Workflow|SendMessage)$|start_session|hand_off_to_session/

export function kindOfTool(tool: string): ToolKind {
  if (RUN.test(tool)) return 'run'
  if (EDIT.test(tool)) return 'edit'
  if (AGENT.test(tool)) return 'agent'
  if (READ.test(tool)) return 'read'
  return 'tool'
}

type CallState = { tool: string; isErrored: boolean; isInterrupted: boolean }

export function tagForToolUse(p: CallState): Tag {
  if (p.isInterrupted) return TAGS.stop
  if (p.isErrored) return TAGS.err
  return TAGS[kindOfTool(p.tool)]
}

/** A folded group is tagged by its calls: one kind → that kind, mixed → "tools", any error → "err". */
export function tagForGroup(calls: ReadonlyArray<CallState>): Tag {
  if (calls.some(c => c.isErrored)) return TAGS.err
  const kinds = new Set(calls.map(c => kindOfTool(c.tool)))
  if (kinds.size === 1) return TAGS[[...kinds][0]!]
  return TAGS.tools
}

/** Only failed results get a tag; successful ones stay dim and bare. */
export const tagForResult = (p: { isErrored: boolean }): Tag | undefined => (p.isErrored ? TAGS.err : undefined)

/** The divider opening a turn: `── [you] ────…` */
export const divider = (tag: Tag) => `── [${tag.label}] ${'─'.repeat(24)}`

/** Tree prefixes. The API can't tell a row it is the last of its turn, so calls always draw `├─`. */
export const CALL_PREFIX = '├─ '
export const RESULT_PREFIX = '│  ↳ '
