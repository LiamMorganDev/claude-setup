import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Change, Tab, View } from '../types'
import { baseName, dirName, EMPTY_HEAD, isBranchName, parseNumstat, parseStash, parseStatus, parseWorktrees, samePath, slugOf } from './git'

const PANE = 'git-panel'
const FETCH_MS = 5 * 60_000
const UNTRACKED_COUNT_LIMIT = 40
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
  await set($, { busy: label, confirm: '', note: '', isError: false })
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

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (e.surface === 'mobile') return next(e)
    const { Box, Text, Button, Input, Code } = $.ui.resolve(e)
    if (e.surface === 'terminal' && e.props.placement === 'inline') {
      docked = false
      void $.ui.close({ id: PANE }).catch(() => undefined)
      return <Box />
    }
    const v = await read($, view)
    const busy = Boolean(v.busy)
    const atHome = samePath(v.focus, v.home)
    const go = (label: string, fn: (v: View) => Promise<string | void>) => () => void act($, label, fn)
    const tab = (t: Tab, label: string) => (
      <Button key={`tab-${t}`} variant={v.tab === t ? 'primary' : 'secondary'} label={label} onPress={() => void set($, { tab: t, confirm: '' })} />
    )
    const age = v.fetchedAt ? Math.max(0, Math.round(((await $.clock.now()) - v.fetchedAt) / 60_000)) : -1
    const staged = v.changes.filter(c => c.group === 'staged')

    const fileRow = (c: Change) => {
      const k = keyOf(c)
      const open = v.expanded.includes(k)
      const discardKey = `discard:${k}`
      const color = c.code === 'D' ? 'error' : c.code === 'A' || c.code === '?' ? 'success' : c.code === 'U' ? 'error' : 'warning'
      return (
        <Box key={k} flexDirection="column">
          <Box flexDirection="row" gap={1}>
            <Box flexGrow={1} flexShrink={1}>
              <Button
                key={`open-${k}`}
                plain
                onPress={() =>
                  void (async () => {
                    if (open) return set($, cur => ({ expanded: cur.expanded.filter(x => x !== k) }))
                    const diff = await diffOf($, v.focus, c)
                    await set($, cur => ({ expanded: [...cur.expanded, k], diffs: { ...cur.diffs, [k]: diff } }))
                  })()
                }
              >
                {open ? '▾ ' : '▸ '}
                <Text color={color} bold>{c.code === '?' ? 'U' : c.code}</Text> {baseName(c.path)} <Text dimColor>{dirName(c.path)}</Text>
              </Button>
            </Box>
            <Text>
              <Text color="success">+{c.add}</Text> <Text color="error">-{c.del}</Text>
            </Text>
            {c.group === 'staged' ? (
              <Button key={`unstage-${k}`} plain label="−" onPress={go('unstaging', async w => void (await git($, w.focus, ['restore', '--staged', '--', c.path])))} />
            ) : (
              <Button key={`stage-${k}`} plain label="+" onPress={go('staging', async w => void (await git($, w.focus, ['add', '--', c.path])))} />
            )}
            {c.group !== 'staged' && (
              <Button
                key={`discard-${k}`}
                plain
                label={v.confirm === discardKey ? 'sure?' : '↺'}
                onPress={() =>
                  void (async () => {
                    if (!(await armed($, discardKey))) return
                    await act($, 'discarding', async w => {
                      if (c.group === 'untracked') await git($, w.focus, ['clean', '-f', '--', c.path])
                      else await git($, w.focus, ['restore', '--', c.path])
                      return `Discarded ${c.path}`
                    })
                  })()
                }
              />
            )}
          </Box>
          {open && v.diffs[k] ? <Code source={v.diffs[k]} format="diff" path={c.path} /> : null}
        </Box>
      )
    }

    const group = (title: string, list: Change[], action: JSX.Element) =>
      list.length ? (
        <Box key={`g-${title}`} flexDirection="column" marginTop={1}>
          <Box flexDirection="row" justifyContent="space-between">
            <Text dimColor bold>
              {title.toUpperCase()} {list.length}
            </Text>
            {action}
          </Box>
          {list.map(fileRow)}
        </Box>
      ) : null

    const changesTab = () => {
      if (!v.changes.length) return <Text dimColor>Working tree clean. Nothing to commit.</Text>
      const unstaged = v.changes.filter(c => c.group === 'unstaged')
      const untracked = v.changes.filter(c => c.group === 'untracked')
      return (
        <Box flexDirection="column">
          {group('Staged', staged, <Button key="unstage-all" plain dimColor label="unstage all" onPress={go('unstaging', async w => void (await git($, w.focus, ['reset', '-q'])))} />)}
          {group('Changes', unstaged, <Button key="stage-all" plain dimColor label="stage all" onPress={go('staging', async w => void (await git($, w.focus, ['add', '-u'])))} />)}
          {group(
            'Untracked',
            untracked,
            <Button key="stage-untracked" plain dimColor label="stage all" onPress={go('staging', async w => void (await git($, w.focus, ['add', '--', ...untracked.map(c => c.path)])))} />,
          )}
          <Box flexDirection="column" marginTop={1}>
            <Input
              key="msg"
              label={`commit (${staged.length} staged) `}
              placeholder="message"
              submitLabel="commit"
              value={v.msg}
              onInput={(text: string) => void set($, { msg: text })}
              onSubmit={(text: string) => void commit($, text)}
            />
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button key="commit" variant="primary" label={`Commit ${staged.length}`} onPress={() => void commit($, v.msg)} />
              {atHome ? (
                <Button key="ask" label="Ask Claude to commit" onPress={() => void askClaude($)} />
              ) : (
                <Text dimColor>Ask Claude is off: not this session's folder.</Text>
              )}
            </Box>
          </Box>
        </Box>
      )
    }

    const worktreesTab = () => (
      <Box flexDirection="column">
        {v.worktrees.map(w => {
          const isFocus = samePath(w.path, v.focus)
          const isHome = samePath(w.path, v.home)
          const rmKey = `rm:${w.path}`
          const merged = v.merged.includes(w.branch)
          return (
            <Box key={`wt-${w.path}`} flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Box flexGrow={1} flexShrink={1}>
                  <Button key={`focus-${w.path}`} plain onPress={() => void set($, { focus: w.path, expanded: [], confirm: '' }).then(() => refresh($))}>
                    <Text color={isFocus ? 'suggestion' : undefined}>{isFocus ? '◆ ' : '◇ '}</Text>
                    {w.branch} {isHome ? <Text dimColor>(session)</Text> : null}{' '}
                    <Text color={w.dirty ? 'warning' : undefined} dimColor={!w.dirty}>
                      {w.dirty ? `●${w.dirty}` : 'clean'}
                    </Text>{' '}
                    <Text color="success">↑{w.ahead}</Text> <Text color={w.behind ? 'warning' : undefined} dimColor={!w.behind}>↓{w.behind}</Text>
                  </Button>
                </Box>
                {!isHome && (
                  <Button key={`rm-${w.path}`} plain label={v.confirm === rmKey ? 'cancel' : '✕'} onPress={() => void set($, { confirm: v.confirm === rmKey ? '' : rmKey, rmBranch: merged })} />
                )}
              </Box>
              {v.confirm === rmKey && (
                <Box flexDirection="column" borderStyle="round" borderColor="error" paddingX={1}>
                  <Text>
                    Remove {w.path}
                    {w.dirty ? <Text color="error"> — {w.dirty} uncommitted files will be lost</Text> : null}
                  </Text>
                  {merged ? (
                    <Button key={`rmb-${w.path}`} plain label={`${v.rmBranch ? '[x]' : '[ ]'} also delete branch ${w.branch} (merged)`} onPress={() => void set($, { rmBranch: !v.rmBranch })} />
                  ) : (
                    <Text dimColor>Branch {w.branch} is not merged, so it is kept.</Text>
                  )}
                  <Button
                    key={`rmgo-${w.path}`}
                    label="Remove worktree"
                    onPress={go('removing worktree', async cur => {
                      await git($, cur.home, ['worktree', 'remove', ...(w.dirty ? ['--force'] : []), w.path], { timeoutMs: 60_000 })
                      const del = merged && cur.rmBranch
                      if (del) await git($, cur.home, ['branch', '-d', w.branch])
                      if (samePath(cur.focus, w.path)) await set($, { focus: cur.home })
                      return `Removed ${w.path}${del ? ` and deleted ${w.branch}` : ''}`
                    })}
                  />
                </Box>
              )}
            </Box>
          )
        })}
        <Box marginTop={1}>
          <Input
            key="newwt"
            label="new worktree "
            placeholder="feat/branch-name"
            submitLabel="create"
            value={v.newBranch}
            onInput={(text: string) => void set($, { newBranch: text })}
            onSubmit={(text: string) => void createWorktree($, text)}
          />
        </Box>
        <Text dimColor>Branches off the default branch into .worktrees/, copies .env* files.</Text>
      </Box>
    )

    const stashTab = () => (
      <Box flexDirection="column">
        {v.stash.length ? null : <Text dimColor>No stashes.</Text>}
        {v.stash.map(s => (
          <Box key={`st-${s.ref}`} flexDirection="row" gap={1}>
            <Box flexGrow={1} flexShrink={1}>
              <Text>
                <Text color="suggestion">{s.ref}</Text> {s.message}
              </Text>
            </Box>
            <Button key={`pop-${s.ref}`} plain label="pop" onPress={go('popping stash', async w => void (await git($, w.focus, ['stash', 'pop', s.ref])))} />
          </Box>
        ))}
        <Box marginTop={1}>
          <Button
            key="stash-push"
            label="stash push (incl. untracked)"
            onPress={go('stashing', async w => {
              await git($, w.focus, ['stash', 'push', '-u', '-m', `git-panel: ${v.head.branch}`])
              return 'Stashed all changes'
            })}
          />
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>
            <Text color="suggestion">⎇ </Text>
            {v.head.branch || '…'}
          </Text>
          <Text>
            <Text color="success">↑{v.head.ahead}</Text> <Text color={v.head.behind ? 'warning' : undefined} dimColor={!v.head.behind}>↓{v.head.behind}</Text>
          </Text>
        </Box>
        <Text dimColor wrap="truncate-start">
          {atHome ? '● session' : `○ ${v.focus}`} · {v.head.upstream || 'no upstream'} · fetched {age < 0 ? 'never' : age === 0 ? 'just now' : `${age}m ago`}
        </Text>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="pull" label={`pull ↓${v.head.behind}`} onPress={go('pulling', async w => void (await git($, w.focus, ['pull', '--ff-only'], { timeoutMs: 120_000 })))} />
          <Button
            key="push"
            label={`push ↑${v.head.ahead}`}
            onPress={go('pushing', async w => {
              const args = w.head.upstream ? ['push'] : ['push', '-u', 'origin', 'HEAD']
              await git($, w.focus, args, { timeoutMs: 120_000 })
              return `Pushed ${w.head.branch}`
            })}
          />
          <Button key="fetch" label="fetch" onPress={() => void fetchAll($, false)} />
          <Button key="stash" label="stash" onPress={go('stashing', async w => void (await git($, w.focus, ['stash', 'push', '-u', '-m', `git-panel: ${w.head.branch}`])))} />
          <Button key="pop" label={`pop${v.stash.length ? ` (${v.stash.length})` : ''}`} onPress={go('popping stash', async w => void (await git($, w.focus, ['stash', 'pop'])))} />
        </Box>
        <Box flexDirection="row" gap={1} marginTop={1}>
          {tab('changes', `Changes ${v.changes.length}`)}
          {tab('worktrees', `Worktrees ${v.worktrees.length}`)}
          {tab('stash', `Stash ${v.stash.length}`)}
        </Box>
        {busy ? <Text color="suggestion">{v.busy}…</Text> : null}
        {!busy && v.note ? <Text color={v.isError ? 'error' : 'success'}>{v.note}</Text> : null}
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
