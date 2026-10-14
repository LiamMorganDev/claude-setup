import { expect, test } from 'claude-code/testing'

import { isBranchName, parseNumstat, parseStash, parseStatus, parseWorktrees, samePath, slugOf } from '../hooks/git'

test('parseStatus splits staged, unstaged and untracked, and reads ahead/behind', () => {
  const out = [
    '# branch.oid abc',
    '# branch.head main',
    '# branch.upstream origin/main',
    '# branch.ab +2 -3',
    '1 MM N... 100644 100644 100644 aaa bbb src/a file.ts',
    '1 A. N... 000000 100644 100644 000 ccc src/new.ts',
    '2 R. N... 100644 100644 100644 ddd eee R100 src/renamed.ts',
    'src/old.ts',
    '? notes.md',
    '',
  ].join('\0')
  const { head, changes } = parseStatus(out)
  expect(head).toEqual({ branch: 'main', upstream: 'origin/main', ahead: 2, behind: 3 })
  expect(changes.map(c => `${c.group}:${c.code}:${c.path}`)).toEqual([
    'staged:M:src/a file.ts',
    'unstaged:M:src/a file.ts',
    'staged:A:src/new.ts',
    'staged:R:src/renamed.ts',
    'untracked:?:notes.md',
  ])
})

test('parseNumstat reads counts, renames and binary files', () => {
  const out = ['3\t1\tsrc/a.ts', '-\t-\timg.png', '5\t0\t', 'old.ts', 'new.ts', ''].join('\0')
  const map = parseNumstat(out)
  expect(map.get('src/a.ts')).toEqual([3, 1])
  expect(map.get('img.png')).toEqual([0, 0])
  expect(map.get('new.ts')).toEqual([5, 0])
})

test('parseWorktrees lists branches and skips bare repos', () => {
  const out =
    'worktree D:/code/app\nHEAD 111\nbranch refs/heads/main\n\n' +
    'worktree D:/code/app/.worktrees/feat-x\nHEAD 222\nbranch refs/heads/feat/x\n\n' +
    'worktree D:/code/app/.worktrees/tmp\nHEAD 333\ndetached\n\nworktree D:/bare\nbare\n'
  expect(parseWorktrees(out).map(w => `${w.branch}@${w.path}`)).toEqual([
    'main@D:/code/app',
    'feat/x@D:/code/app/.worktrees/feat-x',
    '(detached)@D:/code/app/.worktrees/tmp',
  ])
})

test('parseStash, branch names, slugs and path compare', () => {
  expect(parseStash('stash@{0}\0WIP on main\nstash@{1}\0git-panel: feat\n')).toEqual([
    { ref: 'stash@{0}', message: 'WIP on main' },
    { ref: 'stash@{1}', message: 'git-panel: feat' },
  ])
  expect(isBranchName('feat/order-labels')).toBe(true)
  expect(isBranchName('bad..name')).toBe(false)
  expect(isBranchName('-x')).toBe(false)
  expect(isBranchName('a b')).toBe(false)
  expect(slugOf('feat/order-labels')).toBe('feat-order-labels')
  expect(samePath('D:\\code\\app\\', 'd:/code/app')).toBe(true)
})

for (const surface of ['desktop', 'terminal', 'vscode'] as const) {
  test(`pane draws its tabs on ${surface}`, async $ => {
    const drawn = await $.ui.mount({
      plugin: 'git-panel',
      surface,
      component: 'Pane',
      requestId: 'git-panel',
      props: { title: 'Git', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    expect(await drawn.find({ key: 'tab-changes' })).toBeDefined()
    expect(await drawn.find({ key: 'tab-worktrees' })).toBeDefined()
    await drawn.press({ key: 'tab-worktrees' })
    expect(await drawn.find({ key: 'newwt' })).toBeDefined()
  })
}

// Fake git: one repo at D:/repo with one modified file.
const GIT: Record<string, string> = {
  'rev-parse': 'D:/repo\n',
  worktree: 'worktree D:/repo\nHEAD 1\nbranch refs/heads/main\n\n',
  status: ['# branch.head main', '# branch.ab +0 -0', '1 .M N... 100644 100644 100644 a b src/a.ts', ''].join('\0'),
  diff: '2\t1\tsrc/a.ts\0',
}

for (const surface of ['desktop', 'terminal', 'vscode'] as const) {
  test(`clicking a file name opens its actions on ${surface}`, async ($, on) => {
    on('process.run', async (_$, e) => {
      const sub = e.argv.slice(3).find(a => !a.startsWith('-')) ?? ''
      const out = sub === 'diff' && e.argv.includes('--cached') ? '' : GIT[sub] ?? ''
      return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    })
    on('session.cwd', async () => ({ value: 'D:/repo' }))
    on('command.register', async (_$, e) => ({ value: { command: e.name } }))
    on('session.start', async () => ({ cwd: 'D:/repo' }))
    on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
    on('clock.every', async () => ({ value: undefined }) as never)
    on('clock.after', async () => ({ value: undefined }) as never)
    on('clock.now', async () => ({ value: 0 }))
    await $.session.start({ cwd: 'D:/repo', surface, isInteractive: true })
    const drawn = await $.ui.mount({
      plugin: 'git-panel',
      surface,
      component: 'Pane',
      requestId: 'git-panel',
      props: { title: 'Git', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    })
    const k = 'unstaged:src/a.ts'
    for (let i = 0; i < 20 && !(await drawn.find({ key: `stage-${k}` })); i++) await drawn.redraw()
    expect(await drawn.find({ key: `m-stage-${k}` })).toBeUndefined()
    await drawn.press({ key: `name-${k}` })
    expect(await drawn.find({ key: `m-stage-${k}` })).toBeDefined()
    expect(await drawn.find({ key: `m-discard-${k}` })).toBeDefined()
    expect(await drawn.find({ key: `m-ignore-${k}` })).toBeUndefined()
    await drawn.press({ key: `m-close-${k}` })
    expect(await drawn.find({ key: `m-stage-${k}` })).toBeUndefined()
  })
}
