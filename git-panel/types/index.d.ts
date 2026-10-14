export type Head = { branch: string; upstream: string; ahead: number; behind: number }

export type Change = {
  path: string
  /** porcelain letter: M A D R C T U, or ? for untracked */
  code: string
  group: 'staged' | 'unstaged' | 'untracked'
  add: number
  del: number
}

export type Worktree = { path: string; branch: string; dirty: number; ahead: number; behind: number }

export type Stash = { ref: string; message: string }

export type Tab = 'changes' | 'worktrees' | 'stash'

export type View = {
  /** the session's worktree root ('' outside a repo) */
  home: string
  /** worktree the pane shows and acts on */
  focus: string
  tab: Tab
  head: Head
  changes: Change[]
  worktrees: Worktree[]
  stash: Stash[]
  /** group:path keys of expanded files */
  expanded: string[]
  /** group:path → unified diff text */
  diffs: Record<string, string>
  /** armed destructive action key, e.g. discard:unstaged:src/a.ts or rm:<path> */
  confirm: string
  rmBranch: boolean
  merged: string[]
  msg: string
  newBranch: string
  fetchedAt: number
  busy: string
  note: string
  isError: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'git-panel': { view: View }
  }
}
