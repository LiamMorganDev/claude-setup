export type Head = { branch: string; upstream: string; ahead: number; behind: number }

export type Change = {
  path: string
  /** porcelain letter: M A D R C T U, or ? for untracked */
  code: string
  /** branch: changed on this branch vs the default branch (the "Diff vs main" list) */
  group: 'staged' | 'unstaged' | 'untracked' | 'branch'
  add: number
  del: number
  /** chat that last edited the file, from chat-blame ('' when unknown) */
  who?: string
  /** that chat is this session */
  mine?: boolean
}

export type Pr = {
  number: number
  url: string
  state: 'open' | 'draft' | 'merged' | 'closed'
  ci: 'pass' | 'fail' | 'running' | 'none'
  /** name of the first failing check */
  failed: string
  review: 'approved' | 'changes' | 'none'
}

export type Worktree = {
  path: string
  branch: string
  dirty: number
  ahead: number
  behind: number
  /** commits on the default branch this branch lacks */
  behindMain: number
  /** branch merged into the default branch, locally or by its PR */
  merged: boolean
}

export type Stash = { ref: string; message: string }

export type Tab = 'changes' | 'stash'

export type View = {
  /** the session's worktree root ('' outside a repo) */
  home: string
  /** worktree the pane shows and acts on */
  focus: string
  /** worktree whose changes are loaded ('' while the focused one loads) */
  loaded: string
  /** the default branch, e.g. main */
  base: string
  tab: Tab
  head: Head
  changes: Change[]
  /** files changed on the focused branch vs base, when vsMain is on */
  branchChanges: Change[]
  vsMain: boolean
  worktrees: Worktree[]
  stash: Stash[]
  /** branch → its newest PR */
  prs: Record<string, Pr>
  /** group:path keys of expanded files */
  expanded: string[]
  /** group:path keys whose diff shows past the first lines */
  fullDiff: string[]
  /** group:path → unified diff text */
  diffs: Record<string, string>
  /** open dialog: discard:<group:path> or rm:<worktree path> */
  dialog: string
  /** asked to remove all merged worktrees, awaiting the confirm */
  mergedAsk: boolean
  /** footer's More menu open */
  more: boolean
  /** manual commit message box open */
  msgOpen: boolean
  /** new-worktree box open */
  newOpen: boolean
  msg: string
  newBranch: string
  fetchedAt: number
  prsAt: number
  busy: string
  note: string
  isError: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'git-panel': { view: View }
  }
}
