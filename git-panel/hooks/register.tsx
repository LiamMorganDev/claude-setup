import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Change, Tab, View } from '../types'
import type { NameProps } from './name'
import { baseName, dirName, EMPTY_HEAD, isBranchName, parseNumstat, parseStash, parseStatus, parseWorktrees, samePath, slugOf } from './git'

const PANE = 'git-panel'
const FETCH_MS = 5 * 60_000
const UNTRACKED_COUNT_LIMIT = 40
// Dracula (draculatheme.com); muted is lifted from the spec's comment colour for contrast on small text.
const C = {
  bg: '#282a36',
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
const view = atom({ plugin: 'git-panel', key: 'view' } as const, {
  home: '',
  focus: '',
  tab: 'changes',
  head: EMPTY_HEAD,
  changes: [],
  worktrees: [],
  stash: [],
  expanded: [],
  diffs: {},
  confirm: '',
  menu: '',
  rmBranch: true,
  merged: [],
  msg: '',
  newBranch: '',
  fetchedAt: 0,
  busy: '',
  note: '',
  isError: false,
} satisfies View)

type $ = EngineInterface
let debounce: { cancel: () => void } | null = null
let docked = true

const set = ($: $, patch: Partial<View> | ((v: View) => Partial<View>)) =>
  update($, view, v => ({ ...v, ...(typeof patch === 'function' ? patch(v) : patch) }))

async function git($: $, cwd: string, args: string[], opts: { stdin?: string; timeoutMs?: number; check?: boolean } = {}) {
  const res = await $.process.run(['git', '-C', cwd, ...args], {
    timeoutMs: opts.timeoutMs ?? 20_000,
    stdin: opts.stdin,
    env: { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
  })
  if (opts.check !== false && res.exitCode !== 0) {
    const why = (res.stderr || res.stdout).trim().split('\n').filter(Boolean)
    throw new Error(why.slice(-2).join(' ') || `git ${args[0]} failed`)
  }
  return res.stdout
}

const keyOf = (c: Change) => `${c.group}:${c.path}`

async function diffOf($: $, cwd: string, c: Change) {
  if (c.group === 'untracked') return git($, cwd, ['diff', '--no-color', '--no-index', '--', '/dev/null', c.path], { check: false })
  return git($, cwd, ['diff', '--no-color', ...(c.group === 'staged' ? ['--cached'] : []), '--', c.path], { check: false })
}

async function lineCount($: $, cwd: string, path: string) {
  try {
    const text = await $.fs.read(`${cwd}/${path}`)
    return typeof text === 'string' ? text.split('\n').length - (text.endsWith('\n') ? 1 : 0) : 0
  } catch {
    return 0
  }
}

async function refresh($: $) {
  const v = await read($, view)
  if (!v.home) return
  try {
    const worktrees = parseWorktrees(await git($, v.home, ['worktree', 'list', '--porcelain']))
    const focus = worktrees.some(w => samePath(w.path, v.focus)) ? v.focus : v.home
    const [status, unstaged, staged, stash, merged] = await Promise.all([
      git($, focus, ['--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-z']),
      git($, focus, ['diff', '--numstat', '-z']),
      git($, focus, ['diff', '--cached', '--numstat', '-z']),
      git($, focus, ['stash', 'list', '--format=%gd%x00%s'], { check: false }),
      defaultBranch($, focus).then(base => git($, focus, ['branch', '--merged', base, '--format=%(refname:short)'], { check: false })),
    ])
    const { head, changes } = parseStatus(status)
    const counts = { staged: parseNumstat(staged), unstaged: parseNumstat(unstaged) }
    let untracked = 0
    for (const c of changes) {
      if (c.group === 'untracked') {
        if (untracked++ < UNTRACKED_COUNT_LIMIT) c.add = await lineCount($, focus, c.path)
      } else [c.add, c.del] = counts[c.group].get(c.path) ?? [0, 0]
    }
    await Promise.all(
      worktrees.map(async w => {
        const s = parseStatus(await git($, w.path, ['--no-optional-locks', 'status', '--porcelain=v2', '--branch', '-z'], { check: false }))
        w.dirty = new Set(s.changes.map(c => c.path)).size
        w.ahead = s.head.ahead
        w.behind = s.head.behind
      }),
    )
    const live = new Set(changes.map(keyOf))
    const expanded = v.expanded.filter(k => live.has(k))
    const diffs: Record<string, string> = {}
    for (const c of changes) if (expanded.includes(keyOf(c))) diffs[keyOf(c)] = await diffOf($, focus, c)
    await set($, {
      focus,
      head,
      changes,
      worktrees,
      stash: parseStash(stash),
      merged: merged.replace(/\r/g, '').split('\n').filter(Boolean),
      expanded,
      diffs,
    })
  } catch (err) {
    await set($, { note: String((err as Error).message ?? err), isError: true })
  }
}

function soon($: $, ms = 400) {
  debounce?.cancel()
  debounce = $.clock.after(ms, () => void refresh($))
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
  await set($, quiet ? { fetchedAt: await $.clock.now() } : { fetchedAt: await $.clock.now(), note: ok ? 'Fetched' : 'Fetch failed', isError: !ok })
  await refresh($)
}

// Runs one pane action: one at a time, its outcome as the pane's note, then a refresh.
async function act($: $, label: string, fn: (v: View) => Promise<string | void>) {
  const v = await read($, view)
  if (v.busy) return
  await set($, { busy: label, confirm: '', menu: '', note: '', isError: false })
  try {
    const note = await fn(v)
    await set($, { note: note || '', isError: false })
  } catch (err) {
    await set($, { note: String((err as Error).message ?? err), isError: true })
  } finally {
    await set($, { busy: '' })
    await refresh($)
  }
}

// Two-press guard: the first press arms `key`, the second runs.
async function armed($: $, key: string) {
  const v = await read($, view)
  if (v.confirm === key) return true
  await set($, { confirm: key })
  return false
}

async function createWorktree($: $, branch: string) {
  branch = branch.trim()
  if (!isBranchName(branch)) {
    await set($, { note: 'Branch name: letters, digits and / . _ - only', isError: true })
    return
  }
  await act($, 'creating worktree', async v => {
    const main = parseWorktrees(await git($, v.home, ['worktree', 'list', '--porcelain']))[0]?.path ?? v.home
    const base = await defaultBranch($, main)
    const dest = `${main}/.worktrees/${slugOf(branch)}`
    await git($, main, ['worktree', 'add', '-b', branch, dest, base], { timeoutMs: 120_000 })
    const common = (await git($, main, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim()
    const exclude = `${common}/info/exclude`
    const current = (await $.fs.exists(exclude)) ? String(await $.fs.read(exclude)) : ''
    if (!/^\/?\.worktrees\/?$/m.test(current)) await $.fs.write(exclude, `${current}${current && !current.endsWith('\n') ? '\n' : ''}.worktrees/\n`)
    const copied: string[] = []
    for (const f of await $.fs.list(main)) {
      if (f.kind !== 'file' || !/^\.env/.test(f.name)) continue
      await $.fs.write(`${dest}/${f.name}`, String(await $.fs.read(`${main}/${f.name}`)))
      copied.push(f.name)
    }
    await set($, { focus: dest, newBranch: '', tab: 'changes' })
    return `Created .worktrees/${slugOf(branch)} off ${base}${copied.length ? `, copied ${copied.join(', ')}` : ''}. Run your install step there.`
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'git-panel', description: 'Show the git panel: diffs, branch status, worktrees' })
    void (async () => {
      const cwd = await $.session.cwd()
      const home = (await git($, cwd, ['rev-parse', '--show-toplevel'], { check: false }).catch(() => '')).trim()
      await set($, v => ({ home, focus: v.focus && v.home === home ? v.focus : home, busy: '' }))
      if (!home) return
      await refresh($)
      if (docked) await $.ui.open({ id: PANE, title: 'Git' })
      void fetchAll($, true)
      $.clock.every(FETCH_MS, () => void fetchAll($, true))
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

  on('ui.message', { requestId: PANE }, async ($, e, next) => {
    if (typeof e.element !== 'string' || !e.element.startsWith('name:') || !e.data || typeof e.data !== 'object') return next(e)
    const k = e.element.slice(5)
    const data = e.data as { press?: boolean; menu?: boolean }
    if (data.menu) await set($, v => ({ menu: v.menu === k ? '' : k, confirm: '' }))
    else if (data.press) await toggleDiff($, k)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.surface === 'mobile') return next(e)
    const { Box, Text, Button, Input, Code } = $.ui.resolve(e)
    const Client = e.surface === 'vscode' ? Box : $.ui.resolve(e).Client
    if (e.surface === 'terminal' && e.props.placement === 'inline') {
      docked = false
      void $.ui.close({ id: PANE }).catch(() => undefined)
      return <Box />
    }
    const v = await read($, view)
    const busy = Boolean(v.busy)
    const atHome = samePath(v.focus, v.home)
    const go = (label: string, fn: (v: View) => Promise<string | void>) => () => void act($, label, fn)
    const age = v.fetchedAt ? Math.max(0, Math.round(((await $.clock.now()) - v.fetchedAt) / 60_000)) : -1
    const staged = v.changes.filter(c => c.group === 'staged')
    const behindColor = (n: number) => (n ? C.pink : C.muted)

    // A filled bar: what tells one section from the next.
    const section = (title: string, count: number | string, action?: JSX.Element) => (
      <Box key={`sec-${title}`} flexDirection="row" justifyContent="space-between" backgroundColor={C.line} paddingX={1} marginTop={1}>
        <Text color={C.purple} bold>
          {title.toUpperCase()} <Text color={C.fg}>{count}</Text>
        </Text>
        {action ?? null}
      </Box>
    )
    const chip = (key: string, label: string, color: string, onPress: () => void, extra?: string) => (
      <Button key={key} plain onPress={onPress}>
        <Text color={color} bold>
          {label}
        </Text>
        {extra ? <Text color={C.muted}> {extra}</Text> : null}
      </Button>
    )
    const tab = (t: Tab, label: string, count: number) => (
      <Button key={`tab-${t}`} plain onPress={() => void set($, { tab: t, confirm: '' })}>
        {v.tab === t ? (
          <Text backgroundColor={C.purple} color={C.bg} bold>
            {' '}
            {label} {count}{' '}
          </Text>
        ) : (
          <Text color={C.muted}>
            {' '}
            {label} <Text color={C.fg}>{count}</Text>{' '}
          </Text>
        )}
      </Button>
    )

    const fileRow = (c: Change) => {
      const k = keyOf(c)
      const open = v.expanded.includes(k)
      const discardKey = `discard:${k}`
      const letter = c.code === '?' ? 'U' : c.code
      const menuItem = (key: string, label: string, color: string, onPress: () => void) => (
        <Button key={`m-${key}-${k}`} plain onPress={onPress}>
          <Text color={color}>{label}</Text>
        </Button>
      )
      return (
        <Box key={k} flexDirection="column">
          <Box flexDirection="row" gap={1} paddingX={1} backgroundColor={open || v.menu === k ? C.sel : undefined}>
            <Button key={`open-${k}`} plain onPress={() => void toggleDiff($, k)}>
              <Text color={C.muted}>{open ? '▾' : '▸'}</Text>
            </Button>
            <Text color={CODE_COLOR[c.code] ?? C.orange} bold>
              {letter}
            </Text>
            <Box flexGrow={1} flexShrink={1}>
              {e.surface === 'vscode' ? (
                <Button key={`name-${k}`} plain onPress={() => void toggleDiff($, k)}>
                  <Text color={C.fg}>{baseName(c.path)}</Text>
                  <Text color={C.muted}> {dirName(c.path)}</Text>
                </Button>
              ) : (
                <Client
                  key={`name:${k}`}
                  module="./name.tsx"
                  flexGrow={1}
                  props={{ name: baseName(c.path), dir: dirName(c.path), fg: C.fg, muted: C.muted, hoverBg: C.line } satisfies NameProps}
                />
              )}
            </Box>
            <Text>
              <Text color={C.green}>+{c.add}</Text> <Text color={C.red}>-{c.del}</Text>
            </Text>
            {c.group === 'staged' ? (
              <Button key={`unstage-${k}`} plain onPress={() => void unstageFile($, c)}>
                <Text color={C.yellow} bold>−</Text>
              </Button>
            ) : (
              <Button key={`stage-${k}`} plain onPress={() => void stageFile($, c)}>
                <Text color={C.green} bold>+</Text>
              </Button>
            )}
            {c.group !== 'staged' ? (
              <Button key={`discard-${k}`} plain onPress={() => void discardFile($, c)}>
                {v.confirm === discardKey ? (
                  <Text backgroundColor={C.red} color={C.bg} bold>
                    {' sure? '}
                  </Text>
                ) : (
                  <Text color={C.red}>↺</Text>
                )}
              </Button>
            ) : null}
          </Box>
          {v.menu === k ? (
            <Box flexDirection="column" borderStyle="round" borderColor={C.purple} marginX={2} paddingX={1}>
              {menuItem('diff', open ? '▾ Hide diff' : '▸ Show diff', C.fg, () => void toggleDiff($, k))}
              {c.group === 'staged'
                ? menuItem('unstage', '− Unstage', C.yellow, () => void unstageFile($, c))
                : menuItem('stage', '+ Stage', C.green, () => void stageFile($, c))}
              {c.group !== 'staged'
                ? menuItem('discard', v.confirm === discardKey ? '↺ Discard changes: press again to confirm' : '↺ Discard changes', C.red, () => void discardFile($, c))
                : null}
              {c.group === 'untracked' ? menuItem('ignore', '⊘ Add to .gitignore', C.orange, () => void ignoreFile($, c)) : null}
              {menuItem('copy', '⧉ Copy path', C.cyan, () => void copyPath($, c, e.surface))}
              {menuItem('ask', '✦ Ask Claude about this change', C.purple, () => void askAbout($, c))}
              {menuItem('close', '✕ Close', C.muted, () => void set($, { menu: '', confirm: '' }))}
            </Box>
          ) : null}
          {open && v.diffs[k] ? <Code source={v.diffs[k]} format="diff" path={c.path} /> : null}
        </Box>
      )
    }

    const group = (title: string, list: Change[], action: JSX.Element) =>
      list.length ? (
        <Box key={`g-${title}`} flexDirection="column">
          {section(title, list.length, action)}
          {list.map(fileRow)}
        </Box>
      ) : null

    const changesTab = () => {
      if (!v.changes.length) return <Text color={C.muted}>{'\n'}  Working tree clean. Nothing to commit.</Text>
      const unstaged = v.changes.filter(c => c.group === 'unstaged')
      const untracked = v.changes.filter(c => c.group === 'untracked')
      return (
        <Box flexDirection="column">
          {group('Staged', staged, chip('unstage-all', 'unstage all', C.yellow, go('unstaging', async w => void (await git($, w.focus, ['reset', '-q'])))))}
          {group('Changes', unstaged, chip('stage-all', 'stage all', C.green, go('staging', async w => void (await git($, w.focus, ['add', '-u'])))))}
          {group(
            'Untracked',
            untracked,
            chip('stage-untracked', 'stage all', C.green, go('staging', async w => void (await git($, w.focus, ['add', '--', ...untracked.map(c => c.path)])))),
          )}
          {section('Commit', `${staged.length} staged`)}
          <Box flexDirection="column" paddingX={1} gap={1} marginTop={1}>
            <Input
              key="msg"
              placeholder="commit message"
              submitLabel="commit"
              value={v.msg}
              onInput={(text: string) => void set($, { msg: text })}
              onSubmit={(text: string) => void commit($, text)}
            />
            <Box flexDirection="row" gap={2} flexWrap="wrap">
              <Button key="commit" plain onPress={() => void commit($, v.msg)}>
                <Text backgroundColor={staged.length ? C.green : C.line} color={staged.length ? C.bg : C.muted} bold>
                  {` ✓ Commit ${staged.length} `}
                </Text>
              </Button>
              {atHome ? (
                <Button key="ask" plain onPress={() => void askClaude($)}>
                  <Text color={C.purple} bold>
                    ✦ Ask Claude to commit
                  </Text>
                </Button>
              ) : (
                <Text color={C.muted}>Ask Claude: only in this session's folder</Text>
              )}
            </Box>
          </Box>
        </Box>
      )
    }

    const worktreesTab = () => (
      <Box flexDirection="column">
        {section('Worktrees', v.worktrees.length)}
        {v.worktrees.map(w => {
          const isFocus = samePath(w.path, v.focus)
          const isHome = samePath(w.path, v.home)
          const rmKey = `rm:${w.path}`
          const merged = v.merged.includes(w.branch)
          return (
            <Box key={`wt-${w.path}`} flexDirection="column">
              <Box flexDirection="row" gap={1} paddingX={1} backgroundColor={isFocus ? C.sel : undefined}>
                <Box flexGrow={1} flexShrink={1}>
                  <Button key={`focus-${w.path}`} plain onPress={() => void set($, { focus: w.path, expanded: [], confirm: '' }).then(() => refresh($))}>
                    <Text color={isFocus ? C.pink : C.muted}>{isFocus ? '◆ ' : '◇ '}</Text>
                    <Text color={C.fg} bold={isFocus}>
                      {w.branch}
                    </Text>
                    {isHome ? <Text color={C.cyan}> session</Text> : null}
                  </Button>
                </Box>
                <Text color={w.dirty ? C.orange : C.muted}>{w.dirty ? `●${w.dirty}` : 'clean'}</Text>
                <Text>
                  <Text color={C.green}>↑{w.ahead}</Text> <Text color={behindColor(w.behind)}>↓{w.behind}</Text>
                </Text>
                {isHome ? null : (
                  <Button key={`rm-${w.path}`} plain onPress={() => void set($, { confirm: v.confirm === rmKey ? '' : rmKey, rmBranch: merged })}>
                    <Text color={C.red}>{v.confirm === rmKey ? 'cancel' : '✕'}</Text>
                  </Button>
                )}
              </Box>
              {v.confirm === rmKey ? (
                <Box flexDirection="column" borderStyle="round" borderColor={C.red} paddingX={1} marginX={1}>
                  <Text color={C.fg}>
                    Remove <Text bold>{w.path}</Text>
                  </Text>
                  {w.dirty ? <Text color={C.red}>{w.dirty} uncommitted files will be lost</Text> : null}
                  {merged ? (
                    <Button key={`rmb-${w.path}`} plain onPress={() => void set($, { rmBranch: !v.rmBranch })}>
                      <Text color={C.fg}>
                        {v.rmBranch ? '[x]' : '[ ]'} also delete branch {w.branch} <Text color={C.muted}>(merged)</Text>
                      </Text>
                    </Button>
                  ) : (
                    <Text color={C.muted}>Branch {w.branch} is not merged, so it is kept.</Text>
                  )}
                  <Button
                    key={`rmgo-${w.path}`}
                    plain
                    onPress={go('removing worktree', async cur => {
                      await git($, cur.home, ['worktree', 'remove', ...(w.dirty ? ['--force'] : []), w.path], { timeoutMs: 60_000 })
                      const del = merged && cur.rmBranch
                      if (del) await git($, cur.home, ['branch', '-d', w.branch])
                      if (samePath(cur.focus, w.path)) await set($, { focus: cur.home })
                      return `Removed ${w.path}${del ? ` and deleted ${w.branch}` : ''}`
                    })}
                  >
                    <Text backgroundColor={C.red} color={C.bg} bold>
                      {' Remove worktree '}
                    </Text>
                  </Button>
                </Box>
              ) : null}
            </Box>
          )
        })}
        {section('New worktree', '')}
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          <Input
            key="newwt"
            placeholder="feat/branch-name"
            submitLabel="create"
            value={v.newBranch}
            onInput={(text: string) => void set($, { newBranch: text })}
            onSubmit={(text: string) => void createWorktree($, text)}
          />
          <Text color={C.muted}>Off the default branch into .worktrees/, copies .env* files</Text>
        </Box>
      </Box>
    )

    const stashTab = () => (
      <Box flexDirection="column">
        {section('Stash', v.stash.length, chip('stash-push', 'stash push', C.cyan, go('stashing', async w => {
          await git($, w.focus, ['stash', 'push', '-u', '-m', `git-panel: ${w.head.branch}`])
          return 'Stashed all changes'
        })))}
        {v.stash.length ? null : <Text color={C.muted}>{'\n'}  No stashes.</Text>}
        {v.stash.map(s => (
          <Box key={`st-${s.ref}`} flexDirection="row" gap={1} paddingX={1}>
            <Box flexGrow={1} flexShrink={1}>
              <Text>
                <Text color={C.cyan}>{s.ref}</Text> <Text color={C.fg}>{s.message}</Text>
              </Text>
            </Box>
            {chip(`pop-${s.ref}`, 'pop', C.green, go('popping stash', async w => void (await git($, w.focus, ['stash', 'pop', s.ref]))))}
          </Box>
        ))}
      </Box>
    )

    return (
      <Box flexDirection="column" backgroundColor={C.bg} minHeight={Math.max(1, e.props.scroll?.bodyRows ?? 1)} paddingY={1}>
        <Box flexDirection="column" paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text bold>
              <Text color={C.purple}>⎇ </Text>
              <Text color={C.pink}>{v.head.branch || '…'}</Text>
            </Text>
            <Text bold>
              <Text color={C.green}>↑{v.head.ahead}</Text> <Text color={behindColor(v.head.behind)}>↓{v.head.behind}</Text>
            </Text>
          </Box>
          <Text color={C.muted} wrap="truncate-start">
            {atHome ? <Text color={C.cyan}>● session</Text> : `○ ${v.focus}`} · {v.head.upstream || 'no upstream'} · fetched{' '}
            {age < 0 ? 'never' : age === 0 ? 'just now' : `${age}m ago`}
          </Text>
          <Box flexDirection="row" columnGap={2} flexWrap="wrap" marginTop={1}>
            {chip('pull', '↓ pull', C.cyan, go('pulling', async w => void (await git($, w.focus, ['pull', '--ff-only'], { timeoutMs: 120_000 }))), String(v.head.behind))}
            {chip(
              'push',
              '↑ push',
              C.green,
              go('pushing', async w => {
                await git($, w.focus, w.head.upstream ? ['push'] : ['push', '-u', 'origin', 'HEAD'], { timeoutMs: 120_000 })
                return `Pushed ${w.head.branch}`
              }),
              String(v.head.ahead),
            )}
            {chip('fetch', '⟳ fetch', C.purple, () => void fetchAll($, false))}
            {chip('stash', '⊟ stash', C.orange, go('stashing', async w => void (await git($, w.focus, ['stash', 'push', '-u', '-m', `git-panel: ${w.head.branch}`]))))}
            {chip('pop', '⊞ pop', C.orange, go('popping stash', async w => void (await git($, w.focus, ['stash', 'pop']))), v.stash.length ? String(v.stash.length) : '')}
          </Box>
        </Box>
        <Box flexDirection="row" marginTop={1} paddingX={1}>
          {tab('changes', 'Changes', v.changes.length)}
          {tab('worktrees', 'Worktrees', v.worktrees.length)}
          {tab('stash', 'Stash', v.stash.length)}
        </Box>
        {busy ? <Text color={C.yellow}>{`  ⋯ ${v.busy}`}</Text> : null}
        {!busy && v.note ? <Text color={v.isError ? C.red : C.green}>{`  ${v.isError ? '✗' : '✓'} ${v.note}`}</Text> : null}
        {v.tab === 'changes' ? changesTab() : v.tab === 'worktrees' ? worktreesTab() : stashTab()}
      </Box>
    )
  })
}

async function commit($: $, message: string) {
  const v = await read($, view)
  if (!message.trim()) return set($, { note: 'Type a commit message first', isError: true })
  if (!v.changes.some(c => c.group === 'staged')) return set($, { note: 'Nothing staged: stage files with +', isError: true })
  await act($, 'committing', async w => {
    await git($, w.focus, ['commit', '-F', '-'], { stdin: message, timeoutMs: 60_000 })
    await set($, { msg: '' })
    return `Committed on ${w.head.branch}: ${message.trim().split('\n')[0]}`
  })
}

async function askClaude($: $) {
  await set($, { note: 'Asked Claude to commit', isError: false })
  await $.command.run({ command: 'commit' }).catch(() => $.prompt.submit({ text: 'Commit the current changes with a clear message.' }))
}

const changeOf = (v: View, k: string) => v.changes.find(c => keyOf(c) === k)

async function toggleDiff($: $, k: string) {
  const v = await read($, view)
  const c = changeOf(v, k)
  if (!c) return
  if (v.expanded.includes(k)) return set($, cur => ({ expanded: cur.expanded.filter(x => x !== k), menu: '' }))
  const diff = await diffOf($, v.focus, c)
  await set($, cur => ({ expanded: [...cur.expanded, k], diffs: { ...cur.diffs, [k]: diff }, menu: '' }))
}

const stageFile = ($: $, c: Change) => act($, 'staging', async w => void (await git($, w.focus, ['add', '--', c.path])))
const unstageFile = ($: $, c: Change) => act($, 'unstaging', async w => void (await git($, w.focus, ['restore', '--staged', '--', c.path])))

async function discardFile($: $, c: Change) {
  if (!(await armed($, `discard:${keyOf(c)}`))) return
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
  await set($, { menu: '', note: res.isCopied ? `Copied ${c.path}` : `Could not copy (${res.reason})`, isError: !res.isCopied })
}

async function askAbout($: $, c: Change) {
  const v = await read($, view)
  await set($, { menu: '' })
  const where = samePath(v.focus, v.home) ? '' : ` in the worktree at ${v.focus}`
  await $.prompt.submit({ text: `Explain my ${c.group} change to ${c.path}${where} (git diff${c.group === 'staged' ? ' --cached' : ''} -- ${c.path}) and flag anything risky.` })
}
