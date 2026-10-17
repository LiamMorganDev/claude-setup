import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Change, Pr, View, Worktree } from '../types'
import {
  age,
  baseName,
  dirName,
  EMPTY_HEAD,
  hunks,
  isBranchName,
  parseNumstat,
  parsePrs,
  parseStash,
  parseStatus,
  parseWorktrees,
  samePath,
  shortName,
  slugOf,
} from './git'

const PANE = 'git-panel'
const FETCH_MS = 2 * 60_000
const PR_MS = 60_000
// shortcut: polls instead of watching every worktree's files; fine for a handful of worktrees, watch .git dirs if it gets heavy.
const POLL_MS = 5_000
const UNTRACKED_COUNT_LIMIT = 40
const DIFF_PREVIEW_LINES = 8
// Dracula (draculatheme.com) accents over the app's own background; muted is lifted for contrast on small text.
const C = {
  surface: '#21222c',
  line: '#44475a',
  sel: '#343746',
  fg: '#f8f8f2',
  muted: '#a3a8c8',
  purple: '#bd93f9',
  pink: '#ff79c6',
  cyan: '#8be9fd',
  green: '#50fa7b',
  orange: '#ffb86c',
  red: '#ff5555',
  yellow: '#f1fa8c',
}
const CODE_COLOR: Record<string, string> = { M: C.orange, A: C.green, '?': C.green, D: C.red, R: C.cyan, C: C.cyan, T: C.orange, U: C.red }
const PR_COLOR: Record<Pr['state'], string> = { open: C.green, draft: C.muted, merged: C.purple, closed: C.red }
const CI_GLYPH: Record<Pr['ci'], [string, string, string]> = {
  pass: ['✓', C.green, 'CI passed'],
  fail: ['✗', C.red, 'CI failed'],
  running: ['◐', C.yellow, 'CI running'],
  none: ['', C.muted, 'no checks'],
}

const view = atom({ plugin: 'git-panel', key: 'view' } as const, {
  home: '',
  focus: '',
  loaded: '',
  base: 'main',
  tab: 'changes',
  head: EMPTY_HEAD,
  changes: [],
  branchChanges: [],
  vsMain: false,
  worktrees: [],
  stash: [],
  prs: {},
  expanded: [],
  fullDiff: [],
  diffs: {},
  dialog: '',
  mergedAsk: false,
  more: false,
  msgOpen: false,
  newOpen: false,
  msg: '',
  newBranch: '',
  fetchedAt: 0,
  prsAt: 0,
  busy: '',
  note: '',
  isError: false,
} satisfies View)

type $ = EngineInterface
let debounce: { cancel: () => void } | null = null
let noteTimer: { cancel: () => void } | null = null
let refreshing = false
let again = false
let docked = true

const set = ($: $, patch: Partial<View> | ((v: View) => Partial<View>)) =>
  update($, view, v => ({ ...v, ...(typeof patch === 'function' ? patch(v) : patch) }))

async function run($: $, cmd: string[], cwd: string, opts: { stdin?: string; timeoutMs?: number; check?: boolean } = {}) {
  const res = await $.process.run(cmd, {
    cwd,
    timeoutMs: opts.timeoutMs ?? 20_000,
    stdin: opts.stdin,
    env: { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1' },
  })
  if (opts.check !== false && res.exitCode !== 0) {
    const why = (res.stderr || res.stdout).trim().split('\n').filter(Boolean)
    throw new Error(why.slice(-2).join(' ') || `${cmd[0]} ${cmd[1] ?? ''} failed`)
  }
  return res.stdout
}
const git = ($: $, cwd: string, args: string[], opts: { stdin?: string; timeoutMs?: number; check?: boolean } = {}) =>
  run($, ['git', '-C', cwd, ...args], cwd, opts)

const keyOf = (c: Change) => `${c.group}:${c.path}`

async function diffOf($: $, v: View, c: Change) {
  if (c.group === 'untracked') return git($, v.focus, ['diff', '--no-color', '--no-index', '--', '/dev/null', c.path], { check: false })
  if (c.group === 'branch') return git($, v.focus, ['diff', '--no-color', `${v.base}...HEAD`, '--', c.path], { check: false })
  return git($, v.focus, ['diff', '--no-color', ...(c.group === 'staged' ? ['--cached'] : []), '--', c.path], { check: false })
}

async function lineCount($: $, cwd: string, path: string) {
  try {
    const text = await $.fs.read(`${cwd}/${path}`)
    return typeof text === 'string' ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0
  } catch {
    return 0
  }
}

// One refresh at a time; a call made while one runs queues exactly one more.
async function refresh($: $) {
  if (refreshing) {
    again = true
    return
  }
  refreshing = true
  try {
    do {
      again = false
      await refreshOnce($)
    } while (again)
  } finally {
    refreshing = false
  }
}

async function refreshOnce($: $) {
  const v = await read($, view)
  if (!v.home) return
  try {
    const worktrees = parseWorktrees(await git($, v.home, ['worktree', 'list', '--porcelain']))
    const focus = worktrees.some(w => samePath(w.path, v.focus)) ? v.focus : v.home
    const base = await defaultBranch($, worktrees[0]?.path ?? v.home)
    const [status, unstaged, staged, stash, merged, branchStat] = await Promise.all([
      git($, focus, ['--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-z']),
      git($, focus, ['diff', '--numstat', '-z']),
      git($, focus, ['diff', '--cached', '--numstat', '-z']),
      git($, focus, ['stash', 'list', '--format=%gd%x00%s'], { check: false }),
      git($, focus, ['branch', '--merged', base, '--format=%(refname:short)'], { check: false }),
      v.vsMain ? git($, focus, ['diff', '--numstat', '-z', `${base}...HEAD`], { check: false }) : Promise.resolve(''),
    ])
    const { head, changes } = parseStatus(status)
    const counts = { staged: parseNumstat(staged), unstaged: parseNumstat(unstaged) }
    let untracked = 0
    for (const c of changes) {
      if (c.group === 'untracked') {
        if (untracked++ < UNTRACKED_COUNT_LIMIT) c.add = await lineCount($, focus, c.path)
      } else if (c.group !== 'branch') [c.add, c.del] = counts[c.group].get(c.path) ?? [0, 0]
    }
    // shortcut: every branch file shows as M (numstat has no status letter); add --name-status if A/D matter.
    const branchChanges: Change[] = [...parseNumstat(branchStat)].map(([path, [add, del]]) => ({ path, code: 'M', group: 'branch', add, del }))
    const mergedSet = new Set(merged.replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean))
    await Promise.all(
      worktrees.map(async (w: Worktree) => {
        const s = parseStatus(await git($, w.path, ['--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-z'], { check: false }))
        w.dirty = new Set(s.changes.map(c => c.path)).size
        w.ahead = s.head.ahead
        w.behind = s.head.behind
        const n = w.branch === base ? '0' : await git($, w.path, ['rev-list', '--count', `HEAD..${base}`], { check: false })
        w.behindMain = Number(n.trim()) || 0
        w.merged = w.branch !== base && (mergedSet.has(w.branch) || v.prs[w.branch]?.state === 'merged')
      }),
    )
    const { blame, me } = await readBlame($)
    for (const c of changes) {
      const b = blame[`${focus}/${c.path}`.replace(/\\/g, '/').toLowerCase()]
      if (b) [c.who, c.mine] = [b.l, b.s === me]
    }
    const all = [...changes, ...branchChanges]
    const live = new Set(all.map(keyOf))
    const expanded = v.expanded.filter(k => live.has(k))
    const diffs: Record<string, string> = {}
    const at = { ...v, focus, base }
    for (const c of all) if (expanded.includes(keyOf(c))) diffs[keyOf(c)] = await diffOf($, at, c)
    await set($, {
      focus,
      loaded: focus,
      base,
      head,
      changes,
      branchChanges,
      worktrees,
      stash: parseStash(stash),
      expanded,
      fullDiff: v.fullDiff.filter(k => live.has(k)),
      diffs,
    })
  } catch (err) {
    await say($, String((err as Error).message ?? err), true)
  }
}

// chat-blame's file: which chat last edited each file. Empty when that mod is absent.
async function readBlame($: $): Promise<{ blame: Record<string, { s: string; l: string }>; me: string }> {
  try {
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    const file = `${(home ?? '').replace(/\\/g, '/')}/.claude/chat-blame.json`
    if (!home || !(await $.fs.exists(file))) return { blame: {}, me: '' }
    return { blame: JSON.parse(String(await $.fs.read(file))), me: await $.session.id() }
  } catch {
    return { blame: {}, me: '' }
  }
}

function soon($: $, ms = 400) {
  debounce?.cancel()
  debounce = $.clock.after(ms, () => void refresh($))
}

// The status bar's result line; it clears itself after a while.
async function say($: $, note: string, isError = false) {
  await set($, { note, isError })
  noteTimer?.cancel()
  if (note) noteTimer = $.clock.after(isError ? 30_000 : 8_000, () => void set($, { note: '' }))
}

async function defaultBranch($: $, cwd: string) {
  const ref = (await git($, cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { check: false })).trim()
  if (ref) return ref.replace(/^origin\//, '')
  const local = await git($, cwd, ['branch', '--list', 'main', 'master', '--format=%(refname:short)'], { check: false })
  return local.split('\n').map(s => s.trim()).find(Boolean) ?? 'main'
}

async function fetchAll($: $, quiet: boolean) {
  const v = await read($, view)
  if (!v.home) return
  const ok = await git($, v.home, ['fetch', '--all', '--prune', '--quiet'], { timeoutMs: 60_000, check: false })
    .then(() => true, () => false)
  await set($, { fetchedAt: await $.clock.now() })
  if (!quiet) await say($, ok ? 'Fetched' : 'Fetch failed', !ok)
  await refresh($)
}

// One gh call covers every worktree's branch. No gh, or not logged in: PRs stay empty.
async function fetchPrs($: $) {
  const v = await read($, view)
  if (!v.home) return
  const out = await run(
    $,
    ['gh', 'pr', 'list', '--state', 'all', '--limit', '100', '--json', 'number,state,isDraft,headRefName,url,reviewDecision,statusCheckRollup'],
    v.home,
    { timeoutMs: 30_000, check: false },
  ).catch(() => '')
  if (out.trim().startsWith('[')) await set($, { prs: parsePrs(out), prsAt: await $.clock.now() })
}

// Runs one pane action: one at a time, its outcome in the status bar, then a refresh.
async function act($: $, label: string, fn: (v: View) => Promise<string | void>) {
  const v = await read($, view)
  if (v.busy) return
  await set($, { busy: label, dialog: '', more: false, mergedAsk: false, note: '', isError: false })
  try {
    await say($, (await fn(v)) || '')
  } catch (err) {
    await say($, String((err as Error).message ?? err), true)
  } finally {
    await set($, { busy: '' })
    await refresh($)
  }
}

async function isWindows($: $) {
  return (await $.env.get('OS')) === 'Windows_NT'
}

// A node_modules junction/symlink would let a recursive delete reach the main checkout: unlink it first.
async function unlinkNodeModules($: $, path: string) {
  if (await isWindows($)) {
    // rmdir without /s removes a junction but refuses a real, non-empty folder.
    await run($, ['cmd', '/c', 'rmdir', `${path.replace(/\//g, '\\')}\\node_modules`], path, { check: false })
  } else {
    await run($, ['sh', '-c', '[ -L "$1/node_modules" ] && rm "$1/node_modules"; true', 'sh', path], path, { check: false })
  }
}

async function removeWorktree($: $, v: View, w: Worktree, force: boolean) {
  await unlinkNodeModules($, w.path)
  await git($, v.home, ['worktree', 'remove', ...(force ? ['--force'] : []), w.path], { timeoutMs: 60_000 })
  if (!w.merged) return `Removed ${w.path}; kept branch ${w.branch}`
  const del = await git($, v.home, ['branch', '-d', w.branch], { check: false }).then(() => true, () => false)
  return `Removed ${w.path}${del ? ` and deleted ${w.branch}` : `; kept ${w.branch} (not merged locally)`}`
}

// Merged worktrees the banner removes: clean, and never the main checkout or this session's own.
const removable = (v: View) => v.worktrees.filter((w, i) => i > 0 && w.merged && !w.dirty && !samePath(w.path, v.home))

async function createWorktree($: $, branch: string) {
  branch = branch.trim()
  if (!isBranchName(branch)) return say($, 'Branch name: letters, digits and / . _ - only', true)
  await act($, 'creating worktree', async v => {
    const main = v.worktrees[0]?.path ?? v.home
    const dest = `${main}/.claude/worktrees/${slugOf(branch)}`
    await git($, main, ['worktree', 'add', '-b', branch, dest, v.base], { timeoutMs: 120_000 })
    const common = (await git($, main, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim()
    const exclude = `${common}/info/exclude`
    const current = (await $.fs.exists(exclude)) ? String(await $.fs.read(exclude)) : ''
    if (!/^\/?\.claude\/worktrees\/?$/m.test(current)) await $.fs.write(exclude, `${current}${current && !current.endsWith('\n') ? '\n' : ''}.claude/worktrees/\n`)
    const copied: string[] = []
    for (const f of await $.fs.list(main)) {
      if (f.kind !== 'file' || !/^\.env/.test(f.name)) continue
      await $.fs.write(`${dest}/${f.name}`, String(await $.fs.read(`${main}/${f.name}`)))
      copied.push(f.name)
    }
    await set($, { focus: dest, loaded: '', newBranch: '', newOpen: false, tab: 'changes' })
    return `Created .claude/worktrees/${slugOf(branch)} off ${v.base}${copied.length ? `, copied ${copied.join(', ')}` : ''}. Run your install step there.`
  })
}

const pull = ($: $) => act($, 'pulling', async w => void (await git($, w.focus, ['pull', '--ff-only'], { timeoutMs: 120_000 }))).then(() => fetchPrs($))
const push = ($: $) =>
  act($, 'pushing', async w => {
    await git($, w.focus, w.head.upstream ? ['push'] : ['push', '-u', 'origin', 'HEAD'], { timeoutMs: 120_000 })
    return `Pushed ${shortName(w.head.branch)}`
  }).then(() => fetchPrs($))
const sync = ($: $) =>
  act($, 'syncing with main', async w => {
    await git($, w.focus, ['merge', '--no-edit', w.base], { timeoutMs: 120_000 })
    return `Merged ${w.base} into ${shortName(w.head.branch)}`
  })
const stashPush = ($: $) =>
  act($, 'stashing', async w => {
    await git($, w.focus, ['stash', 'push', '-u', '-m', `git-panel: ${shortName(w.head.branch)}`])
    return 'Stashed all changes'
  })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'git-panel', description: 'Show the git panel: worktrees, changes, PRs' })
    void (async () => {
      const cwd = await $.session.cwd()
      const home = (await git($, cwd, ['rev-parse', '--show-toplevel'], { check: false }).catch(() => '')).trim()
      await set($, v => ({ home, focus: v.focus && v.home === home ? v.focus : home, busy: '', dialog: '', more: false }))
      if (!home) return
      await refresh($)
      if (docked) await $.ui.open({ id: PANE, title: 'Git' })
      void fetchAll($, true)
      void fetchPrs($)
      $.clock.every(FETCH_MS, () => void fetchAll($, true))
      $.clock.every(PR_MS, () => void fetchPrs($))
      $.clock.every(POLL_MS, () => void read($, view).then(v => (v.busy ? undefined : refresh($))))
    })()
    return next(e)
  })

  on('command.run', { command: 'git-panel' }, async $ => {
    docked = true
    const v = await read($, view)
    if (!v.home) return { text: 'Not in a git repository.' }
    await refresh($)
    await $.ui.open({ id: PANE, title: 'Git' })
    return { text: 'Git panel opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit' || e.tool === 'Bash') soon($)
    return result
  })

  on('classic.SessionStart', async ($, e, next) => {
    const result = await next(e)
    const gd = (await git($, e.cwd, ['rev-parse', '--absolute-git-dir'], { check: false }).catch(() => '')).trim()
    return gd ? { ...result, watchPaths: [...(result.watchPaths ?? []), `${gd}/index`, `${gd}/HEAD`] } : result
  })

  on('classic.FileChanged', async ($, e, next) => {
    const result = await next(e)
    soon($, 300)
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.surface === 'mobile') return next(e)
    const { Box, Text, Button, Input, Code, Link } = $.ui.resolve(e)
    if (e.surface === 'terminal' && e.props.placement === 'inline') {
      docked = false
      void $.ui.close({ id: PANE }).catch(() => undefined)
      return <Box />
    }
    const v = await read($, view)
    const now = await $.clock.now()
    const focusWt = v.worktrees.find(w => samePath(w.path, v.focus))
    const atHome = samePath(v.focus, v.home)
    const isMainCheckout = samePath(v.focus, v.worktrees[0]?.path ?? '')
    const staged = v.changes.filter(c => c.group === 'staged')
    const loading = v.loaded !== v.focus
    const head = v.head
    const pr = v.prs[head.branch]
    const go = (label: string, fn: (v: View) => Promise<string | void>) => () => void act($, label, fn)
    const toggle = (patch: (cur: View) => Partial<View>) => () => void set($, patch)

    const sec = (key: string, title: string, count: number | string, action?: JSX.Element) => (
      <Box key={`sec-${key}`} flexDirection="row" justifyContent="space-between" paddingX={1} marginTop={1}>
        <Text bold color={C.muted}>
          {title.toUpperCase()} <Text color="text">{count}</Text>
        </Text>
        {action ?? null}
      </Box>
    )
    const lnk = (key: string, label: string, onPress: () => void, color = C.purple) => (
      <Button key={key} plain onPress={onPress}>
        <Text color={color}>
          {label}
        </Text>
      </Button>
    )
    const chip = (label: string, color: string) => (
      <Text color={color}>
        {` ${label} `}
      </Text>
    )

    // ── worktrees ────────────────────────────────────────────────────────
    const prGlyphs = (p: Pr | undefined) =>
      p ? (
        <Text>
          <Text color={PR_COLOR[p.state]}>#{p.number}</Text>
          {CI_GLYPH[p.ci][0] ? <Text color={CI_GLYPH[p.ci][1]}> {CI_GLYPH[p.ci][0]}</Text> : null}
          {p.review !== 'none' ? <Text color={p.review === 'approved' ? C.green : C.orange}> ●</Text> : null}
        </Text>
      ) : null
    const prWords = (p: Pr) =>
      `#${p.number} ${p.state} · ${p.ci === 'fail' && p.failed ? `${p.failed} failed` : CI_GLYPH[p.ci][2]}${p.review === 'approved' ? ' · approved' : p.review === 'changes' ? ' · changes requested' : ''}`

    const wtRow = (w: Worktree) => {
      const isFocus = samePath(w.path, v.focus)
      const isHome = samePath(w.path, v.home)
      const p = v.prs[w.branch]
      return (
        <Box key={`wt-${w.path}`} flexDirection="row" gap={1} paddingX={1} backgroundColor={isFocus ? C.sel : undefined} hover={{ backgroundColor: C.sel }}>
          <Box flexGrow={1} flexShrink={1}>
            <Button
              key={`focus-${w.path}`}
              plain
              onPress={() => void set($, { focus: w.path, loaded: samePath(w.path, v.focus) ? v.loaded : '', expanded: [], dialog: '', more: false, msgOpen: false }).then(() => refresh($))}
            >
              <Text wrap="truncate-end">
                <Text color={isFocus ? C.purple : C.muted}>{isFocus ? '◆ ' : '◇ '}</Text>
                <Text color={isFocus ? C.pink : 'text'} bold={isFocus}>
                  {shortName(w.branch)}
                </Text>
                {isHome ? <Text> {chip('this chat', C.cyan)}</Text> : null}
              </Text>
            </Button>
          </Box>
          {prGlyphs(p)}
          <Text color={w.dirty ? C.orange : C.muted}>
            {w.dirty ? `●${w.dirty}` : 'clean'}
          </Text>
          <Text>
            <Text color={C.green}>↑{w.ahead}</Text> <Text color={w.behind ? C.pink : C.muted}>↓{w.behind}</Text>
          </Text>
          <Box
            position="absolute"
            top={1}
            left={3}
            display="none"
            hover={{ display: 'flex' }}
            flexDirection="column"
            borderStyle="round"
            borderColor={C.line}
            backgroundColor={C.surface}
            paddingX={1}
          >
            <Text color="text">
              {w.branch}
            </Text>
            {p ? <Text color={C.muted}>{prWords(p)}</Text> : <Text color={C.muted}>no PR</Text>}
            <Text color={C.muted}>
              {w.behindMain ? `${w.behindMain} behind ${v.base} · ` : ''}
              {w.path}
            </Text>
          </Box>
        </Box>
      )
    }

    const merged = removable(v)
    const worktreesBlock = (
      <Box key="worktrees" flexDirection="column">
        {sec('wt', 'Worktrees', v.worktrees.length, lnk('new-wt', v.newOpen ? 'cancel' : '+ new', toggle(cur => ({ newOpen: !cur.newOpen }))))}
        {merged.length ? (
          <Box key="merged-banner" flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1} marginX={1} paddingX={1} borderStyle="round" borderColor={C.purple}>
            <Text>
              <Text bold>{merged.length}</Text> worktree{merged.length === 1 ? ' is' : 's are'} merged into {v.base}
            </Text>
            <Button key="merged-ask" onPress={() => void set($, { mergedAsk: true })} label={`Remove ${merged.length}`} />
          </Box>
        ) : null}
        {merged.length && v.mergedAsk ? (
          <Box key="merged-confirm" flexDirection="column" gap={1} marginX={1} paddingX={1} borderStyle="round" borderColor={C.red}>
            <Text>
              Removes <Text bold>{merged.length}</Text> worktree{merged.length === 1 ? '' : 's'} and {merged.length === 1 ? 'its' : 'their'} merged branch
              {merged.length === 1 ? '' : 'es'} (<Text>{merged.map(w => shortName(w.branch)).join(', ')}</Text>). Unlinks node_modules first, never deletes through it.
            </Text>
            <Box flexDirection="row" gap={1}>
              <Button
                key="merged-go"
                plain
                onPress={go('removing merged worktrees', async cur => {
                  const done: string[] = []
                  for (const w of removable(cur)) done.push(await removeWorktree($, cur, w, false))
                  return done.length === 1 ? done[0] : `Removed ${done.length} merged worktrees`
                })}
              >
                <Text backgroundColor={C.red} color={C.surface} bold>
                  {` Remove ${merged.length} `}
                </Text>
              </Button>
              <Button key="merged-cancel" onPress={() => void set($, { mergedAsk: false })} label="Cancel" />
            </Box>
          </Box>
        ) : null}
        {v.worktrees.map(wtRow)}
        {v.newOpen ? (
          <Box key="new-box" flexDirection="column" paddingX={1}>
            <Input
              key="newwt"
              placeholder="feat/branch-name"
              submitLabel="create"
              value={v.newBranch}
              onInput={(text: string) => void set($, { newBranch: text })}
              onSubmit={(text: string) => void createWorktree($, text)}
            />
            <Text color={C.muted}>
              Off {v.base} into .claude/worktrees/, copies .env files
            </Text>
          </Box>
        ) : null}
      </Box>
    )

    // ── focused worktree ─────────────────────────────────────────────────
    const behindMain = focusWt?.behindMain ?? 0
    const header = (
      <Box key="header" flexDirection="column" paddingX={1} marginTop={1}>
        <Text wrap="truncate-end">
          <Text color={C.purple}>⎇ </Text>
          <Text bold color={C.pink}>
            {shortName(head.branch) || '…'}
          </Text>
          {atHome ? <Text> {chip('this chat', C.cyan)}</Text> : null}
        </Text>
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {head.ahead ? (
            <Text bold color={C.green}>
              {head.ahead} commit{head.ahead === 1 ? '' : 's'} to push
            </Text>
          ) : head.behind ? (
            <Text bold color={C.pink}>
              {head.behind} to pull
            </Text>
          ) : (
            <Text>nothing to push</Text>
          )}
          <Text color={C.muted}>·</Text>
          {behindMain ? (
            <Text bold color={C.pink}>
              {behindMain} behind {v.base}
            </Text>
          ) : (
            <Text>up to date with {v.base}</Text>
          )}
          <Text color={C.muted}>·</Text>
          {pr ? (
            <Text>
              PR <Link href={pr.url} label={`#${pr.number}`} /> {pr.state}
            </Text>
          ) : (
            <Text>no PR yet</Text>
          )}
        </Box>
      </Box>
    )

    const tabBtn = (t: View['tab'], label: string, count: number) => (
      <Button key={`tab-${t}`} plain onPress={() => void set($, { tab: t, dialog: '' })}>
        <Text bold={v.tab === t} color={v.tab === t ? 'text' : C.muted} underline={v.tab === t}>
          {label} {count}
        </Text>
      </Button>
    )

    const fileRow = (c: Change) => {
      const k = keyOf(c)
      const open = v.expanded.includes(k)
      const letter = c.code === '?' ? 'U' : c.code
      const icon = (key: string, glyph: string, color: string, onPress: () => void) => (
        <Button key={`${key}-${k}`} plain onPress={onPress}>
          <Text color={color} bold>
            {glyph}
          </Text>
        </Button>
      )
      const lines = open && v.diffs[k] ? hunks(v.diffs[k]) : []
      const capped = lines.length > DIFF_PREVIEW_LINES && !v.fullDiff.includes(k)
      return (
        <Box key={k} flexDirection="column">
          <Box key={`row-${k}`} flexDirection="row" gap={1} paddingX={1} backgroundColor={open ? C.sel : undefined} hover={{ backgroundColor: C.sel }}>
            <Text bold color={CODE_COLOR[c.code] ?? C.orange}>
              {letter}
            </Text>
            <Box flexGrow={1} flexShrink={1}>
              <Button key={`name-${k}`} plain onPress={() => void toggleDiff($, k)}>
                <Text wrap="truncate-end">
                  <Text color="text">
                    {baseName(c.path)}
                  </Text>
                  <Text color={C.muted}>
                    {' '}
                    {dirName(c.path)}
                  </Text>
                  {c.who ? (
                    <Text color={c.mine ? C.cyan : C.pink}>
                      {' '}
                      ◈ {c.mine ? 'this chat' : c.who}
                    </Text>
                  ) : null}
                </Text>
              </Button>
            </Box>
            <Text>
              <Text color={C.green}>+{c.add}</Text> <Text color={C.red}>-{c.del}</Text>
            </Text>
            <Box flexDirection="row" display="none" hover={{ display: 'flex' }}>
              {c.group === 'staged' ? icon('unstage', '−', C.yellow, () => void unstageFile($, c)) : null}
              {c.group === 'unstaged' || c.group === 'untracked' ? icon('stage', '+', C.green, () => void stageFile($, c)) : null}
              {c.group === 'unstaged' || c.group === 'untracked' ? icon('discard', '↺', C.red, () => void set($, { dialog: `discard:${k}` })) : null}
              {c.group === 'untracked' ? icon('ignore', '⊘', C.orange, () => void ignoreFile($, c)) : null}
              {icon('copy', '⧉', C.cyan, () => void copyPath($, c, e.surface))}
              {icon('ask', '✦', C.purple, () => void askAbout($, c))}
            </Box>
          </Box>
          {lines.length ? (
            <Box key={`diff-${k}`} flexDirection="column" marginX={1}>
              <Code source={(capped ? lines.slice(0, DIFF_PREVIEW_LINES) : lines).join('\n')} format="diff" path={c.path} />
              {capped
                ? lnk(`more-${k}`, `Show ${lines.length - DIFF_PREVIEW_LINES} more lines`, () => void set($, cur => ({ fullDiff: [...cur.fullDiff, k] })))
                : null}
            </Box>
          ) : null}
        </Box>
      )
    }

    const group = (key: string, title: string, list: Change[], action?: JSX.Element) =>
      list.length ? (
        <Box key={`g-${key}`} flexDirection="column">
          {sec(key, title, list.length, action)}
          {list.map(fileRow)}
        </Box>
      ) : null

    const skeleton = (
      <Box key="skeleton" flexDirection="column" marginTop={1}>
        {sec('loading', 'Changes', '')}
        {[14, 11, 17, 9, 13].map((n, i) => (
          <Box key={`sk-${i}`} flexDirection="row" gap={1} paddingX={1}>
            <Text color={C.line}>▬</Text>
            <Text color={C.line}>{'▬'.repeat(n)}</Text>
          </Box>
        ))}
      </Box>
    )

    const nextSteps = (
      <Box key="clean" flexDirection="column" gap={1} paddingX={1} marginTop={1}>
        <Text>
          <Text bold>✓ Nothing to commit.</Text> <Text color={C.muted}>Next:</Text>
        </Text>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {head.ahead ? <Button key="next-push" variant="primary" onPress={() => void push($)} label={`↑ Push ${head.ahead}`} /> : null}
          {behindMain ? <Button key="next-sync" onPress={() => void sync($)} label={`⇄ Sync with ${v.base} · ${behindMain}`} /> : null}
          {!head.ahead && !behindMain ? <Button key="next-fetch" onPress={() => void fetchAll($, false)} label="⟳ Fetch" /> : null}
        </Box>
      </Box>
    )

    const changesTab = () => {
      if (loading) return skeleton
      const unstaged = v.changes.filter(c => c.group === 'unstaged')
      const untracked = v.changes.filter(c => c.group === 'untracked')
      return (
        <Box key="changes" flexDirection="column">
          {v.vsMain ? group('branch', `vs ${v.base}`, v.branchChanges, lnk('vs-hide', 'hide', () => void set($, { vsMain: false }))) : null}
          {v.vsMain && !v.branchChanges.length ? (
            <Text color={C.muted}>{`  No changes vs ${v.base}.`}</Text>
          ) : null}
          {v.changes.length ? null : nextSteps}
          {group('staged', 'Staged', staged, lnk('unstage-all', 'unstage all', go('unstaging', async w => void (await git($, w.focus, ['reset', '-q']))), C.yellow))}
          {group('unstaged', 'Changes', unstaged, lnk('stage-all', 'stage all', go('staging', async w => void (await git($, w.focus, ['add', '-u']))), C.green))}
          {group(
            'untracked',
            'Untracked',
            untracked,
            lnk('stage-untracked', 'stage all', go('staging', async w => void (await git($, w.focus, ['add', '--', ...untracked.map(c => c.path)]))), C.green),
          )}
        </Box>
      )
    }

    const stashTab = () => (
      <Box key="stash" flexDirection="column">
        {sec('stash', 'Stash', v.stash.length, lnk('stash-push', 'stash changes', () => void stashPush($)))}
        {v.stash.length ? null : <Text color={C.muted}>{'  No stashes.'}</Text>}
        {v.stash.map(s => (
          <Box key={`st-${s.ref}`} flexDirection="row" gap={1} paddingX={1} hover={{ backgroundColor: C.sel }}>
            <Text color={C.cyan}>
              {s.ref}
            </Text>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="truncate-end">{s.message}</Text>
            </Box>
            {lnk(`pop-${s.ref}`, 'pop', go('popping stash', async w => void (await git($, w.focus, ['stash', 'pop', s.ref]))), C.green)}
          </Box>
        ))}
      </Box>
    )

    // ── pinned footer: commit row, actions, status line ──────────────────
    const hasChanges = !loading && v.changes.length > 0
    const moreItems: [string, string, () => void, string?][] = [
      ['m-pull', `↓ Pull ${head.behind}`, () => void pull($)],
      ['m-push', `↑ Push ${head.ahead}`, () => void push($)],
      ['m-fetch', '⟳ Fetch', () => void fetchAll($, false)],
      ['m-sync', `⇄ Sync with ${v.base}${behindMain ? ` ${behindMain}` : ''}`, () => void sync($)],
      ['m-diff', `≠ ${v.vsMain ? 'Hide diff' : 'Diff'} vs ${v.base}`, () => void set($, cur => ({ vsMain: !cur.vsMain, more: false, tab: 'changes' })).then(() => refresh($))],
      ['m-stash', '⊟ Stash changes', () => void stashPush($)],
      ...(isMainCheckout || atHome ? [] : ([['m-rm', '✕ Remove this worktree…', () => void set($, { dialog: `rm:${v.focus}`, more: false }), C.red]] as [string, string, () => void, string][])),
    ]
    const ages = `● local live · fetched ${age(v.fetchedAt, now) || 'never'} · PRs ${age(v.prsAt, now) || '—'}`
    const footerRows = (hasChanges ? 1 + (v.msgOpen ? 2 : 0) : 0) + (v.more ? moreItems.length : 0) + 2
    const footer = (
      <Box key="footer" flexDirection="column" backgroundColor={C.surface} paddingX={1}>
        {hasChanges ? (
          <Box key="commit-row" flexDirection="row" gap={1}>
            <Box flexGrow={1}>
              <Button key="commit-claude" variant="primary" onPress={() => void askClaude($)} label="✦ Commit with Claude" />
            </Box>
            <Button key="commit-manual" onPress={toggle(cur => ({ msgOpen: !cur.msgOpen }))} label="✎" />
          </Box>
        ) : null}
        {hasChanges && v.msgOpen ? (
          <Box key="manual" flexDirection="column">
            <Input key="msg" placeholder="Commit message" submitLabel="commit" value={v.msg} onInput={(text: string) => void set($, { msg: text })} onSubmit={(text: string) => void commit($, text)} />
            <Box flexDirection="row" gap={1}>
              <Button key="commit" onPress={() => void commit($, v.msg)} label={`✓ Commit ${staged.length} staged`} />
              {staged.length ? null : (
                <Text color={C.muted}>
                  Stage files first
                </Text>
              )}
            </Box>
          </Box>
        ) : null}
        {v.more ? (
          <Box key="more-menu" flexDirection="column">
            {moreItems.map(([key, label, onPress, color]) => (
              <Button key={key} plain onPress={() => void set($, { more: false }).then(onPress)}>
                <Text color={color ?? 'text'}>{label}</Text>
              </Button>
            ))}
          </Box>
        ) : null}
        <Box key="actions" flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="a-pull" onPress={() => void pull($)} label={`↓ ${head.behind}`} />
          <Button key="a-push" onPress={() => void push($)} label={`↑ ${head.ahead}`} />
          <Button key="a-fetch" onPress={() => void fetchAll($, false)} label="⟳" />
          <Button key="a-sync" onPress={() => void sync($)} label={`⇄ ${v.base}${behindMain ? ` ${behindMain}` : ''}`} />
          <Button key="a-diff" onPress={() => void set($, cur => ({ vsMain: !cur.vsMain, tab: 'changes' })).then(() => refresh($))} label="≠ diff" />
          <Button key="a-more" onPress={toggle(cur => ({ more: !cur.more }))} label="⋯" />
        </Box>
        <Box key="status" flexDirection="row" gap={1} justifyContent="space-between">
          <Box flexShrink={1}>
            <Text wrap="truncate-end">
              {v.busy ? <Text color={C.yellow}>⋯ {v.busy} · </Text> : null}
              {!v.busy && v.note ? <Text color={v.isError ? C.red : C.green}>{`${v.isError ? '✗' : '✓'} ${v.note} · `}</Text> : null}
              <Text color={C.muted}>
                <Text color={loading ? C.yellow : C.green}>●</Text>
                {loading ? ' refreshing' : ages.slice(1)}
              </Text>
            </Text>
          </Box>
          {lnk('refresh', '⟳ refresh', () => void Promise.all([fetchAll($, false), fetchPrs($)]))}
        </Box>
      </Box>
    )

    // ── dialog over the pane ─────────────────────────────────────────────
    const dialogBox = () => {
      if (v.dialog.startsWith('discard:')) {
        const k = v.dialog.slice(8)
        const c = v.changes.find(x => keyOf(x) === k)
        if (!c) return null
        return (
          <Box key="dialog" flexDirection="column" gap={1} borderStyle="round" borderColor={C.red} backgroundColor={C.surface} paddingX={2} paddingY={1}>
            <Text bold>Discard changes?</Text>
            <Text color={C.muted}>
              Your edits to <Text>{baseName(c.path)}</Text> will be lost. This can't be undone.
            </Text>
            <Box flexDirection="row" gap={1} justifyContent="flex-end">
              <Button key="dlg-cancel" onPress={() => void set($, { dialog: '' })} label="Cancel" />
              <Button key="dlg-discard" plain onPress={() => void discardFile($, c)}>
                <Text backgroundColor={C.red} color={C.surface} bold>
                  {' Discard '}
                </Text>
              </Button>
            </Box>
          </Box>
        )
      }
      if (v.dialog.startsWith('rm:')) {
        const w = v.worktrees.find(x => samePath(x.path, v.dialog.slice(3)))
        if (!w) return null
        return (
          <Box key="dialog" flexDirection="column" gap={1} borderStyle="round" borderColor={C.red} backgroundColor={C.surface} paddingX={2} paddingY={1}>
            <Text bold>Remove worktree?</Text>
            <Text color={C.muted}>
              Deletes <Text>{w.path}</Text>.{w.dirty ? ` ${w.dirty} uncommitted files will be lost.` : ''} Branch <Text>{w.branch}</Text>{' '}
              {w.merged ? 'is merged and gets deleted.' : 'is not merged, so it is kept.'}
            </Text>
            <Box flexDirection="row" gap={1} justifyContent="flex-end">
              <Button key="dlg-cancel" onPress={() => void set($, { dialog: '' })} label="Cancel" />
              <Button
                key="dlg-remove"
                plain
                onPress={go('removing worktree', async cur => {
                  const note = await removeWorktree($, cur, w, w.dirty > 0)
                  await set($, { focus: cur.home, loaded: '' })
                  return note
                })}
              >
                <Text backgroundColor={C.red} color={C.surface} bold>
                  {' Remove '}
                </Text>
              </Button>
            </Box>
          </Box>
        )
      }
      return null
    }

    const rows = Math.max(footerRows + 4, e.props.scroll?.bodyRows ?? 24)
    const offset = e.props.scroll?.offset ?? 0
    const dlg = dialogBox()
    return (
      <Box flexDirection="column" minHeight={rows}>
        <Box flexDirection="column" paddingBottom={footerRows}>
          {worktreesBlock}
          <Box key="divider" marginTop={1}>
            <Text color={C.line} wrap="truncate-end">
              {'─'.repeat(Math.max(10, e.props.bodyColumns ?? 60))}
            </Text>
          </Box>
          {header}
          <Box key="tabs" flexDirection="row" gap={2} paddingX={1} marginTop={1}>
            {tabBtn('changes', 'Changes', v.changes.length)}
            {tabBtn('stash', 'Stash', v.stash.length)}
          </Box>
          {v.tab === 'stash' ? stashTab() : changesTab()}
        </Box>
        {/* Pinned: placed at the window's bottom edge on every render; each scroll asks for a fresh render. */}
        <Box key="pin" position="absolute" left={0} right={0} top={offset + rows - footerRows}>
          {footer}
        </Box>
        {dlg ? (
          <Box key="dlg-pin" position="absolute" left={2} right={2} top={offset + 2}>
            {dlg}
          </Box>
        ) : null}
      </Box>
    )
  })
}

async function commit($: $, message: string) {
  const v = await read($, view)
  if (!message.trim()) return say($, 'Type a commit message first', true)
  if (!v.changes.some(c => c.group === 'staged')) return say($, 'Nothing staged: hover a file and press +', true)
  await act($, 'committing', async w => {
    await git($, w.focus, ['commit', '-F', '-'], { stdin: message, timeoutMs: 60_000 })
    await set($, { msg: '', msgOpen: false })
    return `Committed on ${shortName(w.head.branch)}: ${message.trim().split('\n')[0]}`
  })
}

async function askClaude($: $) {
  const v = await read($, view)
  await say($, 'Asked Claude to commit')
  if (samePath(v.focus, v.home)) {
    await $.command.run({ command: 'commit' }).catch(() => $.prompt.submit({ text: 'Commit the current changes with a clear message.' }))
  } else {
    await $.prompt.submit({ text: `Commit the changes in the worktree at ${v.focus} (git -C "${v.focus}") with a clear message.` })
  }
}

const changeOf = (v: View, k: string) => [...v.changes, ...v.branchChanges].find(c => keyOf(c) === k)

async function toggleDiff($: $, k: string) {
  const v = await read($, view)
  const c = changeOf(v, k)
  if (!c) return
  if (v.expanded.includes(k)) return set($, cur => ({ expanded: cur.expanded.filter(x => x !== k) }))
  const diff = await diffOf($, v, c)
  await set($, cur => ({ expanded: [...cur.expanded, k], diffs: { ...cur.diffs, [k]: diff } }))
}

const stageFile = ($: $, c: Change) => act($, 'staging', async w => void (await git($, w.focus, ['add', '--', c.path])))
const unstageFile = ($: $, c: Change) => act($, 'unstaging', async w => void (await git($, w.focus, ['restore', '--staged', '--', c.path])))

async function discardFile($: $, c: Change) {
  await act($, 'discarding', async w => {
    if (c.group === 'untracked') await git($, w.focus, ['clean', '-f', '--', c.path])
    else await git($, w.focus, ['restore', '--', c.path])
    return `Discarded ${c.path}`
  })
}

async function ignoreFile($: $, c: Change) {
  await act($, 'ignoring', async w => {
    const file = `${w.focus}/.gitignore`
    const cur = (await $.fs.exists(file)) ? String(await $.fs.read(file)) : ''
    await $.fs.write(file, `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}/${c.path}\n`)
    return `Added /${c.path} to .gitignore`
  })
}

async function copyPath($: $, c: Change, surface: 'terminal' | 'desktop' | 'vscode') {
  const res = await $.ui.copy({ text: c.path, surface })
  await say($, res.isCopied ? `Copied ${c.path}` : `Could not copy (${res.reason})`, !res.isCopied)
}

async function askAbout($: $, c: Change) {
  const v = await read($, view)
  const where = samePath(v.focus, v.home) ? '' : ` in the worktree at ${v.focus}`
  const range = c.group === 'staged' ? ' --cached' : c.group === 'branch' ? ` ${v.base}...HEAD` : ''
  await $.prompt.submit({ text: `Explain my ${c.group} change to ${c.path}${where} (git diff${range} -- ${c.path}) and flag anything risky.` })
}
